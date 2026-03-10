import { Api, FunctionImpl, GroupImpl, Impl } from "@confect/server";
import { Effect, Layer, Option } from "effect";
import type { GenericId as Id } from "convex/values";

import schema from "./schema";
import spec from "./spec";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import {
  ManualPatientSeedFields,
  PatientIdentifierSystem,
  RecordVsdSnapshotArgs,
  VsdSnapshotDocument,
} from "../src/domain/patients";
import {
  AddBillingLineItemArgs,
  CreateBillingCaseArgs,
  CreateDiagnosisArgs,
  ImportIcdCatalogEntriesArgs,
  PrepareKvdtExportArgs,
  RegisterMasterDataPackageArgs,
} from "../src/domain/billing-coding";

type PatientId = Id<"patients">;
type SnapshotId = Id<"vsdSnapshots">;
type BillingCaseId = Id<"billingCases">;
type DiagnosisId = Id<"diagnoses">;

const api = Api.make(schema, spec);

const formatDisplayName = (
  names: ReadonlyArray<{
    readonly family: string;
    readonly given: ReadonlyArray<string>;
  }>,
  fallback?: string,
) => {
  if (fallback) {
    return fallback;
  }
  const primaryName = names[0];
  if (!primaryName) {
    return "Unbekannt";
  }
  const given = primaryName.given.join(" ").trim();
  return [given, primaryName.family].filter(Boolean).join(" ").trim() || "Unbekannt";
};

const sourceStampFromSeed = (
  sourceKind: "manual" | "egk" | "kvk" | "eeb",
  capturedAt: string,
  sourcePath?: string,
) => ({
  sourceKind,
  ...(sourcePath ? { sourcePath } : {}),
  capturedAt,
});

const addressFromSnapshot = (
  payload: {
    readonly strasse3107?: string;
    readonly plz3112?: string;
    readonly ort3113?: string;
  },
) => {
  if (!payload.strasse3107 && !payload.plz3112 && !payload.ort3113) {
    return [] as const;
  }

  return [
    {
      line1:
        payload.strasse3107 ??
        [payload.plz3112, payload.ort3113].filter(Boolean).join(" "),
      ...(payload.ort3113 ? { city: payload.ort3113 } : {}),
      ...(payload.strasse3107 ? { streetName: payload.strasse3107 } : {}),
      ...(payload.plz3112 ? { postalCode: payload.plz3112 } : {}),
    },
  ];
};

const administrativeGenderFromSnapshot = (genderCode?: string) =>
  genderCode
    ? {
        system: "urn:kbv:administrative-gender",
        code: genderCode,
      }
    : undefined;

const calculateAgeAtDate = (
  birthDate?: string,
  referenceDate?: string,
): number | undefined => {
  if (!birthDate || !referenceDate) {
    return undefined;
  }

  const birth = new Date(birthDate);
  const reference = new Date(referenceDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) {
    return undefined;
  }

  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = reference.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && reference.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
};

const kvdtIssuesFromCase = ({
  diagnoses,
  lineItems,
  evaluations,
}: {
  diagnoses: ReadonlyArray<{
    readonly _id: DiagnosisId;
    readonly recordStatus: "active" | "cancelled" | "superseded";
    readonly isPrimary?: boolean;
  }>;
  lineItems: ReadonlyArray<unknown>;
  evaluations: ReadonlyArray<{
    readonly severity: "info" | "warning" | "error";
    readonly ruleCode: string;
    readonly message: string;
    readonly blocking: boolean;
  }>;
}) => {
  const issues: Array<{
    code: string;
    message: string;
    blocking: boolean;
  }> = [];

  const activeDiagnoses = diagnoses.filter(
    (diagnosis) => diagnosis.recordStatus === "active",
  );

  if (activeDiagnoses.length === 0) {
    issues.push({
      code: "KVDT_ACTIVE_DIAGNOSIS_REQUIRED",
      message: "At least one active diagnosis is required for KVDT export.",
      blocking: true,
    });
  }

  if (!activeDiagnoses.some((diagnosis) => diagnosis.isPrimary === true)) {
    issues.push({
      code: "KVDT_PRIMARY_DIAGNOSIS_MISSING",
      message: "A primary diagnosis is recommended for the billing case.",
      blocking: false,
    });
  }

  if (lineItems.length === 0) {
    issues.push({
      code: "KVDT_LINE_ITEM_REQUIRED",
      message: "At least one billing line item is required for export.",
      blocking: true,
    });
  }

  for (const evaluation of evaluations) {
    if (evaluation.blocking || evaluation.severity === "error") {
      issues.push({
        code: evaluation.ruleCode,
        message: evaluation.message,
        blocking: evaluation.blocking || evaluation.severity === "error",
      });
    }
  }

  return issues;
};

