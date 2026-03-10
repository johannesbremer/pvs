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
import {
  AddMedicationPlanEntryArgs,
  CreateHeilmittelApprovalArgs,
  CreateHeilmittelOrderArgs,
  CreateMedicationOrderArgs,
  CreateMedicationPlanArgs,
  FinalizeHeilmittelOrderArgs,
  FinalizeMedicationOrderArgs,
  FormInstanceDocument,
  GetDraftWorkspaceArgs,
  GetDocumentArgs,
  GetHeilmittelOrderArgs,
  GetMedicationOrderArgs,
  ImportHeilmittelCatalogRefsArgs,
  ImportMedicationCatalogRefsArgs,
  ListDocumentsByPatientArgs,
  ListFormDefinitionsArgs,
  ListFormInstancesByPatientArgs,
  ListHeilmittelOrdersArgs,
  ListMedicationOrdersArgs,
  LookupHeilmittelByKeyArgs,
  LookupMedicationByPznArgs,
  PromoteDraftWorkspaceArgs,
  RegisterFormDefinitionArgs,
  SaveDraftWorkspaceArgs,
  WorkflowIssue,
} from "../src/domain/prescribing-documents";
import {
  BuildValidationPlanArgs,
  CreateEauDocumentArgs,
  ListOraclePluginsArgs,
  RenderEauDocumentArgs,
  RenderErpBundleArgs,
  RunValidationArgs,
  ValidationSummaryArgs,
} from "../src/domain/emission";
import { renderEauBundleXml, renderErpBundleXml } from "../src/codecs/xml/fhir";
import { buildOraclePlan, listOraclePlugins as listRegisteredOraclePlugins } from "../tools/oracles/framework";
import { buildAndExecuteOraclePlan, resolveOracleFamily } from "../tools/oracles/runtime";

type PatientId = Id<"patients">;
type SnapshotId = Id<"vsdSnapshots">;
type BillingCaseId = Id<"billingCases">;
type DiagnosisId = Id<"diagnoses">;
type MedicationOrderId = Id<"medicationOrders">;
type MedicationPlanId = Id<"medicationPlans">;
type HeilmittelOrderId = Id<"heilmittelOrders">;
type ClinicalDocumentId = Id<"clinicalDocuments">;
type DocumentRevisionId = Id<"documentRevisions">;
type ArtifactId = Id<"artifacts">;

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

const createArtifact = ({
  ownerKind,
  ownerId,
  direction,
  artifactFamily,
  artifactSubtype,
  transportKind,
  contentType,
  attachment,
  immutableAt,
  profileVersion,
  externalIdentifier,
  validationStatus = "pending" as const,
}: {
  ownerKind:
    | "documentRevision"
    | "billingCase"
    | "eebInboxItem"
    | "masterDataPackage"
    | "integrationJob";
  ownerId: string;
  direction: "inbound" | "outbound" | "internal";
  artifactFamily: string;
  artifactSubtype: string;
  transportKind: string;
  contentType: string;
  attachment: {
    readonly storageId: Id<"_storage">;
    readonly contentType: string;
    readonly byteSize: number;
    readonly sha256: string;
    readonly title?: string;
    readonly creationTime?: string;
  };
  immutableAt: string;
  profileVersion?: string;
  externalIdentifier?: string;
  validationStatus?: "pending" | "valid" | "invalid";
}) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table("artifacts").insert({
      ownerKind,
      ownerId,
      direction,
      artifactFamily,
      artifactSubtype,
      ...(profileVersion ? { profileVersion } : {}),
      transportKind,
      contentType,
      attachment,
      ...(externalIdentifier ? { externalIdentifier } : {}),
      validationStatus,
      immutableAt,
    });
  });

const issueFormInstanceForRevision = ({
  revisionId,
  patientId,
  subjectKind,
  subjectId,
  printForm,
}: {
  revisionId: DocumentRevisionId;
  patientId: PatientId;
  subjectKind:
    | "referral"
    | "heilmittel"
    | "billing"
    | "eau"
    | "prescription-print"
    | "other";
  subjectId?: string;
  printForm?: {
    readonly formDefinitionId: Id<"formDefinitions">;
    readonly issueDate: string;
    readonly issuerPractitionerRoleId?: Id<"practitionerRoles">;
    readonly issuingOrganizationId?: Id<"organizations">;
    readonly renderContextAttachment?: {
      readonly storageId: Id<"_storage">;
      readonly contentType: string;
      readonly byteSize: number;
      readonly sha256: string;
      readonly title?: string;
      readonly creationTime?: string;
    };
    readonly outputAttachment?: {
      readonly storageId: Id<"_storage">;
      readonly contentType: string;
      readonly byteSize: number;
      readonly sha256: string;
      readonly title?: string;
      readonly creationTime?: string;
    };
  };
}) =>
  Effect.gen(function* () {
    if (!printForm) {
      return {};
    }

    const writer = yield* DatabaseWriter;
    const renderContextArtifactId = printForm.renderContextAttachment
      ? yield* createArtifact({
          ownerKind: "documentRevision",
          ownerId: String(revisionId),
          direction: "internal",
          artifactFamily: "FORM_RENDER_CONTEXT",
          artifactSubtype: "json",
          transportKind: "print",
          contentType: printForm.renderContextAttachment.contentType,
          attachment: printForm.renderContextAttachment,
          immutableAt: `${printForm.issueDate}T00:00:00.000Z`,
        })
      : undefined;
    const outputArtifactId = printForm.outputAttachment
      ? yield* createArtifact({
          ownerKind: "documentRevision",
          ownerId: String(revisionId),
          direction: "outbound",
          artifactFamily: "FORM_OUTPUT",
          artifactSubtype: "print-output",
          transportKind: "print",
          contentType: printForm.outputAttachment.contentType,
          attachment: printForm.outputAttachment,
          immutableAt: `${printForm.issueDate}T00:00:00.000Z`,
        })
      : undefined;

    const formInstanceId = yield* writer.table("formInstances").insert({
      patientId,
      formDefinitionId: printForm.formDefinitionId,
      subjectKind,
      ...(subjectId ? { subjectId } : {}),
      status: "final",
      issueDate: printForm.issueDate,
      ...(printForm.issuerPractitionerRoleId
        ? { issuerPractitionerRoleId: printForm.issuerPractitionerRoleId }
        : {}),
      ...(printForm.issuingOrganizationId
        ? { issuingOrganizationId: printForm.issuingOrganizationId }
        : {}),
      ...(renderContextArtifactId ? { renderContextArtifactId } : {}),
      ...(outputArtifactId ? { outputArtifactId } : {}),
    });

    return {
      formInstanceId,
      ...(renderContextArtifactId ? { renderContextArtifactId } : {}),
      ...(outputArtifactId ? { outputArtifactId } : {}),
    };
  });