const createCodingEvaluationsForDiagnosis = ({
  diagnosisId,
  billingCaseId,
  patient,
  diagnosis,
  createdAt,
}: {
  diagnosisId: DiagnosisId;
  billingCaseId?: BillingCaseId;
  patient: {
    readonly birthDate?: string;
    readonly administrativeGender?: {
      readonly code: string;
    };
  };
  diagnosis: {
    readonly patientId: PatientId;
    readonly icdCode: string;
    readonly category: "acute" | "dauerdiagnose" | "anamnestisch";
    readonly diagnosensicherheit?: string;
    readonly isPrimary?: boolean;
  };
  createdAt: string;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const catalogEntries = yield* reader
      .table("icdCatalogEntries")
      .index("by_code")
      .collect();
    const catalogEntry = catalogEntries.find(
      (entry) => entry.code === diagnosis.icdCode,
    );

    const pendingEvaluations: Array<{
      patientId: PatientId;
      diagnosisId: DiagnosisId;
      billingCaseId?: BillingCaseId;
      ruleFamily: "sdicd" | "sdkh" | "sdkrw";
      severity: "info" | "warning" | "error";
      ruleCode: string;
      message: string;
      blocking: boolean;
      createdAt: string;
    }> = [];

    if (!catalogEntry) {
      pendingEvaluations.push({
        patientId: diagnosis.patientId,
        diagnosisId,
        ...(billingCaseId ? { billingCaseId } : {}),
        ruleFamily: "sdicd",
        severity: "error",
        ruleCode: "SDICD_CODE_UNKNOWN",
        message: `ICD code ${diagnosis.icdCode} is not present in the imported SDICD catalog.`,
        blocking: true,
        createdAt,
      });
    } else {
      if (!catalogEntry.isBillable) {
        pendingEvaluations.push({
          patientId: diagnosis.patientId,
          diagnosisId,
          ...(billingCaseId ? { billingCaseId } : {}),
          ruleFamily: "sdicd",
          severity: "warning",
          ruleCode: "SDICD_NOT_BILLABLE",
          message: `ICD code ${diagnosis.icdCode} is not marked billable in SDICD.`,
          blocking: false,
          createdAt,
        });
      }

      const ageAtReference = calculateAgeAtDate(patient.birthDate, createdAt);
      if (
        ageAtReference !== undefined &&
        catalogEntry.ageLower !== undefined &&
        ageAtReference < catalogEntry.ageLower
      ) {
        pendingEvaluations.push({
          patientId: diagnosis.patientId,
          diagnosisId,
          ...(billingCaseId ? { billingCaseId } : {}),
          ruleFamily: "sdicd",
          severity:
            catalogEntry.ageErrorType === "warning" ? "warning" : "error",
          ruleCode: "SDICD_AGE_TOO_LOW",
          message: `Patient age ${ageAtReference} is below the ICD lower bound ${catalogEntry.ageLower}.`,
          blocking: catalogEntry.ageErrorType !== "warning",
          createdAt,
        });
      }

      if (
        ageAtReference !== undefined &&
        catalogEntry.ageUpper !== undefined &&
        ageAtReference > catalogEntry.ageUpper
      ) {
        pendingEvaluations.push({
          patientId: diagnosis.patientId,
          diagnosisId,
          ...(billingCaseId ? { billingCaseId } : {}),
          ruleFamily: "sdicd",
          severity:
            catalogEntry.ageErrorType === "warning" ? "warning" : "error",
          ruleCode: "SDICD_AGE_TOO_HIGH",
          message: `Patient age ${ageAtReference} exceeds the ICD upper bound ${catalogEntry.ageUpper}.`,
          blocking: catalogEntry.ageErrorType !== "warning",
          createdAt,
        });
      }

      const patientGender = patient.administrativeGender?.code;
      if (
        patientGender &&
        catalogEntry.genderConstraint &&
        catalogEntry.genderConstraint !== patientGender
      ) {
        pendingEvaluations.push({
          patientId: diagnosis.patientId,
          diagnosisId,
          ...(billingCaseId ? { billingCaseId } : {}),
          ruleFamily: "sdicd",
          severity:
            catalogEntry.genderErrorType === "warning" ? "warning" : "error",
          ruleCode: "SDICD_GENDER_MISMATCH",
          message: `Patient gender ${patientGender} conflicts with ICD constraint ${catalogEntry.genderConstraint}.`,
          blocking: catalogEntry.genderErrorType !== "warning",
          createdAt,
        });
      }
    }

    if (
      diagnosis.category === "dauerdiagnose" &&
      diagnosis.diagnosensicherheit === undefined
    ) {
      pendingEvaluations.push({
        patientId: diagnosis.patientId,
        diagnosisId,
        ...(billingCaseId ? { billingCaseId } : {}),
        ruleFamily: "sdkh",
        severity: "warning",
        ruleCode: "SDKH_CHRONIC_CERTAINTY_MISSING",
        message:
          "Chronic diagnosis was recorded without diagnosensicherheit metadata.",
        blocking: false,
        createdAt,
      });
    }

    if (billingCaseId) {
      const caseDiagnoses = yield* reader
        .table("diagnoses")
        .index("by_patientId_and_recordStatus")
        .collect()
        .pipe(
          Effect.map((rows) =>
            rows.filter((row) => row.billingCaseId === billingCaseId),
          ),
        );

      const activeCaseDiagnoses = [
        ...caseDiagnoses,
        {
          billingCaseId,
          recordStatus: "active" as const,
          isPrimary: diagnosis.isPrimary,
        },
      ].filter((row) => row.recordStatus === "active");

      if (!activeCaseDiagnoses.some((row) => row.isPrimary === true)) {
        pendingEvaluations.push({
          patientId: diagnosis.patientId,
          diagnosisId,
          billingCaseId,
          ruleFamily: "sdkrw",
          severity: "warning",
          ruleCode: "SDKRW_PRIMARY_DIAGNOSIS_MISSING",
          message:
            "No active primary diagnosis is currently attached to this billing case.",
          blocking: false,
          createdAt,
        });
      }
    }

    const evaluationIds = [];
    for (const evaluation of pendingEvaluations) {
      const evaluationId = yield* writer
        .table("codingEvaluations")
        .insert(evaluation);
      evaluationIds.push(evaluationId);
    }

    return evaluationIds;
  });

const findPatientByKvid = (kvid10?: string) =>
  Effect.gen(function* () {
    if (!kvid10) {
      return Option.none();
    }

    const db = yield* DatabaseReader;
    const identifiers = yield* db
      .table("patientIdentifiers")
      .index("by_system_and_value")
      .collect();
    const existingIdentifier = identifiers.find(
      (identifier) =>
        identifier.system === PatientIdentifierSystem.Kvid10 &&
        identifier.value === kvid10,
    );

    return existingIdentifier
      ? Option.some(existingIdentifier.patientId)
      : Option.none();
  });

const upsertPatientIdentifier = ({
  patientId,
  system,
  value,
  identifier,
  capturedAt,
  sourceKind,
}: {
  patientId: PatientId;
  system: string;
  value: string;
  identifier: {
    readonly system: string;
    readonly value: string;
    readonly type?: {
      readonly system: string;
      readonly code: string;
      readonly display?: string;
      readonly version?: string;
      readonly userSelected?: boolean;
    };
    readonly use?: "usual" | "official" | "temp" | "secondary" | "old";
    readonly assignerDisplay?: string;
    readonly period?: {
      readonly start?: string;
      readonly end?: string;
    };
  };
  capturedAt: string;
  sourceKind: "manual" | "egk" | "kvk" | "eeb";
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const identifiers = yield* reader
      .table("patientIdentifiers")
      .index("by_system_and_value")
      .collect();
    const existing = identifiers.find(
      (identifierDoc) =>
        identifierDoc.system === system && identifierDoc.value === value,
    );

    if (existing) {
      const identifierDoc = existing;
      if (identifierDoc.patientId !== patientId) {
        yield* writer.table("patientIdentifiers").patch(identifierDoc._id, {
          patientId,
          isPrimary: true,
          sourceStamp: sourceStampFromSeed(sourceKind, capturedAt),
          verifiedAt: capturedAt,
        });
      }
      return identifierDoc._id;
    }

    return yield* writer.table("patientIdentifiers").insert({
      patientId,
      system,
      value,
      identifier,
      isPrimary: true,
      sourceStamp: sourceStampFromSeed(sourceKind, capturedAt),
      verifiedAt: capturedAt,
    });
  });