const issueDocumentRevision = ({
  patientId,
  kind,
  originInterface,
  status,
  effectiveDate,
  authorPractitionerId,
  authorOrganizationId,
  summary,
  artifact,
  artifactFamily,
  artifactSubtype,
  transportKind,
  contentType,
  profileVersion,
  patientPrint,
  printForm,
  formSubjectKind,
  formSubjectId,
}: {
  patientId: PatientId;
  kind:
    | "erp"
    | "evdga"
    | "eau"
    | "heilmittel"
    | "bfb-form"
    | "bmp-plan"
    | "vos"
    | "tss"
    | "archive-import"
    | "other";
  originInterface: string;
  status: "draft" | "final" | "cancelled" | "superseded" | "imported";
  effectiveDate: string;
  authorPractitionerId?: Id<"practitioners">;
  authorOrganizationId?: Id<"organizations">;
  summary: {
    readonly title?: string;
    readonly formCode?: string;
    readonly externalIdentifier?: string;
  };
  artifact: {
    readonly attachment: {
      readonly storageId: Id<"_storage">;
      readonly contentType: string;
      readonly byteSize: number;
      readonly sha256: string;
      readonly title?: string;
      readonly creationTime?: string;
    };
    readonly externalIdentifier?: string;
  };
  artifactFamily: string;
  artifactSubtype: string;
  transportKind: string;
  contentType: string;
  profileVersion?: string;
  patientPrint?: {
    readonly attachment: {
      readonly storageId: Id<"_storage">;
      readonly contentType: string;
      readonly byteSize: number;
      readonly sha256: string;
      readonly title?: string;
      readonly creationTime?: string;
    };
    readonly externalIdentifier?: string;
  };
  printForm?: {
    readonly formDefinitionId: Id<"formDefinitions">;
    readonly issueDate: string;
    readonly issuerPractitionerRoleId?: Id<"practitionerRoles">;
    readonly issuingOrganizationId?: Id<"organizations">;
    readonly renderContextAttachment?: {
      readonly storageId: Id<"_storage">;
      readonly contentType: string;
      readonly byteSize: number;
      readonly sha256: string;
      readonly title?: string;
      readonly creationTime?: string;
    };
    readonly outputAttachment?: {
      readonly storageId: Id<"_storage">;
      readonly contentType: string;
      readonly byteSize: number;
      readonly sha256: string;
      readonly title?: string;
      readonly creationTime?: string;
    };
  };
  formSubjectKind?:
    | "referral"
    | "heilmittel"
    | "billing"
    | "eau"
    | "prescription-print"
    | "other";
  formSubjectId?: string;
}) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const documentId = yield* writer.table("clinicalDocuments").insert({
      patientId,
      kind,
      originInterface,
      currentRevisionNo: 0,
      status: "draft",
    });

    const revisionId = yield* writer.table("documentRevisions").insert({
      documentId,
      revisionNo: 1,
      status,
      effectiveDate,
      ...(authorPractitionerId ? { authorPractitionerId } : {}),
      ...(authorOrganizationId ? { authorOrganizationId } : {}),
      summary,
    });

    const artifactId = yield* createArtifact({
      ownerKind: "documentRevision",
      ownerId: String(revisionId),
      direction: "outbound",
      artifactFamily,
      artifactSubtype,
      ...(profileVersion ? { profileVersion } : {}),
      transportKind,
      contentType,
      attachment: artifact.attachment,
      ...(artifact.externalIdentifier
        ? { externalIdentifier: artifact.externalIdentifier }
        : {}),
      immutableAt: effectiveDate,
    });

    const patientPrintArtifactId = patientPrint
      ? yield* createArtifact({
          ownerKind: "documentRevision",
          ownerId: String(revisionId),
          direction: "outbound",
          artifactFamily,
          artifactSubtype: "patient-print",
          transportKind: "print",
          contentType: patientPrint.attachment.contentType,
          attachment: patientPrint.attachment,
          ...(patientPrint.externalIdentifier
            ? { externalIdentifier: patientPrint.externalIdentifier }
            : {}),
          immutableAt: effectiveDate,
        })
      : undefined;

    const formResult =
      printForm && formSubjectKind
        ? yield* issueFormInstanceForRevision({
            revisionId,
            patientId,
            subjectKind: formSubjectKind,
            ...(formSubjectId ? { subjectId: formSubjectId } : {}),
            printForm,
          })
        : {};

    yield* writer.table("clinicalDocuments").patch(documentId, {
      currentRevisionNo: 1,
      status,
    });

    return {
      documentId,
      revisionId,
      artifactId,
      ...(patientPrintArtifactId ? { patientPrintArtifactId } : {}),
      ...formResult,
    };
  });

const medicationFinalizeIssues = (order: {
  readonly orderKind: "pzn" | "ingredient" | "compounding" | "freetext";
  readonly medicationCatalogRefId?: Id<"medicationCatalogRefs">;
  readonly freeTextMedication?: string;
  readonly multiplePrescription?: {
    readonly enabled: boolean;
    readonly seriesIdentifier?: string;
    readonly redeemFrom?: string;
    readonly redeemUntil?: string;
  };
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const issues: Array<typeof WorkflowIssue.Type> = [];

    if (order.orderKind === "pzn" && !order.medicationCatalogRefId) {
      issues.push({
        code: "ERP_MEDICATION_CATALOG_REF_REQUIRED",
        message: "PZN-based prescriptions require a medication catalog reference.",
        blocking: true,
      });
    }

    if (
      order.orderKind === "freetext" &&
      (!order.freeTextMedication || order.freeTextMedication.trim().length === 0)
    ) {
      issues.push({
        code: "ERP_FREETEXT_MEDICATION_REQUIRED",
        message: "Free-text prescriptions require a medication description.",
        blocking: true,
      });
    }

    if (order.medicationCatalogRefId) {
      const catalogRef = yield* reader
        .table("medicationCatalogRefs")
        .get(order.medicationCatalogRefId)
        .pipe(Effect.option);
      if (Option.isNone(catalogRef)) {
        issues.push({
          code: "ERP_MEDICATION_CATALOG_REF_UNKNOWN",
          message: "Medication catalog reference does not exist.",
          blocking: true,
        });
      }
    }

    if (
      order.multiplePrescription?.enabled &&
      (!order.multiplePrescription.seriesIdentifier ||
        !order.multiplePrescription.redeemFrom ||
        !order.multiplePrescription.redeemUntil)
    ) {
      issues.push({
        code: "ERP_MULTIPLE_PRESCRIPTION_METADATA_REQUIRED",
        message:
          "Multiple prescriptions require a series identifier and redeem interval.",
        blocking: true,
      });
    }

    return issues;
  });

const heilmittelFinalizeIssues = (order: {
  readonly patientId: PatientId;
  readonly issueDate: string;
  readonly diagnosegruppe: string;
  readonly heilmittelbereich: string;
  readonly diagnosisIds: ReadonlyArray<DiagnosisId>;
  readonly vorrangigeHeilmittelCodes: ReadonlyArray<string>;
  readonly ergaenzendeHeilmittelCodes: ReadonlyArray<string>;
  readonly blankoFlag?: boolean;
  readonly longTermNeedFlag?: boolean;
  readonly specialNeedFlag?: boolean;
  readonly approvalId?: Id<"heilmittelApprovals">;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const issues: Array<typeof WorkflowIssue.Type> = [];

    if (order.diagnosisIds.length === 0) {
      issues.push({
        code: "HEILMITTEL_DIAGNOSIS_REQUIRED",
        message: "Heilmittel orders require at least one linked diagnosis.",
        blocking: true,
      });
    }

    const requestedCodes = [
      ...order.vorrangigeHeilmittelCodes,
      ...order.ergaenzendeHeilmittelCodes,
    ];
    if (requestedCodes.length === 0) {
      issues.push({
        code: "HEILMITTEL_CODE_REQUIRED",
        message: "At least one Heilmittel code is required.",
        blocking: true,
      });
    }

    const catalogEntries = yield* reader
      .table("heilmittelCatalogRefs")
      .index("by_diagnosegruppe")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter(
            (row) =>
              row.diagnosegruppe === order.diagnosegruppe &&
              row.heilmittelbereich === order.heilmittelbereich,
          ),
        ),
      );

    for (const requestedCode of requestedCodes) {
      const catalogEntry = catalogEntries.find(
        (entry) => entry.heilmittelCode === requestedCode,
      );
      if (!catalogEntry) {
        issues.push({
          code: "HEILMITTEL_CATALOG_ENTRY_MISSING",
          message: `Heilmittel code ${requestedCode} is not available for the selected diagnosegruppe.`,
          blocking: true,
        });
        continue;
      }

      if (order.blankoFlag && catalogEntry.blankoEligible !== true) {
        issues.push({
          code: "HEILMITTEL_BLANKO_NOT_ELIGIBLE",
          message: `Heilmittel code ${requestedCode} is not blanko-eligible.`,
          blocking: true,
        });
      }
    }

    if ((order.longTermNeedFlag || order.specialNeedFlag) && !order.approvalId) {
      issues.push({
        code: "HEILMITTEL_APPROVAL_REQUIRED",
        message:
          "Special-need and long-term Heilmittel orders require an approval record.",
        blocking: true,
      });
    }

    if (order.approvalId) {
      const approvalOption = yield* reader
        .table("heilmittelApprovals")
        .get(order.approvalId)
        .pipe(Effect.option);

      if (Option.isNone(approvalOption)) {
        issues.push({
          code: "HEILMITTEL_APPROVAL_UNKNOWN",
          message: "Referenced Heilmittel approval does not exist.",
          blocking: true,
        });
      } else {
        const approval = approvalOption.value;
        if (approval.patientId !== order.patientId) {
          issues.push({
            code: "HEILMITTEL_APPROVAL_PATIENT_MISMATCH",
            message: "Heilmittel approval belongs to a different patient.",
            blocking: true,
          });
        }

        if (approval.validFrom && order.issueDate < approval.validFrom) {
          issues.push({
            code: "HEILMITTEL_APPROVAL_NOT_YET_VALID",
            message: "Heilmittel approval is not yet valid on the issue date.",
            blocking: true,
          });
        }

        if (approval.validTo && order.issueDate > approval.validTo) {
          issues.push({
            code: "HEILMITTEL_APPROVAL_EXPIRED",
            message: "Heilmittel approval has expired for the issue date.",
            blocking: true,
          });
        }

        if (
          approval.diagnosegruppen.length > 0 &&
          !approval.diagnosegruppen.includes(order.diagnosegruppe)
        ) {
          issues.push({
            code: "HEILMITTEL_APPROVAL_DIAGNOSEGRUPPE_MISMATCH",
            message:
              "Heilmittel approval does not cover the selected diagnosegruppe.",
            blocking: true,
          });
        }

        if (
          approval.heilmittelCodes.length > 0 &&
          !requestedCodes.some((code) => approval.heilmittelCodes.includes(code))
        ) {
          issues.push({
            code: "HEILMITTEL_APPROVAL_CODE_MISMATCH",
            message:
              "Heilmittel approval does not cover any of the selected Heilmittel codes.",
            blocking: true,
          });
        }
      }
    }

    return issues;
  });

const importMedicationCatalogRefs = ({
  sourcePackageId,
  entries,
}: typeof ImportMedicationCatalogRefsArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const entryIds = [];

    for (const entry of entries) {
      const entryId = yield* writer.table("medicationCatalogRefs").insert({
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

const lookupMedicationByPzn = ({
  pzn,
}: typeof LookupMedicationByPznArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const entries = yield* reader.table("medicationCatalogRefs").index("by_pzn").collect();
    const entry = entries.find((row) => row.pzn === pzn);

    if (!entry) {
      return { found: false as const };
    }

    return {
      found: true as const,
      entry,
    };
  });

const importHeilmittelCatalogRefs = ({
  sourcePackageId,
  entries,
}: typeof ImportHeilmittelCatalogRefsArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const entryIds = [];

    for (const entry of entries) {
      const entryId = yield* writer.table("heilmittelCatalogRefs").insert({
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

const lookupHeilmittelByKey = ({
  heilmittelbereich,
  heilmittelCode,
}: typeof LookupHeilmittelByKeyArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const entries = yield* reader
      .table("heilmittelCatalogRefs")
      .index("by_heilmittelbereich_and_heilmittelCode")
      .collect();
    const entry = entries.find(
      (row) =>
        row.heilmittelbereich === heilmittelbereich &&
        row.heilmittelCode === heilmittelCode,
    );

    if (!entry) {
      return { found: false as const };
    }

    return {
      found: true as const,
      entry,
    };
  });

const createMedicationOrder = (args: typeof CreateMedicationOrderArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const medicationOrderId = yield* writer.table("medicationOrders").insert(args);
    return { medicationOrderId };
  });

const getMedicationOrder = ({
  medicationOrderId,
}: typeof GetMedicationOrderArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const orderOption = yield* reader
      .table("medicationOrders")
      .get(medicationOrderId)
      .pipe(Effect.option);

    if (Option.isNone(orderOption)) {
      return { found: false as const };
    }

    return {
      found: true as const,
      order: orderOption.value,
    };
  });

const listMedicationOrdersByPatient = ({
  patientId,
  status,
}: typeof ListMedicationOrdersArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const orders = yield* reader
      .table("medicationOrders")
      .index("by_patientId_and_authoredOn")
      .collect();

    return orders
      .filter(
        (order) =>
          order.patientId === patientId &&
          (status === undefined || order.status === status),
      )
      .sort((left, right) => left.authoredOn.localeCompare(right.authoredOn));
  });

const finalizeMedicationOrder = ({
  medicationOrderId,
  finalizedAt,
  profileVersion,
  artifact,
  patientPrint,
  printForm,
}: typeof FinalizeMedicationOrderArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const orderOption = yield* reader
      .table("medicationOrders")
      .get(medicationOrderId)
      .pipe(Effect.option);

    if (Option.isNone(orderOption)) {
      return { outcome: "order-not-found" as const };
    }

    const order = orderOption.value;
    if (order.status !== "draft") {
      return {
        outcome: "not-draft" as const,
        medicationOrderId,
      };
    }

    const issues = yield* medicationFinalizeIssues(order);
    if (issues.some((issue) => issue.blocking)) {
      return {
        outcome: "blocked" as const,
        medicationOrderId,
        issues,
      };
    }

    const issued: {
      documentId: ClinicalDocumentId;
      revisionId: DocumentRevisionId;
      artifactId: Id<"artifacts">;
      patientPrintArtifactId?: Id<"artifacts">;
      formInstanceId?: Id<"formInstances">;
    } = yield* issueDocumentRevision({
      patientId: order.patientId,
      kind: "erp",
      originInterface: "ERP",
      status: "final",
      effectiveDate: finalizedAt,
      authorPractitionerId: order.signerPractitionerId ?? order.practitionerId,
      authorOrganizationId: order.organizationId,
      summary: {
        title:
          order.freeTextMedication ??
          (order.orderKind === "pzn" ? "eRezept" : "Medikationsverordnung"),
        ...(artifact.externalIdentifier
          ? { externalIdentifier: artifact.externalIdentifier }
          : {}),
      },
      artifact,
      artifactFamily: "ERP",
      artifactSubtype: "kbv-bundle-xml",
      transportKind: "fhir-bundle-xml",
      contentType: artifact.attachment.contentType,
      ...(profileVersion ? { profileVersion } : {}),
      ...(patientPrint ? { patientPrint } : {}),
      ...(printForm
        ? {
            printForm,
            formSubjectKind: "prescription-print" as const,
            formSubjectId: String(medicationOrderId),
          }
        : {}),
    });

    yield* writer.table("medicationOrders").patch(medicationOrderId, {
      status: "final",
      artifactDocumentId: issued.documentId,
    });

    return {
      outcome: "finalized" as const,
      medicationOrderId,
      documentId: issued.documentId,
      revisionId: issued.revisionId,
      artifactId: issued.artifactId,
      ...(issued.patientPrintArtifactId
        ? { patientPrintArtifactId: issued.patientPrintArtifactId }
        : {}),
      ...(issued.formInstanceId ? { formInstanceId: issued.formInstanceId } : {}),
    };
  });

const createMedicationPlan = (args: typeof CreateMedicationPlanArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const currentPlans = yield* reader
      .table("medicationPlans")
      .index("by_patientId_and_status")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter(
            (row) => row.patientId === args.patientId && row.status === "current",
          ),
        ),
      );

    for (const plan of currentPlans) {
      yield* writer.table("medicationPlans").patch(plan._id, {
        status: "superseded",
      });
    }

    const planId = yield* writer.table("medicationPlans").insert(args);
    return { planId };
  });