const upsertCoverageFromSnapshot = ({
  patientId,
  snapshot,
}: {
  patientId: PatientId;
  snapshot: typeof VsdSnapshotDocument.Type;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const existingCoverages = yield* reader
      .table("coverages")
      .index("by_patientId", (q) => q.eq("patientId", patientId))
      .collect();

    const kvid10 =
      snapshot.versichertenId3119 ?? snapshot.coveragePayload.versichertenId3119;
    const matchedCoverage = existingCoverages.find(
      (coverage) =>
        (kvid10 && coverage.kvid10 === kvid10) ||
        (!!snapshot.coveragePayload.kostentraegerkennung4133 &&
          coverage.kostentraegerkennung ===
            snapshot.coveragePayload.kostentraegerkennung4133),
    );

    const coveragePatch = {
      patientId,
      kind: "gkv" as const,
      ...(kvid10 ? { kvid10 } : {}),
      ...(snapshot.coveragePayload.versichertennummer3105
        ? {
            legacyInsuranceNumber:
              snapshot.coveragePayload.versichertennummer3105,
          }
        : {}),
      ...(snapshot.coveragePayload.kostentraegerkennung4133
        ? {
            kostentraegerkennung:
              snapshot.coveragePayload.kostentraegerkennung4133,
          }
        : {}),
      ...(snapshot.coveragePayload.kostentraegername4134
        ? { kostentraegerName: snapshot.coveragePayload.kostentraegername4134 }
        : {}),
      ...(snapshot.coveragePayload.versichertenart3108
        ? { versichertenart: snapshot.coveragePayload.versichertenart3108 }
        : {}),
      ...(snapshot.coveragePayload.versicherungsschutzEnde3116
        ? {
            period: {
              end: snapshot.coveragePayload.versicherungsschutzEnde3116,
            },
          }
        : {}),
      sourceVsdSnapshotId: snapshot._id,
      sourceStamp: sourceStampFromSeed(snapshot.readSource, snapshot.readAt),
    };

    if (matchedCoverage) {
      yield* writer.table("coverages").patch(matchedCoverage._id, coveragePatch);
      return {
        coverageId: matchedCoverage._id,
        coverageCreated: false,
      };
    }

    const coverageId = yield* writer.table("coverages").insert(coveragePatch);
    return {
      coverageId,
      coverageCreated: true,
    };
  });