const addMedicationPlanEntry = (args: typeof AddMedicationPlanEntryArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const entryId = yield* writer.table("medicationPlanEntries").insert(args);
    return { entryId };
  });

const getCurrentPlan = ({ patientId }: { readonly patientId: PatientId }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const plans = yield* reader
      .table("medicationPlans")
      .index("by_patientId_and_status")
      .collect();
    const currentPlan = plans
      .filter((plan) => plan.patientId === patientId && plan.status === "current")
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .at(-1);

    if (!currentPlan) {
      return { found: false as const };
    }

    const entries = yield* reader
      .table("medicationPlanEntries")
      .index("by_planId_and_sortOrder")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows
            .filter((row) => row.planId === currentPlan._id)
            .sort((left, right) => left.sortOrder - right.sortOrder),
        ),
      );

    return {
      found: true as const,
      plan: currentPlan,
      entries,
    };
  });

const createHeilmittelApproval = (args: typeof CreateHeilmittelApprovalArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const approvalId = yield* writer.table("heilmittelApprovals").insert(args);
    return { approvalId };
  });

const createHeilmittelOrder = (args: typeof CreateHeilmittelOrderArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const heilmittelOrderId = yield* writer.table("heilmittelOrders").insert(args);
    return { heilmittelOrderId };
  });

const getHeilmittelOrder = ({
  heilmittelOrderId,
}: typeof GetHeilmittelOrderArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const orderOption = yield* reader
      .table("heilmittelOrders")
      .get(heilmittelOrderId)
      .pipe(Effect.option);

    if (Option.isNone(orderOption)) {
      return { found: false as const };
    }

    return {
      found: true as const,
      order: orderOption.value,
    };
  });

const listHeilmittelOrdersByPatient = ({
  patientId,
  status,
}: typeof ListHeilmittelOrdersArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const orders = yield* reader
      .table("heilmittelOrders")
      .index("by_patientId_and_issueDate")
      .collect();

    return orders
      .filter(
        (order) =>
          order.patientId === patientId &&
          (status === undefined || order.status === status),
      )
      .sort((left, right) => left.issueDate.localeCompare(right.issueDate));
  });

const finalizeHeilmittelOrder = ({
  heilmittelOrderId,
  finalizedAt,
  profileVersion,
  artifact,
  printForm,
}: typeof FinalizeHeilmittelOrderArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const orderOption = yield* reader
      .table("heilmittelOrders")
      .get(heilmittelOrderId)
      .pipe(Effect.option);

    if (Option.isNone(orderOption)) {
      return { outcome: "order-not-found" as const };
    }

    const order = orderOption.value;
    if (order.status !== "draft") {
      return {
        outcome: "not-draft" as const,
        heilmittelOrderId,
      };
    }

    const issues = yield* heilmittelFinalizeIssues(order);
    if (issues.some((issue) => issue.blocking)) {
      return {
        outcome: "blocked" as const,
        heilmittelOrderId,
        issues,
      };
    }

    const issued: {
      documentId: ClinicalDocumentId;
      revisionId: DocumentRevisionId;
      artifactId: Id<"artifacts">;
      patientPrintArtifactId?: Id<"artifacts">;
      formInstanceId?: Id<"formInstances">;
    } = yield* issueDocumentRevision({
      patientId: order.patientId,
      kind: "heilmittel",
      originInterface: "Heilmittel",
      status: "final",
      effectiveDate: finalizedAt,
      authorPractitionerId: order.practitionerId,
      authorOrganizationId: order.organizationId,
      summary: {
        title: `Heilmittel ${order.diagnosegruppe}`,
        ...(artifact.externalIdentifier
          ? { externalIdentifier: artifact.externalIdentifier }
          : {}),
      },
      artifact,
      artifactFamily: "Heilmittel",
      artifactSubtype: "heilmittel-order",
      transportKind: printForm ? "print" : "fhir-bundle-xml",
      contentType: artifact.attachment.contentType,
      ...(profileVersion ? { profileVersion } : {}),
      ...(printForm
        ? {
            printForm,
            formSubjectKind: "heilmittel" as const,
            formSubjectId: String(heilmittelOrderId),
          }
        : {}),
    });

    yield* writer.table("heilmittelOrders").patch(heilmittelOrderId, {
      status: "final",
      artifactDocumentId: issued.documentId,
    });

    return {
      outcome: "finalized" as const,
      heilmittelOrderId,
      documentId: issued.documentId,
      revisionId: issued.revisionId,
      artifactId: issued.artifactId,
      ...(issued.formInstanceId ? { formInstanceId: issued.formInstanceId } : {}),
    };
  });

const registerFormDefinition = (args: typeof RegisterFormDefinitionArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const formDefinitionId = yield* writer.table("formDefinitions").insert(args);
    return { formDefinitionId };
  });

const listFormDefinitions = ({
  theme,
  activeOnly,
}: typeof ListFormDefinitionsArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const definitions = yield* reader
      .table("formDefinitions")
      .index("by_theme_and_active")
      .collect();

    return definitions.filter(
      (definition) =>
        (theme === undefined || definition.theme === theme) &&
        (activeOnly !== true || definition.active),
    );
  });