const createManual = ({
  patient,
  primaryIdentifier,
}: {
  readonly patient: typeof ManualPatientSeedFields.Type;
  readonly primaryIdentifier?: {
    readonly system: string;
    readonly value: string;
    readonly type?: {
      readonly system: string;
      readonly code: string;
      readonly display?: string;
      readonly version?: string;
      readonly userSelected?: boolean;
    };
    readonly use?: "usual" | "official" | "temp" | "secondary" | "old";
    readonly assignerDisplay?: string;
    readonly period?: {
      readonly start?: string;
      readonly end?: string;
    };
  };
}) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    const patientId = yield* writer.table("patients").insert({
      status: "active",
      displayName: formatDisplayName(patient.names, patient.displayName),
      names: patient.names,
      ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
      ...(patient.administrativeGender
        ? { administrativeGender: patient.administrativeGender }
        : {}),
      addresses: patient.addresses,
      telecom: patient.telecom,
      ...(patient.generalPractitionerRoleId
        ? { generalPractitionerRoleId: patient.generalPractitionerRoleId }
        : {}),
      ...(patient.managingOrganizationId
        ? { managingOrganizationId: patient.managingOrganizationId }
        : {}),
      preferredLanguages: patient.preferredLanguages,
      sourceStamp: sourceStampFromSeed(
        "manual",
        patient.capturedAt,
        patient.sourcePath,
      ),
    });

    const primaryIdentifierId = primaryIdentifier
      ? yield* upsertPatientIdentifier({
          patientId,
          system: primaryIdentifier.system,
          value: primaryIdentifier.value,
          identifier: primaryIdentifier,
          capturedAt: patient.capturedAt,
          sourceKind: "manual",
        })
      : undefined;

    return {
      patientId,
      ...(primaryIdentifierId ? { primaryIdentifierId } : {}),
    };
  });

const getChart = ({ patientId }: { readonly patientId: PatientId }) =>
  Effect.gen(function* () {
    const db = yield* DatabaseReader;
    const patient = yield* db.table("patients").get(patientId).pipe(Effect.option);

    if (Option.isNone(patient)) {
      return { found: false as const };
    }

    const identifiers = yield* db
      .table("patientIdentifiers")
      .index("by_patientId_and_isPrimary")
      .collect()
      .pipe(
        Effect.map((rows) => rows.filter((row) => row.patientId === patientId)),
      );
    const coverages = yield* db
      .table("coverages")
      .index("by_patientId")
      .collect()
      .pipe(
        Effect.map((rows) => rows.filter((row) => row.patientId === patientId)),
      );

    return {
      found: true as const,
      patient: patient.value,
      identifiers,
      coverages,
    };
  });

const listByPatient = ({
  patientId,
}: {
  readonly patientId: PatientId;
}) =>
  Effect.gen(function* () {
    const db = yield* DatabaseReader;
    return yield* db
      .table("coverages")
      .index("by_patientId")
      .collect()
      .pipe(
        Effect.map((rows) => rows.filter((row) => row.patientId === patientId)),
      );
  });

const registerMasterDataPackage = (
  packageData: typeof RegisterMasterDataPackageArgs.Type,
) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const packageId = yield* writer.table("masterDataPackages").insert(packageData);
    return { packageId };
  });

const importIcdCatalogEntries = ({
  sourcePackageId,
  entries,
}: typeof ImportIcdCatalogEntriesArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const existingEntries = yield* reader
      .table("icdCatalogEntries")
      .index("by_sourcePackageId_and_code")
      .collect();

    const entryIds = [];
    for (const entry of entries) {
      const duplicate = existingEntries.find(
        (existing) =>
          existing.sourcePackageId === sourcePackageId &&
          existing.code === entry.code,
      );
      if (duplicate) {
        entryIds.push(duplicate._id);
        continue;
      }

      const entryId = yield* writer.table("icdCatalogEntries").insert({
        sourcePackageId,
        ...entry,
      });
      entryIds.push(entryId);
    }

    return {
      importedCount: entryIds.length,
      entryIds,
    };
  });

const createCase = (caseData: typeof CreateBillingCaseArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const billingCaseId = yield* writer.table("billingCases").insert(caseData);
    return { billingCaseId };
  });

const addLineItem = (lineItem: typeof AddBillingLineItemArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const billingLineItemId = yield* writer
      .table("billingLineItems")
      .insert(lineItem);
    return { billingLineItemId };
  });

const createDiagnosis = ({
  createdAt,
  ...diagnosis
}: typeof CreateDiagnosisArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const diagnosisId = yield* writer.table("diagnoses").insert({
      ...diagnosis,
      recordStatus: "active",
    });

    const patient = yield* reader.table("patients").get(diagnosis.patientId);
    const evaluationIds = yield* createCodingEvaluationsForDiagnosis({
      diagnosisId,
      billingCaseId: diagnosis.billingCaseId,
      patient,
      diagnosis,
      createdAt,
    });

    return {
      diagnosisId,
      evaluationIds,
    };
  });

const listDiagnoses = ({
  patientId,
  billingCaseId,
}: {
  readonly patientId: PatientId;
  readonly billingCaseId?: BillingCaseId;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const diagnoses = yield* reader
      .table("diagnoses")
      .index("by_patientId_and_recordStatus")
      .collect();

    return diagnoses.filter(
      (diagnosis) =>
        diagnosis.patientId === patientId &&
        (billingCaseId === undefined ||
          diagnosis.billingCaseId === billingCaseId),
    );
  });

const listEvaluationsByDiagnosis = ({
  diagnosisId,
}: {
  readonly diagnosisId: DiagnosisId;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const evaluations = yield* reader
      .table("codingEvaluations")
      .index("by_diagnosisId")
      .collect();
    return evaluations.filter((evaluation) => evaluation.diagnosisId === diagnosisId);
  });

const listEvaluationsByBillingCase = ({
  billingCaseId,
}: {
  readonly billingCaseId: BillingCaseId;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const evaluations = yield* reader
      .table("codingEvaluations")
      .index("by_billingCaseId_and_ruleFamily")
      .collect();
    return evaluations.filter(
      (evaluation) => evaluation.billingCaseId === billingCaseId,
    );
  });

const getCase = ({
  billingCaseId,
}: {
  readonly billingCaseId: BillingCaseId;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const billingCase = yield* reader
      .table("billingCases")
      .get(billingCaseId)
      .pipe(Effect.option);

    if (Option.isNone(billingCase)) {
      return { found: false as const };
    }

    const diagnoses = yield* reader
      .table("diagnoses")
      .index("by_patientId_and_recordStatus")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter((row) => row.billingCaseId === billingCaseId),
        ),
      );
    const lineItems = yield* reader
      .table("billingLineItems")
      .index("by_billingCaseId")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter((row) => row.billingCaseId === billingCaseId),
        ),
      );

    return {
      found: true as const,
      billingCase: billingCase.value,
      diagnoses,
      lineItems,
    };
  });

const listCases = ({
  patientId,
  quarter,
}: {
  readonly patientId: PatientId;
  readonly quarter?: string;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const cases = yield* reader
      .table("billingCases")
      .index("by_patientId_and_quarter")
      .collect();

    return cases.filter(
      (billingCase) =>
        billingCase.patientId === patientId &&
        (quarter === undefined || billingCase.quarter === quarter),
    );
  });

const getKvdtCaseView = ({
  billingCaseId,
}: {
  readonly billingCaseId: BillingCaseId;
}) =>
  Effect.gen(function* () {
    const caseResult = yield* getCase({ billingCaseId });
    if (!caseResult.found) {
      return { found: false as const };
    }

    const evaluations = yield* listEvaluationsByBillingCase({ billingCaseId });
    const issues = kvdtIssuesFromCase({
      diagnoses: caseResult.diagnoses,
      lineItems: caseResult.lineItems,
      evaluations,
    });

    return {
      found: true as const,
      billingCase: caseResult.billingCase,
      diagnoses: caseResult.diagnoses,
      lineItems: caseResult.lineItems,
      evaluations,
      issues,
      exportReady: !issues.some((issue) => issue.blocking),
    };
  });