const listFormInstancesByPatient = ({
  patientId,
  subjectKind,
}: typeof ListFormInstancesByPatientArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const instances = yield* reader
      .table("formInstances")
      .index("by_patientId_and_issueDate")
      .collect();

    return instances
      .filter(
        (instance) =>
          instance.patientId === patientId &&
          (subjectKind === undefined || instance.subjectKind === subjectKind),
      )
      .sort((left, right) => left.issueDate.localeCompare(right.issueDate));
  });

const getDocument = ({ documentId }: typeof GetDocumentArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const documentOption = yield* reader
      .table("clinicalDocuments")
      .get(documentId)
      .pipe(Effect.option);

    if (Option.isNone(documentOption)) {
      return { found: false as const };
    }

    const revisions = yield* reader
      .table("documentRevisions")
      .index("by_documentId_and_revisionNo")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows
            .filter((row) => row.documentId === documentId)
            .sort((left, right) => left.revisionNo - right.revisionNo),
        ),
      );

    const revisionIds = new Set(revisions.map((revision) => String(revision._id)));
    const artifacts = yield* reader
      .table("artifacts")
      .index("by_ownerKind_and_ownerId")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter(
            (row) =>
              row.ownerKind === "documentRevision" &&
              revisionIds.has(row.ownerId),
          ),
        ),
      );

    return {
      found: true as const,
      document: documentOption.value,
      revisions,
      artifacts,
    };
  });

const listDocumentsByPatient = ({
  patientId,
  kind,
}: typeof ListDocumentsByPatientArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const documents = yield* reader
      .table("clinicalDocuments")
      .index("by_patientId_and_kind")
      .collect();

    return documents.filter(
      (document) =>
        document.patientId === patientId &&
        (kind === undefined || document.kind === kind),
    );
  });

const saveWorkspace = ({
  ownerKind,
  ownerId,
  workflowKind,
  snapshot,
  schemaVersion,
  lastTouchedAt,
  lastTouchedBy,
  status,
}: typeof SaveDraftWorkspaceArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const existingWorkspace = yield* reader
      .table("draftWorkspaces")
      .index("by_ownerKind_and_ownerId")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.find(
            (row) =>
              row.ownerKind === ownerKind &&
              row.ownerId === ownerId &&
              row.workflowKind === workflowKind &&
              row.status !== "promoted",
          ),
        ),
      );

    if (existingWorkspace) {
      yield* writer.table("draftWorkspaces").patch(existingWorkspace._id, {
        snapshot,
        schemaVersion,
        lastTouchedAt,
        lastTouchedBy,
        status: status ?? "open",
      });
      return {
        draftWorkspaceId: existingWorkspace._id,
        created: false,
      };
    }

    const draftWorkspaceId = yield* writer.table("draftWorkspaces").insert({
      ownerKind,
      ownerId,
      workflowKind,
      status: status ?? "open",
      snapshot,
      schemaVersion,
      lastTouchedAt,
      lastTouchedBy,
    });

    return {
      draftWorkspaceId,
      created: true,
    };
  });

const getWorkspace = ({
  ownerKind,
  ownerId,
  workflowKind,
}: typeof GetDraftWorkspaceArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const workspaces = yield* reader
      .table("draftWorkspaces")
      .index("by_ownerKind_and_ownerId")
      .collect();
    const workspace = workspaces
      .filter(
        (row) =>
          row.ownerKind === ownerKind &&
          row.ownerId === ownerId &&
          row.workflowKind === workflowKind &&
          row.status !== "promoted",
      )
      .sort((left, right) => left.lastTouchedAt.localeCompare(right.lastTouchedAt))
      .at(-1);

    if (!workspace) {
      return { found: false as const };
    }

    return {
      found: true as const,
      draftWorkspace: workspace,
    };
  });

const promoteWorkspace = ({
  draftWorkspaceId,
  promotedAt,
  promotedBy,
}: typeof PromoteDraftWorkspaceArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const workspaceOption = yield* reader
      .table("draftWorkspaces")
      .get(draftWorkspaceId)
      .pipe(Effect.option);

    if (Option.isNone(workspaceOption)) {
      return { outcome: "draft-workspace-not-found" as const };
    }

    yield* writer.table("draftWorkspaces").patch(draftWorkspaceId, {
      status: "promoted",
      lastTouchedAt: promotedAt,
      lastTouchedBy: promotedBy,
    });

    return {
      outcome: "promoted" as const,
      draftWorkspaceId,
    };
  });

const toFhirReference = (
  table: string,
  id: string,
  display?: string,
) => ({
  reference: `${table}/${id}`,
  ...(display ? { display } : {}),
});

const toCoverageType = (kind: string) => ({
  coding: [
    {
      system: "urn:coverage-kind",
      code: kind,
    },
  ],
});

const buildErpPayload = ({
  medicationOrderId,
  profileVersion,
}: typeof RenderErpBundleArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const orderOption = yield* reader
      .table("medicationOrders")
      .get(medicationOrderId)
      .pipe(Effect.option);

    if (Option.isNone(orderOption)) {
      return { found: false as const };
    }

    const order = orderOption.value;
    const patient = yield* reader.table("patients").get(order.patientId);
    const practitioner = yield* reader.table("practitioners").get(order.practitionerId);
    const organization = yield* reader.table("organizations").get(order.organizationId);
    const coverage = yield* reader.table("coverages").get(order.coverageId);
    const identifiers = yield* reader
      .table("patientIdentifiers")
      .index("by_patientId_and_isPrimary")
      .collect()
      .pipe(Effect.map((rows) => rows.filter((row) => row.patientId === patient._id)));

    const medicationCatalogRef = order.medicationCatalogRefId
      ? yield* reader
          .table("medicationCatalogRefs")
          .get(order.medicationCatalogRefId)
          .pipe(Effect.option)
      : Option.none();

    const patientResource = {
      resourceType: "Patient" as const,
      id: String(patient._id),
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Patient"],
      },
      identifier: identifiers.map((identifier) => identifier.identifier),
      name: patient.names,
      ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
      ...(patient.administrativeGender?.code
        ? { gender: patient.administrativeGender.code }
        : {}),
      address: patient.addresses,
      telecom: patient.telecom,
    };

    const practitionerResource = {
      resourceType: "Practitioner" as const,
      id: String(practitioner._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner",
        ],
      },
      identifier: practitioner.lanr
        ? [
            {
              system: "urn:kbv:lanr",
              value: practitioner.lanr,
            },
          ]
        : [],
      name: practitioner.names,
    };

    const organizationResource = {
      resourceType: "Organization" as const,
      id: String(organization._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Organization",
        ],
      },
      identifier: organization.identifiers,
      name: organization.name,
      telecom: organization.telecom,
      address: organization.addresses,
    };

    const coverageResource = {
      resourceType: "Coverage" as const,
      id: String(coverage._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Coverage",
        ],
      },
      status: "active",
      type: toCoverageType(coverage.kind),
      beneficiary: toFhirReference("Patient", String(patient._id), patient.displayName),
      payor: [
        toFhirReference(
          "Organization",
          String(organization._id),
          coverage.kostentraegerName ?? organization.name,
        ),
      ],
    };

    const medicationDisplay =
      Option.isSome(medicationCatalogRef)
        ? medicationCatalogRef.value.displayName
        : order.freeTextMedication ?? "Medikation";
    const medicationResource = {
      resourceType: "Medication" as const,
      id: `medication-${String(medicationOrderId)}`,
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Medication"],
      },
      code: {
        coding: [
          {
            system: Option.isSome(medicationCatalogRef) ? "urn:pzn" : "urn:text",
            code:
              Option.isSome(medicationCatalogRef)
                ? medicationCatalogRef.value.pzn
                : order.freeTextMedication ?? medicationDisplay,
            display: medicationDisplay,
          },
        ],
        text: medicationDisplay,
      },
      ...(Option.isSome(medicationCatalogRef) &&
      medicationCatalogRef.value.packageSizeValue !== undefined
        ? {
            amount: {
              value: medicationCatalogRef.value.packageSizeValue,
              ...(medicationCatalogRef.value.packageSizeUnit
                ? { unit: medicationCatalogRef.value.packageSizeUnit }
                : {}),
            },
          }
        : {}),
    };

    const medicationRequestResource = {
      resourceType: "MedicationRequest" as const,
      id: `medication-request-${String(medicationOrderId)}`,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Medication_Request",
        ],
      },
      status: order.status === "cancelled" ? "cancelled" : "active",
      intent: "order",
      subject: toFhirReference("Patient", String(patient._id), patient.displayName),
      authoredOn: order.authoredOn,
      requester: toFhirReference(
        "Practitioner",
        String(practitioner._id),
        practitioner.displayName,
      ),
      insurance: [toFhirReference("Coverage", String(coverage._id))],
      medicationReference: toFhirReference(
        "Medication",
        `medication-${String(medicationOrderId)}`,
        medicationDisplay,
      ),
      dosageInstruction: order.dosageText
        ? [
            {
              text: order.dosageText,
            },
          ]
        : [],
    };

    const composition = {
      resourceType: "Composition" as const,
      id: `composition-${String(medicationOrderId)}`,
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Composition"],
      },
      status: "final",
      type: {
        coding: [
          {
            system: "http://loinc.org",
            code: "60590-7",
            display: "Medication prescription",
          },
        ],
      },
      date: order.authoredOn,
      title: "eRezept",
      subject: toFhirReference("Patient", String(patient._id), patient.displayName),
      author: [
        toFhirReference("Practitioner", String(practitioner._id), practitioner.displayName),
      ],
    };

    const bundle = {
      resourceType: "Bundle" as const,
      type: "document" as const,
      identifier: {
        system: "urn:ietf:rfc:3986",
        value: `urn:uuid:${String(medicationOrderId)}`,
      },
      timestamp: order.authoredOn,
      entry: [
        {
          fullUrl: `urn:uuid:${composition.id}`,
          resource: composition,
        },
        {
          fullUrl: `urn:uuid:${patientResource.id}`,
          resource: patientResource,
        },
        {
          fullUrl: `urn:uuid:${practitionerResource.id}`,
          resource: practitionerResource,
        },
        {
          fullUrl: `urn:uuid:${organizationResource.id}`,
          resource: organizationResource,
        },
        {
          fullUrl: `urn:uuid:${coverageResource.id}`,
          resource: coverageResource,
        },
        {
          fullUrl: `urn:uuid:${medicationResource.id}`,
          resource: medicationResource,
        },
        {
          fullUrl: `urn:uuid:${medicationRequestResource.id}`,
          resource: medicationRequestResource,
        },
      ],
    };

    const payload = {
      profileVersion: profileVersion ?? "1.4.1",
      composition,
      patient: patientResource,
      practitioner: practitionerResource,
      organization: organizationResource,
      coverage: coverageResource,
      medication: medicationResource,
      medicationRequest: medicationRequestResource,
      bundle,
    };

    return {
      found: true as const,
      payload,
      xml: {
        family: "ERP" as const,
        encoding: "UTF-8" as const,
        contentType: "application/fhir+xml" as const,
        boundaryKind: "emit-only" as const,
        xml: renderErpBundleXml(payload),
      },
      validationPlan:
        buildOraclePlan({
          family: "eRezept",
          ...(order.artifactDocumentId
            ? { documentId: String(order.artifactDocumentId) }
            : {}),
          profileVersion: profileVersion ?? "1.4.1",
        }) ?? undefined,
    };
  });