const prepareKvdtExport = ({
  billingCaseId,
}: typeof PrepareKvdtExportArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const caseView = yield* getKvdtCaseView({ billingCaseId });

    if (!caseView.found) {
      return { outcome: "billing-case-not-found" as const };
    }

    if (caseView.exportReady) {
      yield* writer.table("billingCases").patch(billingCaseId, {
        status: "ready-for-export",
      });
      return {
        outcome: "ready" as const,
        billingCaseId,
        issues: caseView.issues,
      };
    }

    return {
      outcome: "blocked" as const,
      billingCaseId,
      issues: caseView.issues,
    };
  });

const recordSnapshot = (snapshot: typeof RecordVsdSnapshotArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const snapshotId = yield* writer.table("vsdSnapshots").insert(snapshot);
    return { snapshotId };
  });

const getSnapshot = ({
  snapshotId,
}: {
  readonly snapshotId: SnapshotId;
}) =>
  Effect.gen(function* () {
    const db = yield* DatabaseReader;
    const snapshot = yield* db
      .table("vsdSnapshots")
      .get(snapshotId)
      .pipe(Effect.option);

    return Option.match(snapshot, {
      onNone: () => ({ found: false as const }),
      onSome: (value) => ({ found: true as const, snapshot: value }),
    });
  });

const adoptSnapshot = ({
  snapshotId,
  existingPatientId,
  patientSeed,
}: {
  readonly snapshotId: SnapshotId;
  readonly existingPatientId?: PatientId;
  readonly patientSeed?: typeof ManualPatientSeedFields.Type;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const snapshotOption = yield* reader
      .table("vsdSnapshots")
      .get(snapshotId)
      .pipe(Effect.option);

    if (Option.isNone(snapshotOption)) {
      return { outcome: "snapshot-not-found" as const };
    }

    const snapshot = snapshotOption.value;
    const matchedByKvid = yield* findPatientByKvid(
      snapshot.versichertenId3119 ?? snapshot.coveragePayload.versichertenId3119,
    );

    let patientId = existingPatientId;
    let patientCreated = false;

    if (!patientId && snapshot.patientId) {
      patientId = snapshot.patientId;
    }

    if (!patientId && Option.isSome(matchedByKvid)) {
      patientId = matchedByKvid.value;
    }

    if (!patientId) {
      if (!patientSeed) {
        return { outcome: "needs-patient-seed" as const };
      }

      patientId = yield* writer.table("patients").insert({
        status: "active",
        displayName: formatDisplayName(
          patientSeed.names,
          patientSeed.displayName,
        ),
        names: patientSeed.names,
        ...(snapshot.coveragePayload.geburtsdatum3103
          ? { birthDate: snapshot.coveragePayload.geburtsdatum3103 }
          : patientSeed.birthDate
            ? { birthDate: patientSeed.birthDate }
            : {}),
        ...(administrativeGenderFromSnapshot(snapshot.coveragePayload.geschlecht3110)
          ? {
              administrativeGender: administrativeGenderFromSnapshot(
                snapshot.coveragePayload.geschlecht3110,
              ),
            }
          : patientSeed.administrativeGender
            ? { administrativeGender: patientSeed.administrativeGender }
            : {}),
        addresses: [
          ...addressFromSnapshot(snapshot.coveragePayload),
          ...patientSeed.addresses,
        ],
        telecom: patientSeed.telecom,
        ...(patientSeed.managingOrganizationId
          ? { managingOrganizationId: patientSeed.managingOrganizationId }
          : {}),
        preferredLanguages: patientSeed.preferredLanguages,
        sourceStamp: sourceStampFromSeed(
          snapshot.readSource,
          patientSeed.capturedAt,
          patientSeed.sourcePath,
        ),
      });
      patientCreated = true;
    }

    const kvid10 =
      snapshot.versichertenId3119 ?? snapshot.coveragePayload.versichertenId3119;
    const patientIdentifierId = kvid10
      ? yield* upsertPatientIdentifier({
          patientId,
          system: PatientIdentifierSystem.Kvid10,
          value: kvid10,
          identifier: {
            system: PatientIdentifierSystem.Kvid10,
            value: kvid10,
            use: "official",
          },
          capturedAt: snapshot.readAt,
          sourceKind: snapshot.readSource,
        })
      : undefined;

    if (snapshot.coveragePayload.versichertennummer3105) {
      yield* upsertPatientIdentifier({
        patientId,
        system: PatientIdentifierSystem.LegacyInsuranceNumber,
        value: snapshot.coveragePayload.versichertennummer3105,
        identifier: {
          system: PatientIdentifierSystem.LegacyInsuranceNumber,
          value: snapshot.coveragePayload.versichertennummer3105,
          use: "secondary",
        },
        capturedAt: snapshot.readAt,
        sourceKind: snapshot.readSource,
      });
    }

    const { coverageId, coverageCreated } = yield* upsertCoverageFromSnapshot({
      patientId,
      snapshot,
    });

    return {
      outcome: "adopted" as const,
      patientId,
      coverageId,
      ...(patientIdentifierId ? { patientIdentifierId } : {}),
      patientCreated,
      coverageCreated,
    };
  });

const patientsGroup = GroupImpl.make(api, "patients").pipe(
  Layer.provide([
      FunctionImpl.make(api, "patients", "createManual", createManual),
      FunctionImpl.make(api, "patients", "getChart", getChart),
  ]),
);

const coveragesGroup = GroupImpl.make(api, "coverages").pipe(
  Layer.provide([
      FunctionImpl.make(api, "coverages", "listByPatient", listByPatient),
  ]),
);

const vsdGroup = GroupImpl.make(api, "vsd").pipe(
  Layer.provide([
      FunctionImpl.make(api, "vsd", "recordSnapshot", recordSnapshot),
      FunctionImpl.make(api, "vsd", "getSnapshot", getSnapshot),
      FunctionImpl.make(api, "vsd", "adoptSnapshot", adoptSnapshot),
  ]),
);

const codingGroup = GroupImpl.make(api, "coding").pipe(
  Layer.provide([
    FunctionImpl.make(
      api,
      "coding",
      "registerMasterDataPackage",
      registerMasterDataPackage,
    ),
    FunctionImpl.make(
      api,
      "coding",
      "importIcdCatalogEntries",
      importIcdCatalogEntries,
    ),
    FunctionImpl.make(api, "coding", "createDiagnosis", createDiagnosis),
    FunctionImpl.make(api, "coding", "listDiagnoses", listDiagnoses),
    FunctionImpl.make(
      api,
      "coding",
      "listEvaluationsByDiagnosis",
      listEvaluationsByDiagnosis,
    ),
    FunctionImpl.make(
      api,
      "coding",
      "listEvaluationsByBillingCase",
      listEvaluationsByBillingCase,
    ),
  ]),
);

const billingGroup = GroupImpl.make(api, "billing").pipe(
  Layer.provide([
    FunctionImpl.make(api, "billing", "createCase", createCase),
    FunctionImpl.make(api, "billing", "addLineItem", addLineItem),
    FunctionImpl.make(
      api,
      "billing",
      "prepareKvdtExport",
      prepareKvdtExport,
    ),
    FunctionImpl.make(api, "billing", "getCase", getCase),
    FunctionImpl.make(api, "billing", "listCases", listCases),
    FunctionImpl.make(api, "billing", "getKvdtCaseView", getKvdtCaseView),
  ]),
);

const unfinalizedImpl = Impl.make(api).pipe(
  Layer.provide([
    patientsGroup,
    coveragesGroup,
    vsdGroup,
    codingGroup,
    billingGroup,
  ]),
) as any;

export default Impl.finalize(unfinalizedImpl);