const buildEauPayload = ({
  documentId,
  encounterId,
  diagnosisIds,
  attesterPractitionerId,
  signerPractitionerId,
  organizationId,
  coverageId,
  profileVersion,
}: typeof RenderEauDocumentArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const documentOption = yield* reader
      .table("clinicalDocuments")
      .get(documentId)
      .pipe(Effect.option);
    if (Option.isNone(documentOption)) {
      return { found: false as const };
    }

    const encounter = yield* reader.table("encounters").get(encounterId);
    const patient = yield* reader.table("patients").get(encounter.patientId);
    const attester = yield* reader.table("practitioners").get(attesterPractitionerId);
    const signer = signerPractitionerId
      ? yield* reader
          .table("practitioners")
          .get(signerPractitionerId)
          .pipe(Effect.option)
      : Option.none();
    const organization = yield* reader.table("organizations").get(organizationId);
    const coverage = yield* reader.table("coverages").get(coverageId);
    const identifiers = yield* reader
      .table("patientIdentifiers")
      .index("by_patientId_and_isPrimary")
      .collect()
      .pipe(Effect.map((rows) => rows.filter((row) => row.patientId === patient._id)));
    const diagnoses = yield* reader
      .table("diagnoses")
      .index("by_patientId_and_recordStatus")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter(
            (row) =>
              row.patientId === patient._id &&
              diagnosisIds.includes(row._id) &&
              row.recordStatus === "active",
          ),
        ),
      );

    const patientResource = {
      resourceType: "Patient" as const,
      id: String(patient._id),
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Patient"],
      },
      identifier: identifiers.map((identifier) => identifier.identifier),
      name: patient.names,
      ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
      ...(patient.administrativeGender?.code
        ? { gender: patient.administrativeGender.code }
        : {}),
      address: patient.addresses,
      telecom: patient.telecom,
    };

    const practitionerResource = {
      resourceType: "Practitioner" as const,
      id: String(attester._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner",
        ],
      },
      identifier: attester.lanr
        ? [
            {
              system: "urn:kbv:lanr",
              value: attester.lanr,
            },
          ]
        : [],
      name: attester.names,
    };

    const organizationResource = {
      resourceType: "Organization" as const,
      id: String(organization._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Organization",
        ],
      },
      identifier: organization.identifiers,
      name: organization.name,
      telecom: organization.telecom,
      address: organization.addresses,
    };

    const coverageResource = {
      resourceType: "Coverage" as const,
      id: String(coverage._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Coverage",
        ],
      },
      status: "active",
      type: toCoverageType(coverage.kind),
      beneficiary: toFhirReference("Patient", String(patient._id), patient.displayName),
      payor: [
        toFhirReference(
          "Organization",
          String(organization._id),
          coverage.kostentraegerName ?? organization.name,
        ),
      ],
    };

    const encounterResource = {
      resourceType: "Encounter" as const,
      id: String(encounter._id),
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_AU_Encounter"],
      },
      status: encounter.end ? "finished" : "in-progress",
      class: {
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
        code: "AMB",
      },
      subject: toFhirReference("Patient", String(patient._id), patient.displayName),
      period: {
        start: encounter.start,
        ...(encounter.end ? { end: encounter.end } : {}),
      },
    };

    const conditionResources = diagnoses.map((diagnosis) => ({
      resourceType: "Condition" as const,
      id: `condition-${String(diagnosis._id)}`,
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_AU_Condition"],
      },
      code: {
        coding: [diagnosis.icd10gm],
        ...(diagnosis.diagnoseklartext
          ? { text: diagnosis.diagnoseklartext }
          : {}),
      },
      subject: toFhirReference("Patient", String(patient._id), patient.displayName),
      encounter: toFhirReference("Encounter", String(encounter._id)),
      recordedDate: encounter.start,
    }));

    const composition = {
      resourceType: "Composition" as const,
      id: `composition-${String(documentId)}`,
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_EAU_Composition"],
      },
      status: "final",
      type: {
        coding: [
          {
            system: "http://loinc.org",
            code: "11488-4",
            display: "Consult note",
          },
        ],
      },
      date: encounter.start,
      title: "eAU",
      subject: toFhirReference("Patient", String(patient._id), patient.displayName),
      author: [
        toFhirReference("Practitioner", String(attester._id), attester.displayName),
        ...(Option.isSome(signer)
          ? [
              toFhirReference(
                "Practitioner",
                String(signer.value._id),
                signer.value.displayName,
              ),
            ]
          : []),
      ],
    };

    const bundle = {
      resourceType: "Bundle" as const,
      type: "document" as const,
      identifier: {
        system: "urn:ietf:rfc:3986",
        value: `urn:uuid:${String(documentId)}`,
      },
      timestamp: encounter.start,
      entry: [
        {
          fullUrl: `urn:uuid:${composition.id}`,
          resource: composition,
        },
        {
          fullUrl: `urn:uuid:${patientResource.id}`,
          resource: patientResource,
        },
        {
          fullUrl: `urn:uuid:${practitionerResource.id}`,
          resource: practitionerResource,
        },
        {
          fullUrl: `urn:uuid:${organizationResource.id}`,
          resource: organizationResource,
        },
        {
          fullUrl: `urn:uuid:${coverageResource.id}`,
          resource: coverageResource,
        },
        {
          fullUrl: `urn:uuid:${encounterResource.id}`,
          resource: encounterResource,
        },
        ...conditionResources.map((condition) => ({
          fullUrl: `urn:uuid:${condition.id}`,
          resource: condition,
        })),
      ],
    };

    const payload = {
      profileVersion: profileVersion ?? "1.2.1",
      composition,
      patient: patientResource,
      practitioner: practitionerResource,
      organization: organizationResource,
      coverage: coverageResource,
      encounter: encounterResource,
      conditions: conditionResources,
      bundle,
    };

    return {
      found: true as const,
      payload,
      xml: {
        family: "EAU" as const,
        encoding: "UTF-8" as const,
        contentType: "application/fhir+xml" as const,
        boundaryKind: "emit-only" as const,
        xml: renderEauBundleXml(payload),
      },
      validationPlan:
        buildOraclePlan({
          family: "eAU",
          documentId: String(documentId),
          profileVersion: profileVersion ?? "1.2.1",
        }) ?? undefined,
    };
  });

const renderErpBundle = buildErpPayload;

const createEauDocument = ({
    patientId,
    encounterId,
    diagnosisIds,
    attesterPractitionerId,
    signerPractitionerId,
    organizationId,
    coverageId,
    finalizedAt,
    profileVersion,
    artifact,
    patientView,
    employerView,
    insurerView,
  }: typeof CreateEauDocumentArgs.Type) =>
  Effect.gen(function* () {
    const issued = yield* issueDocumentRevision({
      patientId,
      kind: "eau",
      originInterface: "EAU",
      status: "final",
      effectiveDate: finalizedAt,
      authorPractitionerId: signerPractitionerId ?? attesterPractitionerId,
      authorOrganizationId: organizationId,
      summary: {
        title: "eAU",
        ...(artifact.externalIdentifier
          ? { externalIdentifier: artifact.externalIdentifier }
          : {}),
      },
      artifact,
      artifactFamily: "EAU",
      artifactSubtype: "kbv-bundle-xml",
      transportKind: "fhir-bundle-xml",
      contentType: artifact.attachment.contentType,
      ...(profileVersion ? { profileVersion } : {}),
    });

    const patientViewArtifactId = patientView
      ? yield* createArtifact({
          ownerKind: "documentRevision",
          ownerId: String(issued.revisionId),
          direction: "outbound",
          artifactFamily: "EAU",
          artifactSubtype: "patient-view",
          transportKind: "pdfa",
          contentType: patientView.attachment.contentType,
          attachment: patientView.attachment,
          ...(patientView.externalIdentifier
            ? { externalIdentifier: patientView.externalIdentifier }
            : {}),
          immutableAt: finalizedAt,
        })
      : undefined;

    const employerViewArtifactId = employerView
      ? yield* createArtifact({
          ownerKind: "documentRevision",
          ownerId: String(issued.revisionId),
          direction: "outbound",
          artifactFamily: "EAU",
          artifactSubtype: "employer-view",
          transportKind: "pdfa",
          contentType: employerView.attachment.contentType,
          attachment: employerView.attachment,
          ...(employerView.externalIdentifier
            ? { externalIdentifier: employerView.externalIdentifier }
            : {}),
          immutableAt: finalizedAt,
        })
      : undefined;

    const insurerViewArtifactId = insurerView
      ? yield* createArtifact({
          ownerKind: "documentRevision",
          ownerId: String(issued.revisionId),
          direction: "outbound",
          artifactFamily: "EAU",
          artifactSubtype: "insurer-view",
          transportKind: "pdfa",
          contentType: insurerView.attachment.contentType,
          attachment: insurerView.attachment,
          ...(insurerView.externalIdentifier
            ? { externalIdentifier: insurerView.externalIdentifier }
            : {}),
          immutableAt: finalizedAt,
        })
      : undefined;

    const renderResult = yield* buildEauPayload({
      documentId: issued.documentId,
      encounterId,
      diagnosisIds,
      attesterPractitionerId,
      ...(signerPractitionerId ? { signerPractitionerId } : {}),
      organizationId,
      coverageId,
      ...(profileVersion ? { profileVersion } : {}),
    });

    const validationSummary =
      renderResult.found && renderResult.validationPlan
        ? `Planned ${renderResult.validationPlan.family} validation for ${renderResult.validationPlan.profileVersion ?? "default profile"}.`
        : "Validation plan unavailable.";

    const writer = yield* DatabaseWriter;
    yield* writer.table("artifacts").patch(issued.artifactId, {
      validationStatus: renderResult.found ? "pending" : "invalid",
      validationSummary,
    });

    return {
      documentId: issued.documentId,
      revisionId: issued.revisionId,
      artifactId: issued.artifactId,
      ...(patientViewArtifactId ? { patientViewArtifactId } : {}),
      ...(employerViewArtifactId ? { employerViewArtifactId } : {}),
      ...(insurerViewArtifactId ? { insurerViewArtifactId } : {}),
    };
  });

const renderEauDocument = buildEauPayload;

const listOraclePlugins = ({ family }: typeof ListOraclePluginsArgs.Type) =>
  Effect.succeed(
    listRegisteredOraclePlugins().filter(
      (plugin) => family === undefined || plugin.family === family,
    ),
  );

const buildValidationPlan = ({
    family,
    artifactId,
    documentId,
    profileVersion,
  }: typeof BuildValidationPlanArgs.Type) =>
  Effect.succeed(
    (() => {
      const plan = buildOraclePlan({
        family,
        ...(artifactId ? { artifactId: String(artifactId) } : {}),
        ...(documentId ? { documentId: String(documentId) } : {}),
        ...(profileVersion ? { profileVersion } : {}),
      });
      if (!plan) {
        return { found: false as const };
      }
      return { found: true as const, plan };
    })(),
  );

const getValidationSummary = ({ artifactId }: typeof ValidationSummaryArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const artifact = yield* reader.table("artifacts").get(artifactId).pipe(Effect.option);
    if (Option.isNone(artifact)) {
      return { found: false as const };
    }

    return {
      found: true as const,
      validationStatus: artifact.value.validationStatus,
      ...(artifact.value.validationSummary
        ? { validationSummary: artifact.value.validationSummary }
        : {}),
    };
  });

const runValidation = ({
  artifactId,
  family,
  documentId,
  profileVersion,
  payloadPreviewXml,
  payloadPreview,
}: typeof RunValidationArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const artifactOption = yield* reader
      .table("artifacts")
      .get(artifactId)
      .pipe(Effect.option);

    if (Option.isNone(artifactOption)) {
      return { outcome: "artifact-not-found" as const };
    }

    const artifact = artifactOption.value;
    const resolvedFamily = family ?? resolveOracleFamily(artifact.artifactFamily);
    if (!resolvedFamily) {
      return { outcome: "no-oracle-plan" as const };
    }

    const executed = buildAndExecuteOraclePlan({
      family: resolvedFamily,
      artifactId: String(artifactId),
      ...(documentId ? { documentId: String(documentId) } : {}),
      ...(profileVersion ? { profileVersion } : {}),
      ...(payloadPreviewXml ? { payloadPreviewXml } : {}),
      ...(payloadPreview ? { payloadPreview } : {}),
    });

    if (!executed) {
      return { outcome: "no-oracle-plan" as const };
    }

    const validationStatus = executed.report.passed ? "valid" : "invalid";
    yield* writer.table("artifacts").patch(artifactId, {
      validationStatus,
      validationSummary: executed.report.summary,
    });

    return {
      outcome: "completed" as const,
      plan: executed.plan,
      report: executed.report,
      validationStatus,
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

const catalogGroup = GroupImpl.make(api, "catalog").pipe(
  Layer.provide([
    FunctionImpl.make(
      api,
      "catalog",
      "importMedicationCatalogRefs",
      importMedicationCatalogRefs,
    ),
    FunctionImpl.make(
      api,
      "catalog",
      "lookupMedicationByPzn",
      lookupMedicationByPzn,
    ),
    FunctionImpl.make(
      api,
      "catalog",
      "importHeilmittelCatalogRefs",
      importHeilmittelCatalogRefs,
    ),
    FunctionImpl.make(
      api,
      "catalog",
      "lookupHeilmittelByKey",
      lookupHeilmittelByKey,
    ),
  ]),
);

const prescriptionsGroup = GroupImpl.make(api, "prescriptions").pipe(
  Layer.provide([
    FunctionImpl.make(api, "prescriptions", "createOrder", createMedicationOrder),
    FunctionImpl.make(api, "prescriptions", "getOrder", getMedicationOrder),
    FunctionImpl.make(
      api,
      "prescriptions",
      "listOrdersByPatient",
      listMedicationOrdersByPatient,
    ),
    FunctionImpl.make(api, "prescriptions", "finalizeOrder", finalizeMedicationOrder),
    FunctionImpl.make(api, "prescriptions", "renderErpBundle", renderErpBundle),
    FunctionImpl.make(
      api,
      "prescriptions",
      "createMedicationPlan",
      createMedicationPlan,
    ),
    FunctionImpl.make(api, "prescriptions", "addPlanEntry", addMedicationPlanEntry),
    FunctionImpl.make(api, "prescriptions", "getCurrentPlan", getCurrentPlan),
  ]),
);

const heilmittelGroup = GroupImpl.make(api, "heilmittel").pipe(
  Layer.provide([
    FunctionImpl.make(api, "heilmittel", "createApproval", createHeilmittelApproval),
    FunctionImpl.make(api, "heilmittel", "createOrder", createHeilmittelOrder),
    FunctionImpl.make(api, "heilmittel", "getOrder", getHeilmittelOrder),
    FunctionImpl.make(
      api,
      "heilmittel",
      "listOrdersByPatient",
      listHeilmittelOrdersByPatient,
    ),
    FunctionImpl.make(api, "heilmittel", "finalizeOrder", finalizeHeilmittelOrder),
  ]),
);

const documentsGroup = GroupImpl.make(api, "documents").pipe(
  Layer.provide([
    FunctionImpl.make(
      api,
      "documents",
      "registerFormDefinition",
      registerFormDefinition,
    ),
    FunctionImpl.make(api, "documents", "listFormDefinitions", listFormDefinitions),
    FunctionImpl.make(api, "documents", "createEauDocument", createEauDocument),
    FunctionImpl.make(api, "documents", "renderEauDocument", renderEauDocument),
    FunctionImpl.make(
      api,
      "documents",
      "listFormInstancesByPatient",
      listFormInstancesByPatient,
    ),
    FunctionImpl.make(api, "documents", "getDocument", getDocument),
    FunctionImpl.make(api, "documents", "listByPatient", listDocumentsByPatient),
  ]),
);

const draftsGroup = GroupImpl.make(api, "drafts").pipe(
  Layer.provide([
    FunctionImpl.make(api, "drafts", "saveWorkspace", saveWorkspace),
    FunctionImpl.make(api, "drafts", "getWorkspace", getWorkspace),
    FunctionImpl.make(api, "drafts", "promoteWorkspace", promoteWorkspace),
  ]),
);

const integrationGroup = GroupImpl.make(api, "integration").pipe(
  Layer.provide([
    FunctionImpl.make(api, "integration", "listOraclePlugins", listOraclePlugins),
    FunctionImpl.make(api, "integration", "buildValidationPlan", buildValidationPlan),
    FunctionImpl.make(api, "integration", "getValidationSummary", getValidationSummary),
    FunctionImpl.make(api, "integration", "runValidation", runValidation),
  ]),
);

const unfinalizedImpl = Impl.make(api).pipe(
  Layer.provide([
    patientsGroup,
    coveragesGroup,
    vsdGroup,
    codingGroup,
    billingGroup,
    catalogGroup,
    prescriptionsGroup,
    heilmittelGroup,
    documentsGroup,
    draftsGroup,
    integrationGroup,
  ]),
) as any;

export default Impl.finalize(unfinalizedImpl);
