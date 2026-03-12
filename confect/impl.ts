import type { GenericId as Id } from "convex/values";

import { Api, FunctionImpl, GroupImpl, Impl } from "@confect/server";
import { Effect, Layer, Option } from "effect";

import {
  renderEauBundleXml,
  renderErpBundleXml,
  renderEvdgaBundleXml,
} from "../src/codecs/xml/fhir";
import { parseOfficialTssSearchsetXml } from "../src/codecs/xml/tss";
import {
  BookTssAppointmentArgs,
  CreateAppointmentArgs,
  CreateReferralArgs,
  filterSelectableTssAppointments,
  ImportTssSearchsetBundleArgs,
  ImportTssSlotsArgs,
  ListAppointmentsArgs,
  ListAvailableTssAppointmentsArgs,
  ListReferralsByPatientArgs,
  LookupReferralByVermittlungscodeArgs,
} from "../src/domain/appointments-referrals";
import {
  AddBillingLineItemArgs,
  CreateBillingCaseArgs,
  CreateDiagnosisArgs,
  ImportIcdCatalogEntriesArgs,
  PrepareKvdtExportArgs,
  RegisterMasterDataPackageArgs,
} from "../src/domain/billing-coding";
import { evaluateCodingRules } from "../src/domain/coding-rules";
import {
  CreateDigaOrderArgs,
  FinalizeDigaOrderArgs,
  GetDigaOrderArgs,
  ImportDigaCatalogRefsArgs,
  ListDigaOrdersArgs,
  LookupDigaByPznArgs,
  RenderEvdgaBundleArgs,
} from "../src/domain/diga-evdga";
import {
  BuildValidationPlanArgs,
  CreateEauDocumentArgs,
  ListOraclePluginsArgs,
  RenderEauDocumentArgs,
  RenderErpBundleArgs,
  RunValidationArgs,
  ValidationSummaryArgs,
} from "../src/domain/emission";
import {
  AdoptEebInboxItemArgs,
  GetEebInboxItemArgs,
  ListEebInboxItemsArgs,
  ReceiveEebInboxItemArgs,
  RegisterKimMailboxArgs,
} from "../src/domain/integration";
import {
  ManualPatientSeedFields,
  PatientIdentifierSystem,
  RecordVsdSnapshotArgs,
  VsdSnapshotDocument,
} from "../src/domain/patients";
import {
  AddMedicationPlanEntryArgs,
  CreateHeilmittelApprovalArgs,
  CreateHeilmittelOrderArgs,
  CreateMedicationOrderArgs,
  CreateMedicationPlanArgs,
  FinalizeHeilmittelOrderArgs,
  FinalizeMedicationOrderArgs,
  FormInstanceDocument,
  GetDocumentArgs,
  GetDraftWorkspaceArgs,
  GetHeilmittelOrderArgs,
  GetMedicationOrderArgs,
  ImportHeilmittelCatalogRefsArgs,
  ImportMedicationCatalogRefsArgs,
  ImportVosBundleArgs,
  ListDocumentsByPatientArgs,
  ListFormDefinitionsArgs,
  ListFormInstancesByPatientArgs,
  ListHeilmittelOrdersArgs,
  ListMedicationOrdersArgs,
  LookupHeilmittelByKeyArgs,
  LookupMedicationByPznArgs,
  PromoteDraftWorkspaceArgs,
  PublishVosBundleArgs,
  ReadVosBundleArgs,
  ReadVosResourceArgs,
  RegisterFormDefinitionArgs,
  RenderVosBundleArgs,
  SaveDraftWorkspaceArgs,
  SearchVosResourcesArgs,
  WorkflowIssue,
} from "../src/domain/prescribing-documents";
import { VosPayload } from "../src/fhir-r4-effect/resources/vos";
import {
  buildOraclePlan,
  listOraclePlugins as listRegisteredOraclePlugins,
} from "../tools/oracles/framework";
import {
  buildAndExecuteOraclePlan,
  resolveOracleFamily,
} from "../tools/oracles/runtime";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import schema from "./schema";
import spec from "./spec";

type ArtifactId = Id<"artifacts">;
type BillingCaseId = Id<"billingCases">;
type ClinicalDocumentId = Id<"clinicalDocuments">;
type CoverageId = Id<"coverages">;
type DiagnosisId = Id<"diagnoses">;
type DigaOrderId = Id<"digaOrders">;
type DocumentRevisionId = Id<"documentRevisions">;
type EebInboxItemId = Id<"eebInboxItems">;
type HeilmittelOrderId = Id<"heilmittelOrders">;
type IntegrationJobId = Id<"integrationJobs">;
type KimMailboxId = Id<"kimMailboxes">;
type MedicationOrderId = Id<"medicationOrders">;
type MedicationPlanId = Id<"medicationPlans">;
type PatientId = Id<"patients">;
type SnapshotId = Id<"vsdSnapshots">;

const api = Api.make(schema, spec);

const formatDisplayName = (
  names: readonly {
    readonly family: string;
    readonly given: readonly string[];
  }[],
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
  return (
    [given, primaryName.family].filter(Boolean).join(" ").trim() || "Unbekannt"
  );
};

const quarterFromIsoDateTime = (timestamp: string) => {
  const year = Number.parseInt(timestamp.slice(0, 4), 10);
  const month = Number.parseInt(timestamp.slice(5, 7), 10);
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}Q${quarter}`;
};

const sourceStampFromSeed = (
  sourceKind: "eeb" | "egk" | "kvk" | "manual",
  capturedAt: string,
  sourcePath?: string,
) => ({
  sourceKind,
  ...(sourcePath ? { sourcePath } : {}),
  capturedAt,
});

const addressFromSnapshot = (payload: {
  readonly ort3113?: string;
  readonly plz3112?: string;
  readonly strasse3107?: string;
}) => {
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
        code: genderCode,
        system: "urn:kbv:administrative-gender",
      }
    : undefined;

const kvdtIssuesFromCase = ({
  diagnoses,
  evaluations,
  lineItems,
}: {
  diagnoses: readonly {
    readonly _id: DiagnosisId;
    readonly isPrimary?: boolean;
    readonly recordStatus: "active" | "cancelled" | "superseded";
  }[];
  evaluations: readonly {
    readonly blocking: boolean;
    readonly message: string;
    readonly ruleCode: string;
    readonly severity: "error" | "info" | "warning";
  }[];
  lineItems: readonly unknown[];
}) => {
  const issues: {
    blocking: boolean;
    code: string;
    message: string;
  }[] = [];

  const activeDiagnoses = diagnoses.filter(
    (diagnosis) => diagnosis.recordStatus === "active",
  );

  if (activeDiagnoses.length === 0) {
    issues.push({
      blocking: true,
      code: "KVDT_ACTIVE_DIAGNOSIS_REQUIRED",
      message: "At least one active diagnosis is required for KVDT export.",
    });
  }

  if (!activeDiagnoses.some((diagnosis) => diagnosis.isPrimary === true)) {
    issues.push({
      blocking: false,
      code: "KVDT_PRIMARY_DIAGNOSIS_MISSING",
      message: "A primary diagnosis is recommended for the billing case.",
    });
  }

  if (lineItems.length === 0) {
    issues.push({
      blocking: true,
      code: "KVDT_LINE_ITEM_REQUIRED",
      message: "At least one billing line item is required for export.",
    });
  }

  for (const evaluation of evaluations) {
    if (evaluation.blocking || evaluation.severity === "error") {
      issues.push({
        blocking: evaluation.blocking || evaluation.severity === "error",
        code: evaluation.ruleCode,
        message: evaluation.message,
      });
    }
  }

  return issues;
};

const createCodingEvaluationsForDiagnosis = ({
  billingCaseId,
  createdAt,
  diagnosis,
  diagnosisId,
  patient,
}: {
  billingCaseId?: BillingCaseId;
  createdAt: string;
  diagnosis: {
    readonly category: "acute" | "anamnestisch" | "dauerdiagnose";
    readonly diagnosensicherheit?: string;
    readonly icdCode: string;
    readonly isPrimary?: boolean;
    readonly patientId: PatientId;
  };
  diagnosisId: DiagnosisId;
  patient: {
    readonly administrativeGender?: {
      readonly code: string;
    };
    readonly birthDate?: string;
  };
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
    let caseDiagnoses: {
      readonly billingCaseId?: BillingCaseId;
      readonly isPrimary?: boolean;
      readonly recordStatus: "active" | "cancelled" | "superseded";
    }[] = [];
    if (billingCaseId) {
      caseDiagnoses = yield* reader
        .table("diagnoses")
        .index("by_patientId_and_recordStatus")
        .collect()
        .pipe(
          Effect.map((rows) =>
            rows.filter((row) => row.billingCaseId === billingCaseId),
          ),
        );
    }

    const pendingEvaluations = evaluateCodingRules({
      diagnosis,
      patient,
      patientId: diagnosis.patientId,
      ...(billingCaseId ? { billingCaseId } : {}),
      caseDiagnoses,
      ...(catalogEntry ? { catalogEntry } : {}),
      createdAt,
    });

    const evaluationIds = [];
    for (const evaluation of pendingEvaluations) {
      const evaluationId = yield* writer.table("codingEvaluations").insert({
        ...evaluation,
        diagnosisId,
      });
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

const findCoverageForPatientAndPayload = ({
  coveragePayload,
  patientId,
  versichertenId3119,
}: {
  coveragePayload: typeof ReceiveEebInboxItemArgs.Type.coveragePayload;
  patientId: PatientId;
  versichertenId3119?: string;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const coverages = yield* reader
      .table("coverages")
      .index("by_patientId")
      .collect()
      .pipe(
        Effect.map((rows) => rows.filter((row) => row.patientId === patientId)),
      );

    const matchedCoverage = coverages.find(
      (coverage) =>
        ((versichertenId3119 ?? coveragePayload.versichertenId3119) &&
          coverage.kvid10 ===
            (versichertenId3119 ?? coveragePayload.versichertenId3119)) ||
        (!!coveragePayload.kostentraegerkennung4133 &&
          coverage.kostentraegerkennung ===
            coveragePayload.kostentraegerkennung4133),
    );

    return matchedCoverage
      ? Option.some(matchedCoverage._id)
      : Option.none<CoverageId>();
  });

const quarterCardReadStatus = ({
  patientId,
  timestamp,
}: {
  patientId?: PatientId;
  timestamp: string;
}) =>
  Effect.gen(function* () {
    const quarter = quarterFromIsoDateTime(timestamp);
    if (!patientId) {
      return {
        hasCardRead: false,
        quarter,
      };
    }

    const reader = yield* DatabaseReader;
    const snapshots = yield* reader
      .table("vsdSnapshots")
      .index("by_patientId_and_readAt")
      .collect()
      .pipe(
        Effect.map((rows) => rows.filter((row) => row.patientId === patientId)),
      );

    return {
      hasCardRead: snapshots.some(
        (snapshot) =>
          (snapshot.readSource === "egk" || snapshot.readSource === "kvk") &&
          quarterFromIsoDateTime(snapshot.readAt) === quarter,
      ),
      quarter,
    };
  });

const findEebSnapshotByPayloadArtifactId = (payloadArtifactId: ArtifactId) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const snapshots = yield* reader
      .table("vsdSnapshots")
      .index("by_readSource_and_readAt")
      .collect();

    const snapshot = snapshots.find(
      (row) =>
        row.readSource === "eeb" && row.rawArtifactId === payloadArtifactId,
    );

    return snapshot ? Option.some(snapshot) : Option.none();
  });

const buildEebInboxItemView = (inboxItemId: EebInboxItemId) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const inboxItemOption = yield* reader
      .table("eebInboxItems")
      .get(inboxItemId)
      .pipe(Effect.option);

    if (Option.isNone(inboxItemOption)) {
      return Option.none();
    }

    const inboxItem = inboxItemOption.value;
    const matchedPatient = inboxItem.matchedPatientId
      ? yield* reader
          .table("patients")
          .get(inboxItem.matchedPatientId)
          .pipe(Effect.option)
      : Option.none();
    const matchedCoverage = inboxItem.matchedCoverageId
      ? yield* reader
          .table("coverages")
          .get(inboxItem.matchedCoverageId)
          .pipe(Effect.option)
      : Option.none();
    const snapshot = yield* findEebSnapshotByPayloadArtifactId(
      inboxItem.payloadArtifactId,
    );
    const quarterCardRead = yield* quarterCardReadStatus({
      patientId: inboxItem.matchedPatientId,
      timestamp: inboxItem.receivedAt,
    });

    return Option.some({
      inboxItem,
      ...(Option.isSome(matchedPatient)
        ? { matchedPatient: matchedPatient.value }
        : {}),
      ...(Option.isSome(matchedCoverage)
        ? { matchedCoverage: matchedCoverage.value }
        : {}),
      quarterCardRead,
      ...(Option.isSome(snapshot) ? { snapshot: snapshot.value } : {}),
    });
  });

const upsertPatientIdentifier = ({
  capturedAt,
  identifier,
  patientId,
  sourceKind,
  system,
  value,
}: {
  capturedAt: string;
  identifier: {
    readonly assignerDisplay?: string;
    readonly period?: {
      readonly end?: string;
      readonly start?: string;
    };
    readonly system: string;
    readonly type?: {
      readonly code: string;
      readonly display?: string;
      readonly system: string;
      readonly userSelected?: boolean;
      readonly version?: string;
    };
    readonly use?: "official" | "old" | "secondary" | "temp" | "usual";
    readonly value: string;
  };
  patientId: PatientId;
  sourceKind: "eeb" | "egk" | "kvk" | "manual";
  system: string;
  value: string;
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
          isPrimary: true,
          patientId,
          sourceStamp: sourceStampFromSeed(sourceKind, capturedAt),
          verifiedAt: capturedAt,
        });
      }
      return identifierDoc._id;
    }

    return yield* writer.table("patientIdentifiers").insert({
      identifier,
      isPrimary: true,
      patientId,
      sourceStamp: sourceStampFromSeed(sourceKind, capturedAt),
      system,
      value,
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
      snapshot.versichertenId3119 ??
      snapshot.coveragePayload.versichertenId3119;
    const matchedCoverage = existingCoverages.find(
      (coverage) =>
        (kvid10 && coverage.kvid10 === kvid10) ||
        (!!snapshot.coveragePayload.kostentraegerkennung4133 &&
          coverage.kostentraegerkennung ===
            snapshot.coveragePayload.kostentraegerkennung4133),
    );

    const coveragePatch = {
      kind: "gkv" as const,
      patientId,
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
      sourceStamp: sourceStampFromSeed(snapshot.readSource, snapshot.readAt),
      sourceVsdSnapshotId: snapshot._id,
    };

    if (matchedCoverage) {
      yield* writer
        .table("coverages")
        .patch(matchedCoverage._id, coveragePatch);
      return {
        coverageCreated: false,
        coverageId: matchedCoverage._id,
      };
    }

    const coverageId = yield* writer.table("coverages").insert(coveragePatch);
    return {
      coverageCreated: true,
      coverageId,
    };
  });

const createManual = ({
  patient,
  primaryIdentifier,
}: {
  readonly patient: typeof ManualPatientSeedFields.Type;
  readonly primaryIdentifier?: {
    readonly assignerDisplay?: string;
    readonly period?: {
      readonly end?: string;
      readonly start?: string;
    };
    readonly system: string;
    readonly type?: {
      readonly code: string;
      readonly display?: string;
      readonly system: string;
      readonly userSelected?: boolean;
      readonly version?: string;
    };
    readonly use?: "official" | "old" | "secondary" | "temp" | "usual";
    readonly value: string;
  };
}) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    const patientId = yield* writer.table("patients").insert({
      displayName: formatDisplayName(patient.names, patient.displayName),
      names: patient.names,
      status: "active",
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
          capturedAt: patient.capturedAt,
          identifier: primaryIdentifier,
          patientId,
          sourceKind: "manual",
          system: primaryIdentifier.system,
          value: primaryIdentifier.value,
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
    const patient = yield* db
      .table("patients")
      .get(patientId)
      .pipe(Effect.option);

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
      coverages,
      found: true as const,
      identifiers,
      patient: patient.value,
    };
  });

const listByPatient = ({ patientId }: { readonly patientId: PatientId }) =>
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
    const packageId = yield* writer
      .table("masterDataPackages")
      .insert(packageData);
    return { packageId };
  });

const importIcdCatalogEntries = ({
  entries,
  sourcePackageId,
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
      entryIds,
      importedCount: entryIds.length,
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

const createAppointment = (appointment: typeof CreateAppointmentArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const appointmentId = yield* writer
      .table("appointments")
      .insert(appointment);
    return { appointmentId };
  });

const importTssSlots = ({
  artifact,
  importedAt,
  organizationId,
  slots,
}: typeof ImportTssSlotsArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const jobId = yield* writer.table("integrationJobs").insert({
      attemptCount: 1,
      counterparty: "TSS",
      direction: "inbound",
      idempotencyKey: artifact.externalIdentifier
        ? `tss-import:${artifact.externalIdentifier}`
        : `tss-import:${organizationId}:${importedAt}`,
      jobType: "tss-slot-import",
      ownerId: String(organizationId),
      ownerKind: "organization",
      status: "running",
    });

    const artifactId = yield* createArtifact({
      artifactFamily: "TSS",
      artifactSubtype: "slot-import",
      attachment: artifact.attachment,
      contentType: artifact.attachment.contentType,
      direction: "inbound",
      ...(artifact.externalIdentifier
        ? { externalIdentifier: artifact.externalIdentifier }
        : {}),
      immutableAt: importedAt,
      ownerId: String(jobId),
      ownerKind: "integrationJob",
      transportKind: artifact.attachment.contentType,
      validationStatus: "valid",
    });

    yield* writer.table("integrationJobs").patch(jobId, {
      payloadArtifactId: artifactId,
    });

    const existingAppointments = yield* reader
      .table("appointments")
      .index("by_source_and_externalAppointmentId")
      .collect();

    const appointmentIds: Id<"appointments">[] = [];
    for (const slot of slots) {
      const existing = existingAppointments.find(
        (appointment) =>
          appointment.source === "tss" &&
          appointment.externalAppointmentId === slot.externalAppointmentId,
      );

      if (existing) {
        yield* writer.table("appointments").patch(existing._id, {
          ...(slot.displayBucket ? { displayBucket: slot.displayBucket } : {}),
          ...(slot.end ? { end: slot.end } : {}),
          organizationId,
          start: slot.start,
          ...(slot.tssServiceType
            ? { tssServiceType: slot.tssServiceType }
            : {}),
          ...(slot.vermittlungscode
            ? { vermittlungscode: slot.vermittlungscode }
            : {}),
          ...(existing.status === "proposed"
            ? { status: slot.status ?? "proposed" }
            : {}),
        });
        appointmentIds.push(existing._id);
        continue;
      }

      const appointmentId = yield* writer.table("appointments").insert({
        ...(slot.displayBucket ? { displayBucket: slot.displayBucket } : {}),
        ...(slot.end ? { end: slot.end } : {}),
        externalAppointmentId: slot.externalAppointmentId,
        organizationId,
        source: "tss",
        start: slot.start,
        status: slot.status ?? "proposed",
        ...(slot.tssServiceType ? { tssServiceType: slot.tssServiceType } : {}),
        ...(slot.vermittlungscode
          ? { vermittlungscode: slot.vermittlungscode }
          : {}),
      });
      appointmentIds.push(appointmentId);
    }

    yield* writer.table("integrationJobs").patch(jobId, {
      status: "done",
    });
    yield* writer.table("integrationEvents").insert({
      artifactId,
      eventType: "tss-slots-imported",
      jobId,
      message: `Imported ${appointmentIds.length} TSS slots.`,
      occurredAt: importedAt,
    });

    return {
      appointmentIds,
      artifactId,
      importedCount: appointmentIds.length,
      jobId,
    };
  });

const importTssSearchsetBundle = ({
  artifact,
  importedAt,
  organizationId,
  xml,
}: typeof ImportTssSearchsetBundleArgs.Type) =>
  Effect.gen(function* () {
    const parsed = parseOfficialTssSearchsetXml(xml);
    const slots = parsed.appointments.map((appointment) => ({
      ...(appointment.end ? { end: appointment.end } : {}),
      externalAppointmentId: appointment.externalAppointmentId,
      start: appointment.start,
      status: appointment.status,
      ...(appointment.serviceTypeCode
        ? { tssServiceType: appointment.serviceTypeCode }
        : appointment.serviceTypeDisplay
          ? { tssServiceType: appointment.serviceTypeDisplay }
          : {}),
      ...(appointment.vermittlungscode
        ? { vermittlungscode: appointment.vermittlungscode }
        : {}),
    }));

    return yield* importTssSlots({
      artifact,
      importedAt,
      organizationId,
      slots,
    });
  });

const ensureTssBillingContext = ({
  appointment,
  patientId,
}: {
  appointment: {
    readonly _id: Id<"appointments">;
    readonly end?: string;
    readonly locationId?: Id<"practiceLocations">;
    readonly organizationId: Id<"organizations">;
    readonly start: string;
  };
  patientId: PatientId;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const quarter = quarterFromIsoDateTime(appointment.start);
    const coverages = yield* reader
      .table("coverages")
      .index("by_patientId")
      .collect();
    const coverage = coverages
      .filter((entry) => entry.patientId === patientId)
      .sort((left, right) => left._creationTime - right._creationTime)
      .at(-1);

    const billingCases = yield* reader
      .table("billingCases")
      .index("by_patientId_and_quarter")
      .collect();
    const existingCase = billingCases.find(
      (billingCase) =>
        billingCase.patientId === patientId &&
        billingCase.quarter === quarter &&
        billingCase.tssAppointmentId === appointment._id,
    );

    const billingCaseId =
      existingCase?._id ??
      (yield* writer.table("billingCases").insert({
        ...(coverage ? { coverageId: coverage._id } : {}),
        ...(coverage?.kostentraegerkennung
          ? { kostentraegerkennung4133: coverage.kostentraegerkennung }
          : {}),
        ...(coverage?.kostentraegerName
          ? { kostentraegername4134: coverage.kostentraegerName }
          : {}),
        ...(appointment.locationId
          ? { locationId: appointment.locationId }
          : {}),
        organizationId: appointment.organizationId,
        patientId,
        quarter,
        status: "open",
        tssAppointmentId: appointment._id,
        tssRelevant: true,
      }));

    const encounters = yield* reader
      .table("encounters")
      .index("by_billingCaseId")
      .collect();
    const existingEncounter = encounters.find(
      (encounter) =>
        encounter.billingCaseId === billingCaseId &&
        encounter.appointmentId === appointment._id,
    );

    const encounterId =
      existingEncounter?._id ??
      (yield* writer.table("encounters").insert({
        appointmentId: appointment._id,
        billingCaseId,
        caseType: "tss",
        ...(coverage ? { coverageId: coverage._id } : {}),
        ...(appointment.end ? { end: appointment.end } : {}),
        ...(appointment.locationId
          ? { locationId: appointment.locationId }
          : {}),
        organizationId: appointment.organizationId,
        patientId,
        quarter,
        start: appointment.start,
      }));

    return {
      billingCaseId,
      encounterId,
    };
  });

const listAppointmentsByOrganization = ({
  organizationId,
  patientId,
  source,
  startFrom,
  startTo,
  status,
  tssServiceType,
  vermittlungscode,
}: typeof ListAppointmentsArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const appointments = yield* reader
      .table("appointments")
      .index("by_organizationId_and_start")
      .collect();

    return appointments
      .filter((row) => row.organizationId === organizationId)
      .filter((row) =>
        patientId === undefined ? true : row.patientId === patientId,
      )
      .filter((row) => (source === undefined ? true : row.source === source))
      .filter((row) => (status === undefined ? true : row.status === status))
      .filter((row) =>
        vermittlungscode === undefined
          ? true
          : row.vermittlungscode === vermittlungscode,
      )
      .filter((row) =>
        tssServiceType === undefined
          ? true
          : row.tssServiceType === tssServiceType,
      )
      .filter((row) =>
        startFrom === undefined ? true : row.start >= startFrom,
      )
      .filter((row) => (startTo === undefined ? true : row.start <= startTo))
      .sort((left, right) => left.start.localeCompare(right.start));
  });

const listAvailableTssAppointments = ({
  displayBucket,
  organizationId,
  startFrom,
  startTo,
  tssServiceType,
  vermittlungscode,
}: typeof ListAvailableTssAppointmentsArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const appointments = yield* reader
      .table("appointments")
      .index("by_organizationId_and_start")
      .collect();

    const selected = filterSelectableTssAppointments(
      appointments.map((appointment) => ({
        appointmentId: String(appointment._id),
        organizationId: String(appointment.organizationId),
        ...(appointment.patientId
          ? { patientId: String(appointment.patientId) }
          : {}),
        source: appointment.source,
        start: appointment.start,
        status: appointment.status,
        ...(appointment.end ? { end: appointment.end } : {}),
        ...(appointment.vermittlungscode
          ? { vermittlungscode: appointment.vermittlungscode }
          : {}),
        ...(appointment.tssServiceType
          ? { tssServiceType: appointment.tssServiceType }
          : {}),
        ...(appointment.displayBucket
          ? { displayBucket: appointment.displayBucket }
          : {}),
        ...(appointment.externalAppointmentId
          ? { externalAppointmentId: appointment.externalAppointmentId }
          : {}),
      })),
      {
        organizationId: String(organizationId),
        ...(vermittlungscode ? { vermittlungscode } : {}),
        ...(tssServiceType ? { tssServiceType } : {}),
        ...(startFrom ? { startFrom } : {}),
        ...(startTo ? { startTo } : {}),
        ...(displayBucket ? { displayBucket } : {}),
      },
    );

    return selected
      .map((candidate) =>
        appointments.find(
          (appointment) => String(appointment._id) === candidate.appointmentId,
        ),
      )
      .filter(
        (appointment): appointment is NonNullable<typeof appointment> =>
          appointment !== undefined,
      );
  });

const bookTssAppointment = ({
  appointmentId,
  patientId,
  vermittlungscode,
}: typeof BookTssAppointmentArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const appointmentOption = yield* reader
      .table("appointments")
      .get(appointmentId)
      .pipe(Effect.option);

    if (Option.isNone(appointmentOption)) {
      return { outcome: "appointment-not-found" as const };
    }

    const appointment = appointmentOption.value;
    if (appointment.source !== "tss") {
      return {
        outcome: "not-bookable" as const,
        reason: "Only TSS appointments can be booked through this workflow.",
      };
    }

    if (appointment.status !== "proposed") {
      return {
        outcome: "not-bookable" as const,
        reason: "Only proposed TSS appointments are bookable.",
      };
    }

    if (
      vermittlungscode !== undefined &&
      appointment.vermittlungscode !== undefined &&
      appointment.vermittlungscode !== vermittlungscode
    ) {
      return {
        outcome: "not-bookable" as const,
        reason: "Vermittlungscode does not match the selected TSS slot.",
      };
    }

    yield* writer.table("appointments").patch(appointmentId, {
      patientId,
      status: "booked",
    });

    const bookingCode = vermittlungscode ?? appointment.vermittlungscode;
    if (bookingCode) {
      const referrals = yield* reader
        .table("referrals")
        .index("by_vermittlungscode")
        .collect();
      const matchingReferral = referrals.find(
        (referral) =>
          referral.patientId === patientId &&
          referral.status === "active" &&
          referral.vermittlungscode === bookingCode,
      );
      if (matchingReferral) {
        yield* writer.table("referrals").patch(matchingReferral._id, {
          status: "used",
        });
      }
    }

    const { billingCaseId, encounterId } = yield* ensureTssBillingContext({
      appointment,
      patientId,
    });
    const integrationJobId = yield* writer.table("integrationJobs").insert({
      attemptCount: 1,
      counterparty: "TSS",
      direction: "outbound",
      idempotencyKey: `tss-book:${String(appointmentId)}`,
      jobType: "tss-booking",
      ownerId: String(appointmentId),
      ownerKind: "appointment",
      status: "done",
    });
    yield* writer.table("integrationEvents").insert({
      eventType: "tss-booking-recorded",
      jobId: integrationJobId,
      message: `Booked TSS appointment ${String(appointmentId)} for patient ${String(patientId)}.`,
      occurredAt: appointment.start,
    });
    yield* writer.table("integrationEvents").insert({
      eventType: "tss-billing-mapped",
      jobId: integrationJobId,
      message: `Mapped TSS booking to billing case ${String(billingCaseId)} and encounter ${String(encounterId)}.`,
      occurredAt: appointment.start,
    });

    return {
      appointmentId,
      billingCaseId,
      encounterId,
      integrationJobId,
      outcome: "booked" as const,
    };
  });

const createReferral = (referral: typeof CreateReferralArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const referralId = yield* writer.table("referrals").insert(referral);
    return { referralId };
  });

const listReferralsByPatient = ({
  patientId,
  status,
}: typeof ListReferralsByPatientArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const referrals = yield* reader
      .table("referrals")
      .index("by_patientId_and_issueDate")
      .collect();

    return referrals
      .filter((row) => row.patientId === patientId)
      .filter((row) => (status === undefined ? true : row.status === status))
      .sort((left, right) => left.issueDate.localeCompare(right.issueDate));
  });

const lookupReferralByVermittlungscode = ({
  vermittlungscode,
}: typeof LookupReferralByVermittlungscodeArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const referrals = yield* reader
      .table("referrals")
      .index("by_vermittlungscode")
      .collect();
    const referral = referrals.find(
      (row) => row.vermittlungscode === vermittlungscode,
    );

    if (!referral) {
      return { found: false as const };
    }

    return {
      found: true as const,
      referral,
    };
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
      billingCaseId: diagnosis.billingCaseId,
      createdAt,
      diagnosis,
      diagnosisId,
      patient,
    });

    return {
      diagnosisId,
      evaluationIds,
    };
  });

const listDiagnoses = ({
  billingCaseId,
  patientId,
}: {
  readonly billingCaseId?: BillingCaseId;
  readonly patientId: PatientId;
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
    return evaluations.filter(
      (evaluation) => evaluation.diagnosisId === diagnosisId,
    );
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
      billingCase: billingCase.value,
      diagnoses,
      found: true as const,
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
      evaluations,
      lineItems: caseResult.lineItems,
    });

    return {
      billingCase: caseResult.billingCase,
      diagnoses: caseResult.diagnoses,
      evaluations,
      exportReady: !issues.some((issue) => issue.blocking),
      found: true as const,
      issues,
      lineItems: caseResult.lineItems,
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
        billingCaseId,
        issues: caseView.issues,
        outcome: "ready" as const,
      };
    }

    return {
      billingCaseId,
      issues: caseView.issues,
      outcome: "blocked" as const,
    };
  });

const recordSnapshot = (snapshot: typeof RecordVsdSnapshotArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const snapshotId = yield* writer.table("vsdSnapshots").insert(snapshot);
    return { snapshotId };
  });

const getSnapshot = ({ snapshotId }: { readonly snapshotId: SnapshotId }) =>
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
  existingPatientId,
  patientSeed,
  snapshotId,
}: {
  readonly existingPatientId?: PatientId;
  readonly patientSeed?: typeof ManualPatientSeedFields.Type;
  readonly snapshotId: SnapshotId;
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
      snapshot.versichertenId3119 ??
        snapshot.coveragePayload.versichertenId3119,
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
        displayName: formatDisplayName(
          patientSeed.names,
          patientSeed.displayName,
        ),
        names: patientSeed.names,
        status: "active",
        ...(snapshot.coveragePayload.geburtsdatum3103
          ? { birthDate: snapshot.coveragePayload.geburtsdatum3103 }
          : patientSeed.birthDate
            ? { birthDate: patientSeed.birthDate }
            : {}),
        ...(administrativeGenderFromSnapshot(
          snapshot.coveragePayload.geschlecht3110,
        )
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
      snapshot.versichertenId3119 ??
      snapshot.coveragePayload.versichertenId3119;
    const patientIdentifierId = kvid10
      ? yield* upsertPatientIdentifier({
          capturedAt: snapshot.readAt,
          identifier: {
            system: PatientIdentifierSystem.Kvid10,
            use: "official",
            value: kvid10,
          },
          patientId,
          sourceKind: snapshot.readSource,
          system: PatientIdentifierSystem.Kvid10,
          value: kvid10,
        })
      : undefined;

    if (snapshot.coveragePayload.versichertennummer3105) {
      yield* upsertPatientIdentifier({
        capturedAt: snapshot.readAt,
        identifier: {
          system: PatientIdentifierSystem.LegacyInsuranceNumber,
          use: "secondary",
          value: snapshot.coveragePayload.versichertennummer3105,
        },
        patientId,
        sourceKind: snapshot.readSource,
        system: PatientIdentifierSystem.LegacyInsuranceNumber,
        value: snapshot.coveragePayload.versichertennummer3105,
      });
    }

    const { coverageCreated, coverageId } = yield* upsertCoverageFromSnapshot({
      patientId,
      snapshot,
    });

    return {
      coverageId,
      outcome: "adopted" as const,
      patientId,
      ...(patientIdentifierId ? { patientIdentifierId } : {}),
      coverageCreated,
      patientCreated,
    };
  });

const createArtifact = ({
  artifactFamily,
  artifactSubtype,
  attachment,
  contentType,
  direction,
  externalIdentifier,
  immutableAt,
  ownerId,
  ownerKind,
  profileVersion,
  transportKind,
  validationStatus = "pending" as const,
}: {
  artifactFamily: string;
  artifactSubtype: string;
  attachment: {
    readonly byteSize: number;
    readonly contentType: string;
    readonly creationTime?: string;
    readonly sha256: string;
    readonly storageId: Id<"_storage">;
    readonly title?: string;
  };
  contentType: string;
  direction: "inbound" | "internal" | "outbound";
  externalIdentifier?: string;
  immutableAt: string;
  ownerId: string;
  ownerKind:
    | "billingCase"
    | "documentRevision"
    | "eebInboxItem"
    | "integrationJob"
    | "masterDataPackage";
  profileVersion?: string;
  transportKind: string;
  validationStatus?: "invalid" | "pending" | "valid";
}) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    return yield* writer.table("artifacts").insert({
      artifactFamily,
      artifactSubtype,
      direction,
      ownerId,
      ownerKind,
      ...(profileVersion ? { profileVersion } : {}),
      attachment,
      contentType,
      transportKind,
      ...(externalIdentifier ? { externalIdentifier } : {}),
      immutableAt,
      validationStatus,
    });
  });

const issueFormInstanceForRevision = ({
  patientId,
  printForm,
  revisionId,
  subjectId,
  subjectKind,
}: {
  patientId: PatientId;
  printForm?: {
    readonly formDefinitionId: Id<"formDefinitions">;
    readonly issueDate: string;
    readonly issuerPractitionerRoleId?: Id<"practitionerRoles">;
    readonly issuingOrganizationId?: Id<"organizations">;
    readonly outputAttachment?: {
      readonly byteSize: number;
      readonly contentType: string;
      readonly creationTime?: string;
      readonly sha256: string;
      readonly storageId: Id<"_storage">;
      readonly title?: string;
    };
    readonly renderContextAttachment?: {
      readonly byteSize: number;
      readonly contentType: string;
      readonly creationTime?: string;
      readonly sha256: string;
      readonly storageId: Id<"_storage">;
      readonly title?: string;
    };
  };
  revisionId: DocumentRevisionId;
  subjectId?: string;
  subjectKind:
    | "billing"
    | "eau"
    | "heilmittel"
    | "other"
    | "prescription-print"
    | "referral";
}) =>
  Effect.gen(function* () {
    if (!printForm) {
      return {};
    }

    const writer = yield* DatabaseWriter;
    const renderContextArtifactId = printForm.renderContextAttachment
      ? yield* createArtifact({
          artifactFamily: "FORM_RENDER_CONTEXT",
          artifactSubtype: "json",
          attachment: printForm.renderContextAttachment,
          contentType: printForm.renderContextAttachment.contentType,
          direction: "internal",
          immutableAt: `${printForm.issueDate}T00:00:00.000Z`,
          ownerId: String(revisionId),
          ownerKind: "documentRevision",
          transportKind: "print",
        })
      : undefined;
    const outputArtifactId = printForm.outputAttachment
      ? yield* createArtifact({
          artifactFamily: "FORM_OUTPUT",
          artifactSubtype: "print-output",
          attachment: printForm.outputAttachment,
          contentType: printForm.outputAttachment.contentType,
          direction: "outbound",
          immutableAt: `${printForm.issueDate}T00:00:00.000Z`,
          ownerId: String(revisionId),
          ownerKind: "documentRevision",
          transportKind: "print",
        })
      : undefined;

    const formInstanceId = yield* writer.table("formInstances").insert({
      formDefinitionId: printForm.formDefinitionId,
      patientId,
      subjectKind,
      ...(subjectId ? { subjectId } : {}),
      issueDate: printForm.issueDate,
      status: "final",
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
  artifact,
  artifactDirection = "outbound",
  artifactFamily,
  artifactSubtype,
  authorOrganizationId,
  authorPractitionerId,
  contentType,
  effectiveDate,
  formSubjectId,
  formSubjectKind,
  kind,
  originInterface,
  patientId,
  patientPrint,
  printForm,
  profileVersion,
  status,
  summary,
  transportKind,
}: {
  artifact: {
    readonly attachment: {
      readonly byteSize: number;
      readonly contentType: string;
      readonly creationTime?: string;
      readonly sha256: string;
      readonly storageId: Id<"_storage">;
      readonly title?: string;
    };
    readonly externalIdentifier?: string;
  };
  artifactDirection?: "inbound" | "outbound";
  artifactFamily: string;
  artifactSubtype: string;
  authorOrganizationId?: Id<"organizations">;
  authorPractitionerId?: Id<"practitioners">;
  contentType: string;
  effectiveDate: string;
  formSubjectId?: string;
  formSubjectKind?:
    | "billing"
    | "eau"
    | "heilmittel"
    | "other"
    | "prescription-print"
    | "referral";
  kind:
    | "archive-import"
    | "bfb-form"
    | "bmp-plan"
    | "eau"
    | "erp"
    | "evdga"
    | "heilmittel"
    | "other"
    | "tss"
    | "vos";
  originInterface: string;
  patientId: PatientId;
  patientPrint?: {
    readonly attachment: {
      readonly byteSize: number;
      readonly contentType: string;
      readonly creationTime?: string;
      readonly sha256: string;
      readonly storageId: Id<"_storage">;
      readonly title?: string;
    };
    readonly externalIdentifier?: string;
  };
  printForm?: {
    readonly formDefinitionId: Id<"formDefinitions">;
    readonly issueDate: string;
    readonly issuerPractitionerRoleId?: Id<"practitionerRoles">;
    readonly issuingOrganizationId?: Id<"organizations">;
    readonly outputAttachment?: {
      readonly byteSize: number;
      readonly contentType: string;
      readonly creationTime?: string;
      readonly sha256: string;
      readonly storageId: Id<"_storage">;
      readonly title?: string;
    };
    readonly renderContextAttachment?: {
      readonly byteSize: number;
      readonly contentType: string;
      readonly creationTime?: string;
      readonly sha256: string;
      readonly storageId: Id<"_storage">;
      readonly title?: string;
    };
  };
  profileVersion?: string;
  status: "cancelled" | "draft" | "final" | "imported" | "superseded";
  summary: {
    readonly externalIdentifier?: string;
    readonly formCode?: string;
    readonly title?: string;
  };
  transportKind: string;
}) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const documentId = yield* writer.table("clinicalDocuments").insert({
      currentRevisionNo: 0,
      kind,
      originInterface,
      patientId,
      status: "draft",
    });

    const revisionId = yield* writer.table("documentRevisions").insert({
      documentId,
      effectiveDate,
      revisionNo: 1,
      status,
      ...(authorPractitionerId ? { authorPractitionerId } : {}),
      ...(authorOrganizationId ? { authorOrganizationId } : {}),
      summary,
    });

    const artifactId = yield* createArtifact({
      artifactFamily,
      artifactSubtype,
      direction: artifactDirection,
      ownerId: String(revisionId),
      ownerKind: "documentRevision",
      ...(profileVersion ? { profileVersion } : {}),
      attachment: artifact.attachment,
      contentType,
      transportKind,
      ...(artifact.externalIdentifier
        ? { externalIdentifier: artifact.externalIdentifier }
        : {}),
      immutableAt: effectiveDate,
    });

    const patientPrintArtifactId = patientPrint
      ? yield* createArtifact({
          artifactFamily,
          artifactSubtype: "patient-print",
          attachment: patientPrint.attachment,
          contentType: patientPrint.attachment.contentType,
          direction: "outbound",
          ownerId: String(revisionId),
          ownerKind: "documentRevision",
          transportKind: "print",
          ...(patientPrint.externalIdentifier
            ? { externalIdentifier: patientPrint.externalIdentifier }
            : {}),
          immutableAt: effectiveDate,
        })
      : undefined;

    const formResult =
      printForm && formSubjectKind
        ? yield* issueFormInstanceForRevision({
            patientId,
            revisionId,
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
      artifactId,
      documentId,
      revisionId,
      ...(patientPrintArtifactId ? { patientPrintArtifactId } : {}),
      ...formResult,
    };
  });

const medicationFinalizeIssues = (order: {
  readonly freeTextMedication?: string;
  readonly medicationCatalogRefId?: Id<"medicationCatalogRefs">;
  readonly multiplePrescription?: {
    readonly enabled: boolean;
    readonly redeemFrom?: string;
    readonly redeemUntil?: string;
    readonly seriesIdentifier?: string;
  };
  readonly orderKind: "compounding" | "freetext" | "ingredient" | "pzn";
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const issues: (typeof WorkflowIssue.Type)[] = [];

    if (order.orderKind === "pzn" && !order.medicationCatalogRefId) {
      issues.push({
        blocking: true,
        code: "ERP_MEDICATION_CATALOG_REF_REQUIRED",
        message:
          "PZN-based prescriptions require a medication catalog reference.",
      });
    }

    if (
      order.orderKind === "freetext" &&
      (!order.freeTextMedication ||
        order.freeTextMedication.trim().length === 0)
    ) {
      issues.push({
        blocking: true,
        code: "ERP_FREETEXT_MEDICATION_REQUIRED",
        message: "Free-text prescriptions require a medication description.",
      });
    }

    if (order.medicationCatalogRefId) {
      const catalogRef = yield* reader
        .table("medicationCatalogRefs")
        .get(order.medicationCatalogRefId)
        .pipe(Effect.option);
      if (Option.isNone(catalogRef)) {
        issues.push({
          blocking: true,
          code: "ERP_MEDICATION_CATALOG_REF_UNKNOWN",
          message: "Medication catalog reference does not exist.",
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
        blocking: true,
        code: "ERP_MULTIPLE_PRESCRIPTION_METADATA_REQUIRED",
        message:
          "Multiple prescriptions require a series identifier and redeem interval.",
      });
    }

    return issues;
  });

const heilmittelFinalizeIssues = (order: {
  readonly approvalId?: Id<"heilmittelApprovals">;
  readonly blankoFlag?: boolean;
  readonly diagnosegruppe: string;
  readonly diagnosisIds: readonly DiagnosisId[];
  readonly ergaenzendeHeilmittelCodes: readonly string[];
  readonly heilmittelbereich: string;
  readonly issueDate: string;
  readonly longTermNeedFlag?: boolean;
  readonly patientId: PatientId;
  readonly specialNeedFlag?: boolean;
  readonly vorrangigeHeilmittelCodes: readonly string[];
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const issues: (typeof WorkflowIssue.Type)[] = [];

    if (order.diagnosisIds.length === 0) {
      issues.push({
        blocking: true,
        code: "HEILMITTEL_DIAGNOSIS_REQUIRED",
        message: "Heilmittel orders require at least one linked diagnosis.",
      });
    }

    const requestedCodes = [
      ...order.vorrangigeHeilmittelCodes,
      ...order.ergaenzendeHeilmittelCodes,
    ];
    if (requestedCodes.length === 0) {
      issues.push({
        blocking: true,
        code: "HEILMITTEL_CODE_REQUIRED",
        message: "At least one Heilmittel code is required.",
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
          blocking: true,
          code: "HEILMITTEL_CATALOG_ENTRY_MISSING",
          message: `Heilmittel code ${requestedCode} is not available for the selected diagnosegruppe.`,
        });
        continue;
      }

      if (order.blankoFlag && catalogEntry.blankoEligible !== true) {
        issues.push({
          blocking: true,
          code: "HEILMITTEL_BLANKO_NOT_ELIGIBLE",
          message: `Heilmittel code ${requestedCode} is not blanko-eligible.`,
        });
      }
    }

    if (
      (order.longTermNeedFlag || order.specialNeedFlag) &&
      !order.approvalId
    ) {
      issues.push({
        blocking: true,
        code: "HEILMITTEL_APPROVAL_REQUIRED",
        message:
          "Special-need and long-term Heilmittel orders require an approval record.",
      });
    }

    if (order.approvalId) {
      const approvalOption = yield* reader
        .table("heilmittelApprovals")
        .get(order.approvalId)
        .pipe(Effect.option);

      if (Option.isNone(approvalOption)) {
        issues.push({
          blocking: true,
          code: "HEILMITTEL_APPROVAL_UNKNOWN",
          message: "Referenced Heilmittel approval does not exist.",
        });
      } else {
        const approval = approvalOption.value;
        if (approval.patientId !== order.patientId) {
          issues.push({
            blocking: true,
            code: "HEILMITTEL_APPROVAL_PATIENT_MISMATCH",
            message: "Heilmittel approval belongs to a different patient.",
          });
        }

        if (approval.validFrom && order.issueDate < approval.validFrom) {
          issues.push({
            blocking: true,
            code: "HEILMITTEL_APPROVAL_NOT_YET_VALID",
            message: "Heilmittel approval is not yet valid on the issue date.",
          });
        }

        if (approval.validTo && order.issueDate > approval.validTo) {
          issues.push({
            blocking: true,
            code: "HEILMITTEL_APPROVAL_EXPIRED",
            message: "Heilmittel approval has expired for the issue date.",
          });
        }

        if (
          approval.diagnosegruppen.length > 0 &&
          !approval.diagnosegruppen.includes(order.diagnosegruppe)
        ) {
          issues.push({
            blocking: true,
            code: "HEILMITTEL_APPROVAL_DIAGNOSEGRUPPE_MISMATCH",
            message:
              "Heilmittel approval does not cover the selected diagnosegruppe.",
          });
        }

        if (
          approval.heilmittelCodes.length > 0 &&
          !requestedCodes.some((code) =>
            approval.heilmittelCodes.includes(code),
          )
        ) {
          issues.push({
            blocking: true,
            code: "HEILMITTEL_APPROVAL_CODE_MISMATCH",
            message:
              "Heilmittel approval does not cover any of the selected Heilmittel codes.",
          });
        }
      }
    }

    return issues;
  });

const importMedicationCatalogRefs = ({
  entries,
  sourcePackageId,
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
      entryIds,
      importedCount: entryIds.length,
    };
  });

const lookupMedicationByPzn = ({
  pzn,
}: typeof LookupMedicationByPznArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const entries = yield* reader
      .table("medicationCatalogRefs")
      .index("by_pzn")
      .collect();
    const entry = entries.find((row) => row.pzn === pzn);

    if (!entry) {
      return { found: false as const };
    }

    return {
      entry,
      found: true as const,
    };
  });

const importHeilmittelCatalogRefs = ({
  entries,
  sourcePackageId,
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
      entryIds,
      importedCount: entryIds.length,
    };
  });

const importDigaCatalogRefs = ({
  entries,
  sourcePackageId,
}: typeof ImportDigaCatalogRefsArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const entryIds = [];

    for (const entry of entries) {
      const entryId = yield* writer.table("digaCatalogRefs").insert({
        sourcePackageId,
        ...entry,
      });
      entryIds.push(entryId);
    }

    return {
      entryIds,
      importedCount: entryIds.length,
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
      entry,
      found: true as const,
    };
  });

const lookupDigaByPzn = ({ pzn }: typeof LookupDigaByPznArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const entries = yield* reader
      .table("digaCatalogRefs")
      .index("by_pzn")
      .collect();
    const entry = entries.find((row) => row.pzn === pzn);

    if (!entry) {
      return { found: false as const };
    }

    return {
      entry,
      found: true as const,
    };
  });

const createMedicationOrder = (args: typeof CreateMedicationOrderArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const medicationOrderId = yield* writer
      .table("medicationOrders")
      .insert(args);
    return { medicationOrderId };
  });

const createDigaOrder = (args: typeof CreateDigaOrderArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const digaOrderId = yield* writer.table("digaOrders").insert(args);
    return { digaOrderId };
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

const getDigaOrder = ({ digaOrderId }: typeof GetDigaOrderArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const orderOption = yield* reader
      .table("digaOrders")
      .get(digaOrderId)
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

const listDigaOrdersByPatient = ({
  patientId,
  status,
}: typeof ListDigaOrdersArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const orders = yield* reader
      .table("digaOrders")
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
  artifact,
  finalizedAt,
  medicationOrderId,
  patientPrint,
  printForm,
  profileVersion,
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
        medicationOrderId,
        outcome: "not-draft" as const,
      };
    }

    const issues = yield* medicationFinalizeIssues(order);
    if (issues.some((issue) => issue.blocking)) {
      return {
        issues,
        medicationOrderId,
        outcome: "blocked" as const,
      };
    }

    const issued: {
      artifactId: Id<"artifacts">;
      documentId: ClinicalDocumentId;
      formInstanceId?: Id<"formInstances">;
      patientPrintArtifactId?: Id<"artifacts">;
      revisionId: DocumentRevisionId;
    } = yield* issueDocumentRevision({
      artifact,
      artifactFamily: "ERP",
      artifactSubtype: "kbv-bundle-xml",
      authorOrganizationId: order.organizationId,
      authorPractitionerId: order.signerPractitionerId ?? order.practitionerId,
      contentType: artifact.attachment.contentType,
      effectiveDate: finalizedAt,
      kind: "erp",
      originInterface: "ERP",
      patientId: order.patientId,
      status: "final",
      summary: {
        title:
          order.freeTextMedication ??
          (order.orderKind === "pzn" ? "eRezept" : "Medikationsverordnung"),
        ...(artifact.externalIdentifier
          ? { externalIdentifier: artifact.externalIdentifier }
          : {}),
      },
      transportKind: "fhir-bundle-xml",
      ...(profileVersion ? { profileVersion } : {}),
      ...(patientPrint ? { patientPrint } : {}),
      ...(printForm
        ? {
            formSubjectId: String(medicationOrderId),
            formSubjectKind: "prescription-print" as const,
            printForm,
          }
        : {}),
    });

    yield* writer.table("medicationOrders").patch(medicationOrderId, {
      artifactDocumentId: issued.documentId,
      status: "final",
    });

    return {
      artifactId: issued.artifactId,
      documentId: issued.documentId,
      medicationOrderId,
      outcome: "finalized" as const,
      revisionId: issued.revisionId,
      ...(issued.patientPrintArtifactId
        ? { patientPrintArtifactId: issued.patientPrintArtifactId }
        : {}),
      ...(issued.formInstanceId
        ? { formInstanceId: issued.formInstanceId }
        : {}),
    };
  });

const digaFinalizeIssues = (order: {
  readonly digaCatalogRefId: Id<"digaCatalogRefs">;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const issues: (typeof WorkflowIssue.Type)[] = [];
    const catalogRef = yield* reader
      .table("digaCatalogRefs")
      .get(order.digaCatalogRefId)
      .pipe(Effect.option);

    if (Option.isNone(catalogRef)) {
      issues.push({
        blocking: true,
        code: "EVDGA_CATALOG_REF_UNKNOWN",
        message: "Referenced DiGA catalog entry does not exist.",
      });
    }

    return issues;
  });

const finalizeDigaOrder = ({
  artifact,
  digaOrderId,
  finalizedAt,
  patientPrint,
  profileVersion,
  tokenArtifact,
}: typeof FinalizeDigaOrderArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const orderOption = yield* reader
      .table("digaOrders")
      .get(digaOrderId)
      .pipe(Effect.option);

    if (Option.isNone(orderOption)) {
      return { outcome: "order-not-found" as const };
    }

    const order = orderOption.value;
    if (order.status !== "draft") {
      return {
        digaOrderId,
        outcome: "not-draft" as const,
      };
    }

    const issues = yield* digaFinalizeIssues(order);
    if (issues.some((issue) => issue.blocking)) {
      return {
        digaOrderId,
        issues,
        outcome: "blocked" as const,
      };
    }

    const issued: {
      artifactId: Id<"artifacts">;
      documentId: ClinicalDocumentId;
      formInstanceId?: Id<"formInstances">;
      patientPrintArtifactId?: Id<"artifacts">;
      revisionId: DocumentRevisionId;
    } = yield* issueDocumentRevision({
      artifact,
      artifactFamily: "EVDGA",
      artifactSubtype: "kbv-device-request-bundle",
      authorOrganizationId: order.organizationId,
      authorPractitionerId: order.practitionerId,
      contentType: artifact.attachment.contentType,
      effectiveDate: finalizedAt,
      kind: "evdga",
      originInterface: "eVDGA",
      patientId: order.patientId,
      status: "final",
      summary: {
        title: "eVDGA",
        ...(artifact.externalIdentifier
          ? { externalIdentifier: artifact.externalIdentifier }
          : {}),
      },
      transportKind: "fhir-bundle-xml",
      ...(profileVersion ? { profileVersion } : {}),
      ...(patientPrint ? { patientPrint } : {}),
    });

    const tokenArtifactId = tokenArtifact
      ? yield* createArtifact({
          artifactFamily: "EVDGA",
          artifactSubtype: "token",
          attachment: tokenArtifact.attachment,
          contentType: tokenArtifact.attachment.contentType,
          direction: "outbound",
          ownerId: String(issued.revisionId),
          ownerKind: "documentRevision",
          transportKind: "ti-token",
          ...(tokenArtifact.externalIdentifier
            ? { externalIdentifier: tokenArtifact.externalIdentifier }
            : {}),
          immutableAt: finalizedAt,
        })
      : undefined;

    yield* writer.table("digaOrders").patch(digaOrderId, {
      artifactDocumentId: issued.documentId,
      status: "final",
    });

    return {
      artifactId: issued.artifactId,
      digaOrderId,
      documentId: issued.documentId,
      outcome: "finalized" as const,
      revisionId: issued.revisionId,
      ...(issued.patientPrintArtifactId
        ? { patientPrintArtifactId: issued.patientPrintArtifactId }
        : {}),
      ...(tokenArtifactId ? { tokenArtifactId } : {}),
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
            (row) =>
              row.patientId === args.patientId && row.status === "current",
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
      .filter(
        (plan) => plan.patientId === patientId && plan.status === "current",
      )
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
      entries,
      found: true as const,
      plan: currentPlan,
    };
  });

const buildVosPayload = ({
  kId,
  medicationOrderId,
  profileVersion,
}: typeof RenderVosBundleArgs.Type) =>
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
    const practitioner = yield* reader
      .table("practitioners")
      .get(order.practitionerId);
    const organization = yield* reader
      .table("organizations")
      .get(order.organizationId);
    const coverage = yield* reader.table("coverages").get(order.coverageId);
    const identifiers = yield* reader
      .table("patientIdentifiers")
      .index("by_patientId_and_isPrimary")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter((row) => row.patientId === patient._id),
        ),
      );

    const catalogRef = order.medicationCatalogRefId
      ? yield* reader
          .table("medicationCatalogRefs")
          .get(order.medicationCatalogRefId)
          .pipe(Effect.option)
      : Option.none();

    const patientResource = {
      address: patient.addresses,
      ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
      ...(patient.administrativeGender?.code
        ? { gender: patient.administrativeGender.code }
        : {}),
      id: String(patient._id),
      identifier: identifiers.map((identifier) => identifier.identifier),
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Patient"],
      },
      name: patient.names,
      resourceType: "Patient" as const,
      telecom: patient.telecom,
    };

    const practitionerResource = {
      id: String(practitioner._id),
      identifier: practitioner.lanr
        ? [{ system: "urn:kbv:lanr", value: practitioner.lanr }]
        : [],
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner",
        ],
      },
      name: practitioner.names,
      resourceType: "Practitioner" as const,
    };

    const organizationResource = {
      address: organization.addresses,
      id: String(organization._id),
      identifier: organization.identifiers,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Organization",
        ],
      },
      name: organization.name,
      resourceType: "Organization" as const,
      telecom: organization.telecom,
    };

    const coverageResource = {
      beneficiary: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
      id: String(coverage._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Coverage",
        ],
      },
      payor: [
        toFhirReference(
          "Organization",
          String(organization._id),
          coverage.kostentraegerName ?? organization.name,
        ),
      ],
      resourceType: "Coverage" as const,
      status: "active",
      type: toCoverageType(coverage.kind),
    };

    const medicationText = Option.isSome(catalogRef)
      ? catalogRef.value.displayName
      : order.freeTextMedication?.trim();
    if (!medicationText) {
      return { found: false as const };
    }

    const medicationResource = {
      ...(Option.isSome(catalogRef)
        ? {
            code: {
              coding: [
                {
                  code: catalogRef.value.pzn,
                  display: catalogRef.value.displayName,
                  system: "http://fhir.de/CodeSystem/ifa/pzn",
                },
              ],
              text: catalogRef.value.displayName,
            },
          }
        : {
            code: {
              coding: [],
              text: medicationText,
            },
          }),
      ...(Option.isSome(catalogRef) && catalogRef.value.doseForm
        ? { form: catalogRef.value.doseForm }
        : {}),
      id: `medication-${String(order._id)}`,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Medication_PZN",
        ],
      },
      resourceType: "Medication" as const,
    };

    const medicationRequestResource = {
      authoredOn: order.authoredOn,
      dosageInstruction: order.dosageText ? [{ text: order.dosageText }] : [],
      id: `medication-request-${String(order._id)}`,
      insurance: [toFhirReference("Coverage", String(coverage._id))],
      intent: "proposal",
      medicationReference: toFhirReference(
        "Medication",
        medicationResource.id,
        medicationText,
      ),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Medication_Request",
        ],
      },
      requester: toFhirReference(
        "Practitioner",
        String(practitioner._id),
        practitioner.displayName,
      ),
      resourceType: "MedicationRequest" as const,
      status: order.status === "cancelled" ? "cancelled" : "active",
      subject: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
    };

    const resolvedKId = kId ?? `vos-${String(order._id)}`;
    const bundle = {
      entry: [
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
      id: `bundle-${resolvedKId}`,
      identifier: {
        system: "urn:kbv:vos:kid",
        value: resolvedKId,
      },
      resourceType: "Bundle" as const,
      timestamp: order.authoredOn,
      type: "collection" as const,
    };

    return {
      found: true as const,
      json: {
        boundaryKind: "partially reversible" as const,
        contentType: "application/fhir+json" as const,
        family: "VoS" as const,
      },
      payload: {
        bundle,
        coverage: coverageResource,
        medicationRequests: [medicationRequestResource],
        medications: [medicationResource],
        organization: organizationResource,
        patient: patientResource,
        practitioner: practitionerResource,
        profileVersion: profileVersion ?? "draft",
      },
    };
  });

const listVosProjectedResources = (payload: typeof VosPayload.Type) => [
  payload.bundle,
  payload.patient,
  payload.practitioner,
  payload.organization,
  payload.coverage,
  ...payload.medications,
  ...payload.medicationRequests,
];

const matchesVosIdentifier = (
  resource: ReturnType<typeof listVosProjectedResources>[number],
  identifierValue?: string,
) => {
  if (!identifierValue) {
    return true;
  }

  if (
    "identifier" in resource &&
    Array.isArray(resource.identifier) &&
    resource.identifier.some(
      (identifier: { readonly value: string }) =>
        identifier.value === identifierValue,
    )
  ) {
    return true;
  }

  if (
    resource.resourceType === "Bundle" &&
    resource.identifier.value === identifierValue
  ) {
    return true;
  }

  return false;
};

const matchesVosResourceId = (
  resource: ReturnType<typeof listVosProjectedResources>[number],
  resourceId?: string,
) => {
  if (!resourceId) {
    return true;
  }

  return resource.id === resourceId;
};

const resolveVosExchange = ({
  kId,
  requestedAt,
}: typeof ReadVosBundleArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const jobs = yield* reader
      .table("integrationJobs")
      .index("by_idempotencyKey")
      .collect();
    const job = jobs
      .filter(
        (row) =>
          row.idempotencyKey === kId &&
          row.jobType === "vos-call-bundle" &&
          row.direction === "outbound",
      )
      .sort((left, right) => left._creationTime - right._creationTime)
      .at(-1);

    if (!job || !job.payloadArtifactId || !job.nextAttemptAt) {
      return { found: false as const, reason: "not-published" as const };
    }

    if (requestedAt.localeCompare(job.nextAttemptAt) > 0) {
      return {
        found: false as const,
        reason: "expired" as const,
      };
    }

    const artifact = yield* reader
      .table("artifacts")
      .get(job.payloadArtifactId);
    const revisionId = artifact.ownerId as DocumentRevisionId;
    const revision = yield* reader.table("documentRevisions").get(revisionId);

    return {
      artifactId: artifact._id,
      documentId: revision.documentId,
      expiresAt: job.nextAttemptAt,
      found: true as const,
      medicationOrderId: job.ownerId as MedicationOrderId,
      profileVersion: artifact.profileVersion,
    };
  });

const renderVosBundle = buildVosPayload;

const publishVosBundle = ({
  artifact,
  expiresAt,
  issuedAt,
  kId,
  medicationOrderId,
  profileVersion,
}: typeof PublishVosBundleArgs.Type) =>
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
    const issues = yield* medicationFinalizeIssues(order);
    const activeJobs = yield* reader
      .table("integrationJobs")
      .index("by_idempotencyKey")
      .collect();
    const duplicate = activeJobs.find(
      (row) =>
        row.idempotencyKey === kId &&
        row.jobType === "vos-call-bundle" &&
        row.direction === "outbound" &&
        row.nextAttemptAt !== undefined &&
        issuedAt.localeCompare(row.nextAttemptAt) <= 0,
    );

    if (order.status === "cancelled" || order.status === "superseded") {
      issues.push({
        blocking: true,
        code: "VOS_ORDER_STATUS_UNSUPPORTED",
        message:
          "Cancelled or superseded prescriptions cannot be published to VoS.",
      });
    }

    if (issuedAt.localeCompare(expiresAt) >= 0) {
      issues.push({
        blocking: true,
        code: "VOS_WINDOW_INVALID",
        message: "The VoS availability window must end after issuance.",
      });
    }

    if (duplicate) {
      issues.push({
        blocking: true,
        code: "VOS_KID_ALREADY_ACTIVE",
        message:
          "The provided kID is already active for another VoS publication.",
      });
    }

    if (issues.some((issue) => issue.blocking)) {
      return {
        issues,
        medicationOrderId,
        outcome: "blocked" as const,
      };
    }

    const rendered = yield* buildVosPayload({
      kId,
      medicationOrderId,
      ...(profileVersion ? { profileVersion } : {}),
    });
    if (!rendered.found) {
      return { outcome: "order-not-found" as const };
    }

    const issued = yield* issueDocumentRevision({
      artifact,
      artifactFamily: "VoS",
      artifactSubtype: "aufruf-bundle",
      authorOrganizationId: order.organizationId,
      authorPractitionerId: order.practitionerId,
      contentType: artifact.attachment.contentType,
      effectiveDate: issuedAt,
      kind: "vos",
      originInterface: "VoS",
      patientId: order.patientId,
      profileVersion,
      status: "final",
      summary: {
        externalIdentifier: kId,
        title: "VoS Aufruf-Bundle",
      },
      transportKind: rendered.json.contentType,
    });

    const jobId = yield* writer.table("integrationJobs").insert({
      attemptCount: 0,
      counterparty: "VoS",
      direction: "outbound",
      idempotencyKey: kId,
      jobType: "vos-call-bundle",
      nextAttemptAt: expiresAt,
      ownerId: String(medicationOrderId),
      ownerKind: "medicationOrder",
      payloadArtifactId: issued.artifactId,
      status: "waiting",
    });

    yield* writer.table("artifacts").patch(issued.artifactId, {
      validationSummary: `Published for kID ${kId} until ${expiresAt}.`,
    });

    return {
      artifactId: issued.artifactId,
      documentId: issued.documentId,
      jobId,
      kId,
      medicationOrderId,
      outcome: "published" as const,
      revisionId: issued.revisionId,
    };
  });

const readVosBundle = ({ kId, requestedAt }: typeof ReadVosBundleArgs.Type) =>
  Effect.gen(function* () {
    const exchange = yield* resolveVosExchange({ kId, requestedAt });
    if (!exchange.found) {
      return exchange;
    }

    const rendered = yield* buildVosPayload({
      kId,
      medicationOrderId: exchange.medicationOrderId,
      ...(exchange.profileVersion
        ? { profileVersion: exchange.profileVersion }
        : {}),
    });
    if (!rendered.found) {
      return { found: false as const, reason: "not-published" as const };
    }

    return {
      artifactId: exchange.artifactId,
      documentId: exchange.documentId,
      expiresAt: exchange.expiresAt,
      found: true as const,
      json: rendered.json,
      kId,
      payload: rendered.payload,
    };
  });

const readVosResource = ({
  kId,
  requestedAt,
  resourceId,
  resourceType,
}: typeof ReadVosResourceArgs.Type) =>
  Effect.gen(function* () {
    const bundle = yield* readVosBundle({ kId, requestedAt });
    if (!bundle.found) {
      return bundle.reason === "expired"
        ? { found: false as const, reason: "expired" as const }
        : { found: false as const, reason: "not-published" as const };
    }

    const resource = listVosProjectedResources(bundle.payload).find(
      (entry) =>
        entry.resourceType === resourceType &&
        matchesVosResourceId(entry, resourceId),
    );

    if (!resource) {
      return { found: false as const, reason: "resource-not-found" as const };
    }

    return {
      found: true as const,
      resource,
    };
  });

const searchVosResources = ({
  identifierValue,
  kId,
  requestedAt,
  resourceId,
  resourceType,
}: typeof SearchVosResourcesArgs.Type) =>
  Effect.gen(function* () {
    const bundle = yield* readVosBundle({ kId, requestedAt });
    if (!bundle.found) {
      return bundle.reason === "expired"
        ? { found: false as const, reason: "expired" as const }
        : { found: false as const, reason: "not-published" as const };
    }

    return {
      found: true as const,
      resources: listVosProjectedResources(bundle.payload).filter(
        (resource) =>
          resource.resourceType === resourceType &&
          matchesVosResourceId(resource, resourceId) &&
          matchesVosIdentifier(resource, identifierValue),
      ),
    };
  });

const importVosBundle = ({
  artifact,
  coverageId,
  importedAt,
  kId,
  medicationOrders,
  medicationPlan,
  organizationId,
  patientId,
  practitionerId,
  profileVersion,
}: typeof ImportVosBundleArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const issues: (typeof WorkflowIssue.Type)[] = [];

    if (
      medicationOrders.length === 0 &&
      (!medicationPlan || medicationPlan.entries.length === 0)
    ) {
      issues.push({
        blocking: true,
        code: "VOS_IMPORT_EMPTY",
        message:
          "VoS storage bundles must include at least one order or plan entry.",
      });
    }

    for (const order of medicationOrders) {
      const orderIssues = yield* medicationFinalizeIssues(order);
      issues.push(...orderIssues);
    }

    if (issues.some((issue) => issue.blocking)) {
      return {
        issues,
        outcome: "blocked" as const,
      };
    }

    const issued = yield* issueDocumentRevision({
      artifact,
      artifactDirection: "inbound",
      artifactFamily: "VoS",
      artifactSubtype: "speicher-bundle",
      authorOrganizationId: organizationId,
      authorPractitionerId: practitionerId,
      contentType: artifact.attachment.contentType,
      effectiveDate: importedAt,
      kind: "vos",
      originInterface: "VoS",
      patientId,
      profileVersion,
      status: "imported",
      summary: {
        ...(kId ? { externalIdentifier: kId } : {}),
        title: "VoS Speicher-Bundle",
      },
      transportKind: "application/fhir+json",
    });

    const importedMedicationOrderIds: MedicationOrderId[] = [];
    for (const order of medicationOrders) {
      const medicationOrderId = yield* writer.table("medicationOrders").insert({
        artifactDocumentId: issued.documentId,
        authoredOn: order.authoredOn,
        coverageId,
        ...(order.dosageText ? { dosageText: order.dosageText } : {}),
        ...(order.freeTextMedication
          ? { freeTextMedication: order.freeTextMedication }
          : {}),
        ...(order.legalBasisCode
          ? { legalBasisCode: order.legalBasisCode }
          : {}),
        ...(order.medicationCatalogRefId
          ? { medicationCatalogRefId: order.medicationCatalogRefId }
          : {}),
        orderKind: order.orderKind,
        organizationId,
        ...(order.packageCount ? { packageCount: order.packageCount } : {}),
        patientId,
        practitionerId,
        prescriptionContext: order.prescriptionContext,
        prescriptionMode: order.prescriptionMode,
        ...(order.quantity ? { quantity: order.quantity } : {}),
        ...(order.serFlag !== undefined ? { serFlag: order.serFlag } : {}),
        ...(order.specialRecipeType
          ? { specialRecipeType: order.specialRecipeType }
          : {}),
        status: order.status,
        ...(order.statusCoPaymentCode
          ? { statusCoPaymentCode: order.statusCoPaymentCode }
          : {}),
        ...(order.substitutionAllowed !== undefined
          ? { substitutionAllowed: order.substitutionAllowed }
          : {}),
      });
      importedMedicationOrderIds.push(medicationOrderId);
    }

    let medicationPlanId: MedicationPlanId | undefined;
    if (medicationPlan) {
      const currentPlans = yield* reader
        .table("medicationPlans")
        .index("by_patientId_and_status")
        .collect()
        .pipe(
          Effect.map((rows) =>
            rows.filter(
              (row) => row.patientId === patientId && row.status === "current",
            ),
          ),
        );

      for (const plan of currentPlans) {
        yield* writer.table("medicationPlans").patch(plan._id, {
          status: "superseded",
        });
      }

      medicationPlanId = yield* writer.table("medicationPlans").insert({
        ...(medicationPlan.barcodePayload
          ? { barcodePayload: medicationPlan.barcodePayload }
          : {}),
        ...(medicationPlan.bmpVersion
          ? { bmpVersion: medicationPlan.bmpVersion }
          : {}),
        ...(medicationPlan.documentIdentifier
          ? { documentIdentifier: medicationPlan.documentIdentifier }
          : {}),
        issuerPractitionerId: practitionerId,
        issuingOrganizationId: organizationId,
        patientId,
        ...(medicationPlan.setIdentifier
          ? { setIdentifier: medicationPlan.setIdentifier }
          : {}),
        sourceArtifactId: issued.artifactId,
        sourceKind: "vos",
        status: "current",
        updatedAt: medicationPlan.updatedAt,
      });

      for (const entry of medicationPlan.entries) {
        yield* writer.table("medicationPlanEntries").insert({
          ...(entry.activeIngredientText
            ? { activeIngredientText: entry.activeIngredientText }
            : {}),
          displayName: entry.displayName,
          ...(entry.dosageText ? { dosageText: entry.dosageText } : {}),
          ...(entry.doseFormText ? { doseFormText: entry.doseFormText } : {}),
          entrySource: "imported-plan",
          hasBoundSupplementLine: entry.supplementLineText !== undefined,
          ...(entry.indicationText
            ? { indicationText: entry.indicationText }
            : {}),
          isRecipePreparation: entry.isRecipePreparation,
          planId: medicationPlanId,
          printOnPlan: entry.printOnPlan,
          ...(entry.productCode ? { productCode: entry.productCode } : {}),
          sortOrder: entry.sortOrder,
          ...(entry.strengthText ? { strengthText: entry.strengthText } : {}),
          ...(entry.supplementLineText
            ? { supplementLineText: entry.supplementLineText }
            : {}),
        });
      }
    }

    const inboundJobId = yield* writer.table("integrationJobs").insert({
      attemptCount: 1,
      counterparty: "VoS",
      direction: "inbound",
      idempotencyKey: kId
        ? `vos-storage:${kId}`
        : `vos-storage:${String(issued.artifactId)}`,
      jobType: "vos-storage-bundle",
      ownerId: String(issued.documentId),
      ownerKind: "clinicalDocument",
      payloadArtifactId: issued.artifactId,
      status: "done",
    });

    if (kId) {
      const jobs = yield* reader
        .table("integrationJobs")
        .index("by_idempotencyKey")
        .collect();
      for (const job of jobs.filter(
        (row) =>
          row.idempotencyKey === kId &&
          row.jobType === "vos-call-bundle" &&
          row.direction === "outbound",
      )) {
        yield* writer.table("integrationJobs").patch(job._id, {
          status: "done",
        });
      }
    }

    yield* writer.table("artifacts").patch(issued.artifactId, {
      validationStatus: "valid",
      validationSummary: `Imported VoS storage bundle via job ${String(inboundJobId)}.`,
    });

    return {
      artifactId: issued.artifactId,
      documentId: issued.documentId,
      importedMedicationOrderIds,
      ...(medicationPlanId ? { medicationPlanId } : {}),
      outcome: "imported" as const,
      revisionId: issued.revisionId,
    };
  });

const createHeilmittelApproval = (
  args: typeof CreateHeilmittelApprovalArgs.Type,
) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const approvalId = yield* writer.table("heilmittelApprovals").insert(args);
    return { approvalId };
  });

const createHeilmittelOrder = (args: typeof CreateHeilmittelOrderArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const heilmittelOrderId = yield* writer
      .table("heilmittelOrders")
      .insert(args);
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
  artifact,
  finalizedAt,
  heilmittelOrderId,
  printForm,
  profileVersion,
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
        heilmittelOrderId,
        outcome: "not-draft" as const,
      };
    }

    const issues = yield* heilmittelFinalizeIssues(order);
    if (issues.some((issue) => issue.blocking)) {
      return {
        heilmittelOrderId,
        issues,
        outcome: "blocked" as const,
      };
    }

    const issued: {
      artifactId: Id<"artifacts">;
      documentId: ClinicalDocumentId;
      formInstanceId?: Id<"formInstances">;
      patientPrintArtifactId?: Id<"artifacts">;
      revisionId: DocumentRevisionId;
    } = yield* issueDocumentRevision({
      artifact,
      artifactFamily: "Heilmittel",
      artifactSubtype: "heilmittel-order",
      authorOrganizationId: order.organizationId,
      authorPractitionerId: order.practitionerId,
      contentType: artifact.attachment.contentType,
      effectiveDate: finalizedAt,
      kind: "heilmittel",
      originInterface: "Heilmittel",
      patientId: order.patientId,
      status: "final",
      summary: {
        title: `Heilmittel ${order.diagnosegruppe}`,
        ...(artifact.externalIdentifier
          ? { externalIdentifier: artifact.externalIdentifier }
          : {}),
      },
      transportKind: printForm ? "print" : "fhir-bundle-xml",
      ...(profileVersion ? { profileVersion } : {}),
      ...(printForm
        ? {
            formSubjectId: String(heilmittelOrderId),
            formSubjectKind: "heilmittel" as const,
            printForm,
          }
        : {}),
    });

    yield* writer.table("heilmittelOrders").patch(heilmittelOrderId, {
      artifactDocumentId: issued.documentId,
      status: "final",
    });

    return {
      artifactId: issued.artifactId,
      documentId: issued.documentId,
      heilmittelOrderId,
      outcome: "finalized" as const,
      revisionId: issued.revisionId,
      ...(issued.formInstanceId
        ? { formInstanceId: issued.formInstanceId }
        : {}),
    };
  });

const registerFormDefinition = (args: typeof RegisterFormDefinitionArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const formDefinitionId = yield* writer
      .table("formDefinitions")
      .insert(args);
    return { formDefinitionId };
  });

const listFormDefinitions = ({
  activeOnly,
  theme,
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

    const revisionIds = new Set(
      revisions.map((revision) => String(revision._id)),
    );
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
      artifacts,
      document: documentOption.value,
      found: true as const,
      revisions,
    };
  });

const listDocumentsByPatient = ({
  kind,
  patientId,
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
  lastTouchedAt,
  lastTouchedBy,
  ownerId,
  ownerKind,
  schemaVersion,
  snapshot,
  status,
  workflowKind,
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
        lastTouchedAt,
        lastTouchedBy,
        schemaVersion,
        snapshot,
        status: status ?? "open",
      });
      return {
        created: false,
        draftWorkspaceId: existingWorkspace._id,
      };
    }

    const draftWorkspaceId = yield* writer.table("draftWorkspaces").insert({
      lastTouchedAt,
      lastTouchedBy,
      ownerId,
      ownerKind,
      schemaVersion,
      snapshot,
      status: status ?? "open",
      workflowKind,
    });

    return {
      created: true,
      draftWorkspaceId,
    };
  });

const getWorkspace = ({
  ownerId,
  ownerKind,
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
      .sort((left, right) =>
        left.lastTouchedAt.localeCompare(right.lastTouchedAt),
      )
      .at(-1);

    if (!workspace) {
      return { found: false as const };
    }

    return {
      draftWorkspace: workspace,
      found: true as const,
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
      lastTouchedAt: promotedAt,
      lastTouchedBy: promotedBy,
      status: "promoted",
    });

    return {
      draftWorkspaceId,
      outcome: "promoted" as const,
    };
  });

const toFhirReference = (table: string, id: string, display?: string) => ({
  reference: `${table}/${id}`,
  ...(display ? { display } : {}),
});

const toCoverageType = (kind: string) => ({
  coding: [
    {
      code: kind,
      system: "urn:coverage-kind",
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
    const practitioner = yield* reader
      .table("practitioners")
      .get(order.practitionerId);
    const organization = yield* reader
      .table("organizations")
      .get(order.organizationId);
    const coverage = yield* reader.table("coverages").get(order.coverageId);
    const identifiers = yield* reader
      .table("patientIdentifiers")
      .index("by_patientId_and_isPrimary")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter((row) => row.patientId === patient._id),
        ),
      );

    const medicationCatalogRef = order.medicationCatalogRefId
      ? yield* reader
          .table("medicationCatalogRefs")
          .get(order.medicationCatalogRefId)
          .pipe(Effect.option)
      : Option.none();

    const patientResource = {
      id: String(patient._id),
      identifier: identifiers.map((identifier) => identifier.identifier),
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Patient"],
      },
      name: patient.names,
      resourceType: "Patient" as const,
      ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
      ...(patient.administrativeGender?.code
        ? { gender: patient.administrativeGender.code }
        : {}),
      address: patient.addresses,
      telecom: patient.telecom,
    };

    const practitionerResource = {
      id: String(practitioner._id),
      identifier: practitioner.lanr
        ? [
            {
              system: "urn:kbv:lanr",
              value: practitioner.lanr,
            },
          ]
        : [],
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner",
        ],
      },
      name: practitioner.names,
      resourceType: "Practitioner" as const,
    };

    const organizationResource = {
      address: organization.addresses,
      id: String(organization._id),
      identifier: organization.identifiers,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Organization",
        ],
      },
      name: organization.name,
      resourceType: "Organization" as const,
      telecom: organization.telecom,
    };

    const coverageResource = {
      beneficiary: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
      id: String(coverage._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Coverage",
        ],
      },
      payor: [
        toFhirReference(
          "Organization",
          String(organization._id),
          coverage.kostentraegerName ?? organization.name,
        ),
      ],
      resourceType: "Coverage" as const,
      status: "active",
      type: toCoverageType(coverage.kind),
    };

    const medicationDisplay = Option.isSome(medicationCatalogRef)
      ? medicationCatalogRef.value.displayName
      : (order.freeTextMedication ?? "Medikation");
    const medicationResource = {
      code: {
        coding: [
          {
            code: Option.isSome(medicationCatalogRef)
              ? medicationCatalogRef.value.pzn
              : (order.freeTextMedication ?? medicationDisplay),
            display: medicationDisplay,
            system: Option.isSome(medicationCatalogRef)
              ? "urn:pzn"
              : "urn:text",
          },
        ],
        text: medicationDisplay,
      },
      id: `medication-${String(medicationOrderId)}`,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Medication",
        ],
      },
      resourceType: "Medication" as const,
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
      authoredOn: order.authoredOn,
      dosageInstruction: order.dosageText
        ? [
            {
              text: order.dosageText,
            },
          ]
        : [],
      id: `medication-request-${String(medicationOrderId)}`,
      insurance: [toFhirReference("Coverage", String(coverage._id))],
      intent: "order",
      medicationReference: toFhirReference(
        "Medication",
        `medication-${String(medicationOrderId)}`,
        medicationDisplay,
      ),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Medication_Request",
        ],
      },
      requester: toFhirReference(
        "Practitioner",
        String(practitioner._id),
        practitioner.displayName,
      ),
      resourceType: "MedicationRequest" as const,
      status: order.status === "cancelled" ? "cancelled" : "active",
      subject: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
    };

    const composition = {
      author: [
        toFhirReference(
          "Practitioner",
          String(practitioner._id),
          practitioner.displayName,
        ),
      ],
      date: order.authoredOn,
      id: `composition-${String(medicationOrderId)}`,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Composition",
        ],
      },
      resourceType: "Composition" as const,
      status: "final",
      subject: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
      title: "eRezept",
      type: {
        coding: [
          {
            code: "60590-7",
            display: "Medication prescription",
            system: "http://loinc.org",
          },
        ],
      },
    };

    const bundle = {
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
      identifier: {
        system: "urn:ietf:rfc:3986",
        value: `urn:uuid:${String(medicationOrderId)}`,
      },
      resourceType: "Bundle" as const,
      timestamp: order.authoredOn,
      type: "document" as const,
    };

    const payload = {
      bundle,
      composition,
      coverage: coverageResource,
      medication: medicationResource,
      medicationRequest: medicationRequestResource,
      organization: organizationResource,
      patient: patientResource,
      practitioner: practitionerResource,
      profileVersion: profileVersion ?? "1.4.1",
    };

    return {
      found: true as const,
      payload,
      validationPlan:
        buildOraclePlan({
          family: "eRezept",
          ...(order.artifactDocumentId
            ? { documentId: String(order.artifactDocumentId) }
            : {}),
          profileVersion: profileVersion ?? "1.4.1",
        }) ?? undefined,
      xml: {
        boundaryKind: "emit-only" as const,
        contentType: "application/fhir+xml" as const,
        encoding: "UTF-8" as const,
        family: "ERP" as const,
        xml: renderErpBundleXml(payload),
      },
    };
  });

const buildEvdgaPayload = ({
  digaOrderId,
  profileVersion,
}: typeof RenderEvdgaBundleArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const orderOption = yield* reader
      .table("digaOrders")
      .get(digaOrderId)
      .pipe(Effect.option);

    if (Option.isNone(orderOption)) {
      return { found: false as const };
    }

    const order = orderOption.value;
    const patient = yield* reader.table("patients").get(order.patientId);
    const practitioner = yield* reader
      .table("practitioners")
      .get(order.practitionerId);
    const organization = yield* reader
      .table("organizations")
      .get(order.organizationId);
    const coverage = yield* reader.table("coverages").get(order.coverageId);
    const identifiers = yield* reader
      .table("patientIdentifiers")
      .index("by_patientId_and_isPrimary")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter((row) => row.patientId === patient._id),
        ),
      );
    const catalogRefOption = yield* reader
      .table("digaCatalogRefs")
      .get(order.digaCatalogRefId)
      .pipe(Effect.option);

    if (Option.isNone(catalogRefOption)) {
      return { found: false as const };
    }

    const catalogRef = catalogRefOption.value;

    const patientResource = {
      id: String(patient._id),
      identifier: identifiers.map((identifier) => identifier.identifier),
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Patient"],
      },
      name: patient.names,
      resourceType: "Patient" as const,
      ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
      ...(patient.administrativeGender?.code
        ? { gender: patient.administrativeGender.code }
        : {}),
      address: patient.addresses,
      telecom: patient.telecom,
    };

    const practitionerResource = {
      id: String(practitioner._id),
      identifier: practitioner.lanr
        ? [{ system: "urn:kbv:lanr", value: practitioner.lanr }]
        : [],
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner",
        ],
      },
      name: practitioner.names,
      resourceType: "Practitioner" as const,
    };

    const organizationResource = {
      address: organization.addresses,
      id: String(organization._id),
      identifier: organization.identifiers,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Organization",
        ],
      },
      name: organization.name,
      resourceType: "Organization" as const,
      telecom: organization.telecom,
    };

    const coverageResource = {
      beneficiary: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
      id: String(coverage._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Coverage",
        ],
      },
      payor: [
        toFhirReference(
          "Organization",
          String(organization._id),
          coverage.kostentraegerName ?? organization.name,
        ),
      ],
      resourceType: "Coverage" as const,
      status: "active",
      type: toCoverageType(coverage.kind),
    };

    const composition = {
      author: [
        toFhirReference(
          "Practitioner",
          String(practitioner._id),
          practitioner.displayName,
        ),
      ],
      date: order.authoredOn,
      id: `composition-${String(digaOrderId)}`,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_EVDGA_Composition",
        ],
      },
      resourceType: "Composition" as const,
      status: "final",
      subject: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
      title: "eVDGA",
      type: {
        coding: [
          {
            code: "evdga",
            display: "eVDGA",
            system: "urn:kbv:document-kind",
          },
        ],
        text: "eVDGA",
      },
    };

    const deviceRequest = {
      authoredOn: order.authoredOn,
      codeCodeableConcept: {
        coding: [
          {
            code: catalogRef.pzn,
            display: catalogRef.verordnungseinheitName,
            system: "http://fhir.de/CodeSystem/ifa/pzn",
          },
        ],
        text:
          catalogRef.digaModulName ??
          catalogRef.digaName ??
          catalogRef.verordnungseinheitName,
      },
      id: `device-request-${String(digaOrderId)}`,
      insurance: [toFhirReference("Coverage", String(coverage._id))],
      intent: "order",
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_EVDGA_DeviceRequest",
        ],
      },
      reasonCode: catalogRef.indikationen,
      requester: toFhirReference(
        "Practitioner",
        String(practitioner._id),
        practitioner.displayName,
      ),
      resourceType: "DeviceRequest" as const,
      status: order.status === "cancelled" ? "revoked" : "active",
      subject: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
    };

    const payload = {
      bundle: {
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
            fullUrl: `urn:uuid:${deviceRequest.id}`,
            resource: deviceRequest,
          },
        ],
        identifier: {
          system: "urn:ietf:rfc:3986",
          value: `urn:uuid:${String(digaOrderId)}`,
        },
        resourceType: "Bundle" as const,
        timestamp: order.authoredOn,
        type: "document" as const,
      },
      composition,
      coverage: coverageResource,
      deviceRequest,
      organization: organizationResource,
      patient: patientResource,
      practitioner: practitionerResource,
      profileVersion: profileVersion ?? "1.2.2",
    };

    return {
      found: true as const,
      payload,
      validationPlan:
        buildOraclePlan({
          family: "eVDGA",
          ...(order.artifactDocumentId
            ? { documentId: String(order.artifactDocumentId) }
            : {}),
          profileVersion: profileVersion ?? "1.2.2",
        }) ?? undefined,
      xml: {
        boundaryKind: "emit-only" as const,
        contentType: "application/fhir+xml" as const,
        encoding: "UTF-8" as const,
        family: "EVDGA" as const,
        xml: renderEvdgaBundleXml(payload),
      },
    };
  });

const buildEauPayload = ({
  attesterPractitionerId,
  coverageId,
  diagnosisIds,
  documentId,
  encounterId,
  organizationId,
  profileVersion,
  signerPractitionerId,
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
    const attester = yield* reader
      .table("practitioners")
      .get(attesterPractitionerId);
    const signer = signerPractitionerId
      ? yield* reader
          .table("practitioners")
          .get(signerPractitionerId)
          .pipe(Effect.option)
      : Option.none();
    const organization = yield* reader
      .table("organizations")
      .get(organizationId);
    const coverage = yield* reader.table("coverages").get(coverageId);
    const identifiers = yield* reader
      .table("patientIdentifiers")
      .index("by_patientId_and_isPrimary")
      .collect()
      .pipe(
        Effect.map((rows) =>
          rows.filter((row) => row.patientId === patient._id),
        ),
      );
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
      id: String(patient._id),
      identifier: identifiers.map((identifier) => identifier.identifier),
      meta: {
        profile: ["https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Patient"],
      },
      name: patient.names,
      resourceType: "Patient" as const,
      ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
      ...(patient.administrativeGender?.code
        ? { gender: patient.administrativeGender.code }
        : {}),
      address: patient.addresses,
      telecom: patient.telecom,
    };

    const practitionerResource = {
      id: String(attester._id),
      identifier: attester.lanr
        ? [
            {
              system: "urn:kbv:lanr",
              value: attester.lanr,
            },
          ]
        : [],
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner",
        ],
      },
      name: attester.names,
      resourceType: "Practitioner" as const,
    };

    const organizationResource = {
      address: organization.addresses,
      id: String(organization._id),
      identifier: organization.identifiers,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Organization",
        ],
      },
      name: organization.name,
      resourceType: "Organization" as const,
      telecom: organization.telecom,
    };

    const coverageResource = {
      beneficiary: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
      id: String(coverage._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Coverage",
        ],
      },
      payor: [
        toFhirReference(
          "Organization",
          String(organization._id),
          coverage.kostentraegerName ?? organization.name,
        ),
      ],
      resourceType: "Coverage" as const,
      status: "active",
      type: toCoverageType(coverage.kind),
    };

    const encounterResource = {
      class: {
        code: "AMB",
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      },
      id: String(encounter._id),
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_AU_Encounter",
        ],
      },
      period: {
        start: encounter.start,
        ...(encounter.end ? { end: encounter.end } : {}),
      },
      resourceType: "Encounter" as const,
      status: encounter.end ? "finished" : "in-progress",
      subject: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
    };

    const conditionResources = diagnoses.map((diagnosis) => ({
      code: {
        coding: [diagnosis.icd10gm],
        ...(diagnosis.diagnoseklartext
          ? { text: diagnosis.diagnoseklartext }
          : {}),
      },
      encounter: toFhirReference("Encounter", String(encounter._id)),
      id: `condition-${String(diagnosis._id)}`,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_AU_Condition",
        ],
      },
      recordedDate: encounter.start,
      resourceType: "Condition" as const,
      subject: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
    }));

    const composition = {
      author: [
        toFhirReference(
          "Practitioner",
          String(attester._id),
          attester.displayName,
        ),
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
      date: encounter.start,
      id: `composition-${String(documentId)}`,
      meta: {
        profile: [
          "https://fhir.kbv.de/StructureDefinition/KBV_PR_EAU_Composition",
        ],
      },
      resourceType: "Composition" as const,
      status: "final",
      subject: toFhirReference(
        "Patient",
        String(patient._id),
        patient.displayName,
      ),
      title: "eAU",
      type: {
        coding: [
          {
            code: "11488-4",
            display: "Consult note",
            system: "http://loinc.org",
          },
        ],
      },
    };

    const bundle = {
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
      identifier: {
        system: "urn:ietf:rfc:3986",
        value: `urn:uuid:${String(documentId)}`,
      },
      resourceType: "Bundle" as const,
      timestamp: encounter.start,
      type: "document" as const,
    };

    const payload = {
      bundle,
      composition,
      conditions: conditionResources,
      coverage: coverageResource,
      encounter: encounterResource,
      organization: organizationResource,
      patient: patientResource,
      practitioner: practitionerResource,
      profileVersion: profileVersion ?? "1.2.1",
    };

    return {
      found: true as const,
      payload,
      validationPlan:
        buildOraclePlan({
          documentId: String(documentId),
          family: "eAU",
          profileVersion: profileVersion ?? "1.2.1",
        }) ?? undefined,
      xml: {
        boundaryKind: "emit-only" as const,
        contentType: "application/fhir+xml" as const,
        encoding: "UTF-8" as const,
        family: "EAU" as const,
        xml: renderEauBundleXml(payload),
      },
    };
  });

const renderErpBundle = buildErpPayload;
const renderEvdgaBundle = buildEvdgaPayload;

const createEauDocument = ({
  artifact,
  attesterPractitionerId,
  coverageId,
  diagnosisIds,
  employerView,
  encounterId,
  finalizedAt,
  insurerView,
  organizationId,
  patientId,
  patientView,
  profileVersion,
  signerPractitionerId,
}: typeof CreateEauDocumentArgs.Type) =>
  Effect.gen(function* () {
    const issued = yield* issueDocumentRevision({
      artifact,
      artifactFamily: "EAU",
      artifactSubtype: "kbv-bundle-xml",
      authorOrganizationId: organizationId,
      authorPractitionerId: signerPractitionerId ?? attesterPractitionerId,
      contentType: artifact.attachment.contentType,
      effectiveDate: finalizedAt,
      kind: "eau",
      originInterface: "EAU",
      patientId,
      status: "final",
      summary: {
        title: "eAU",
        ...(artifact.externalIdentifier
          ? { externalIdentifier: artifact.externalIdentifier }
          : {}),
      },
      transportKind: "fhir-bundle-xml",
      ...(profileVersion ? { profileVersion } : {}),
    });

    const patientViewArtifactId = patientView
      ? yield* createArtifact({
          artifactFamily: "EAU",
          artifactSubtype: "patient-view",
          attachment: patientView.attachment,
          contentType: patientView.attachment.contentType,
          direction: "outbound",
          ownerId: String(issued.revisionId),
          ownerKind: "documentRevision",
          transportKind: "pdfa",
          ...(patientView.externalIdentifier
            ? { externalIdentifier: patientView.externalIdentifier }
            : {}),
          immutableAt: finalizedAt,
        })
      : undefined;

    const employerViewArtifactId = employerView
      ? yield* createArtifact({
          artifactFamily: "EAU",
          artifactSubtype: "employer-view",
          attachment: employerView.attachment,
          contentType: employerView.attachment.contentType,
          direction: "outbound",
          ownerId: String(issued.revisionId),
          ownerKind: "documentRevision",
          transportKind: "pdfa",
          ...(employerView.externalIdentifier
            ? { externalIdentifier: employerView.externalIdentifier }
            : {}),
          immutableAt: finalizedAt,
        })
      : undefined;

    const insurerViewArtifactId = insurerView
      ? yield* createArtifact({
          artifactFamily: "EAU",
          artifactSubtype: "insurer-view",
          attachment: insurerView.attachment,
          contentType: insurerView.attachment.contentType,
          direction: "outbound",
          ownerId: String(issued.revisionId),
          ownerKind: "documentRevision",
          transportKind: "pdfa",
          ...(insurerView.externalIdentifier
            ? { externalIdentifier: insurerView.externalIdentifier }
            : {}),
          immutableAt: finalizedAt,
        })
      : undefined;

    const renderResult = yield* buildEauPayload({
      attesterPractitionerId,
      diagnosisIds,
      documentId: issued.documentId,
      encounterId,
      ...(signerPractitionerId ? { signerPractitionerId } : {}),
      coverageId,
      organizationId,
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
      artifactId: issued.artifactId,
      documentId: issued.documentId,
      revisionId: issued.revisionId,
      ...(patientViewArtifactId ? { patientViewArtifactId } : {}),
      ...(employerViewArtifactId ? { employerViewArtifactId } : {}),
      ...(insurerViewArtifactId ? { insurerViewArtifactId } : {}),
    };
  });

const renderEauDocument = buildEauPayload;

const registerKimMailbox = (mailbox: typeof RegisterKimMailboxArgs.Type) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const mailboxId = yield* writer.table("kimMailboxes").insert(mailbox);
    return { mailboxId };
  });

const receiveEebInboxItem = ({
  attachment,
  coveragePayload,
  kimMailboxId,
  kimMessageId,
  onlineCheckErrorCode3012,
  onlineCheckPruefziffer3013,
  onlineCheckResult3011,
  onlineCheckTimestamp3010,
  receivedAt,
  schemaVersion3006,
  senderDisplay,
  senderVerified,
  serviceIdentifier,
  versichertenId3119,
}: typeof ReceiveEebInboxItemArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const mailboxOption = yield* reader
      .table("kimMailboxes")
      .get(kimMailboxId)
      .pipe(Effect.option);

    if (Option.isNone(mailboxOption)) {
      return { outcome: "kim-mailbox-not-found" as const };
    }

    const existingInboxItems = yield* reader
      .table("eebInboxItems")
      .index("by_kimMessageId")
      .collect();
    const existingInboxItem = existingInboxItems.find(
      (row) => row.kimMessageId === kimMessageId,
    );

    if (existingInboxItem) {
      return {
        inboxItemId: existingInboxItem._id,
        outcome: "duplicate-message" as const,
      };
    }

    const inboundKvid =
      versichertenId3119 ?? coveragePayload.versichertenId3119;
    const matchedPatientOption = yield* findPatientByKvid(inboundKvid);
    const matchedCoverageOption = Option.isSome(matchedPatientOption)
      ? yield* findCoverageForPatientAndPayload({
          coveragePayload,
          patientId: matchedPatientOption.value,
          ...(inboundKvid ? { versichertenId3119: inboundKvid } : {}),
        })
      : Option.none();

    const integrationJobId = yield* writer.table("integrationJobs").insert({
      attemptCount: 1,
      counterparty: "KIM",
      direction: "inbound",
      idempotencyKey: `eeb:${String(kimMailboxId)}:${kimMessageId}`,
      jobType: "eeb-receive",
      ownerId: String(kimMailboxId),
      ownerKind: "kimMailbox",
      status: "running",
    });

    const payloadArtifactId = yield* createArtifact({
      artifactFamily: "EEB",
      artifactSubtype: serviceIdentifier,
      attachment,
      contentType: attachment.contentType,
      direction: "inbound",
      externalIdentifier: kimMessageId,
      immutableAt: receivedAt,
      ownerId: String(integrationJobId),
      ownerKind: "integrationJob",
      transportKind: "kim",
      validationStatus: senderVerified ? "valid" : "pending",
    });

    yield* writer.table("integrationEvents").insert({
      artifactId: payloadArtifactId,
      eventType: "eeb-message-received",
      jobId: integrationJobId,
      message: `Received eEB message ${kimMessageId}.`,
      occurredAt: receivedAt,
    });

    const snapshotId = yield* writer.table("vsdSnapshots").insert({
      coveragePayload,
      ...(Option.isSome(matchedPatientOption)
        ? { patientId: matchedPatientOption.value }
        : {}),
      ...(onlineCheckErrorCode3012 ? { onlineCheckErrorCode3012 } : {}),
      ...(onlineCheckPruefziffer3013 ? { onlineCheckPruefziffer3013 } : {}),
      ...(onlineCheckResult3011 ? { onlineCheckResult3011 } : {}),
      ...(onlineCheckTimestamp3010 ? { onlineCheckTimestamp3010 } : {}),
      rawArtifactId: payloadArtifactId,
      readAt: receivedAt,
      readSource: "eeb",
      ...(schemaVersion3006 ? { schemaVersion3006 } : {}),
      ...(inboundKvid ? { versichertenId3119: inboundKvid } : {}),
    });

    const matchState = !senderVerified
      ? "manual-review"
      : Option.isSome(matchedPatientOption)
        ? "matched-existing"
        : inboundKvid
          ? "new-patient"
          : "manual-review";

    const inboxItemId = yield* writer.table("eebInboxItems").insert({
      adoptionState: "pending",
      kimMailboxId,
      kimMessageId,
      ...(Option.isSome(matchedCoverageOption)
        ? { matchedCoverageId: matchedCoverageOption.value }
        : {}),
      ...(Option.isSome(matchedPatientOption)
        ? { matchedPatientId: matchedPatientOption.value }
        : {}),
      matchState,
      payloadArtifactId,
      receivedAt,
      ...(senderDisplay ? { senderDisplay } : {}),
      senderVerified,
      serviceIdentifier,
    });

    const quarterCardRead = yield* quarterCardReadStatus({
      patientId: Option.isSome(matchedPatientOption)
        ? matchedPatientOption.value
        : undefined,
      timestamp: receivedAt,
    });

    yield* writer.table("integrationJobs").patch(integrationJobId, {
      payloadArtifactId,
      status: "done",
    });
    yield* writer.table("integrationEvents").insert({
      artifactId: payloadArtifactId,
      eventType: "eeb-match-evaluated",
      jobId: integrationJobId,
      message: `eEB message ${kimMessageId} entered state ${matchState}.`,
      occurredAt: receivedAt,
    });

    return {
      inboxItemId,
      integrationJobId,
      ...(Option.isSome(matchedCoverageOption)
        ? { matchedCoverageId: matchedCoverageOption.value }
        : {}),
      ...(Option.isSome(matchedPatientOption)
        ? { matchedPatientId: matchedPatientOption.value }
        : {}),
      outcome: "received" as const,
      payloadArtifactId,
      quarterCardRead,
      snapshotId,
    };
  });

const getEebInboxItem = ({ eebInboxItemId }: typeof GetEebInboxItemArgs.Type) =>
  Effect.gen(function* () {
    const view = yield* buildEebInboxItemView(eebInboxItemId);
    return Option.isSome(view)
      ? {
          found: true as const,
          view: view.value,
        }
      : { found: false as const };
  });

const listEebInboxItems = ({
  adoptionState,
  matchedPatientId,
  matchState,
}: typeof ListEebInboxItemsArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const inboxItems = yield* reader
      .table("eebInboxItems")
      .index("by_matchState_and_receivedAt")
      .collect();

    const filteredItems = inboxItems
      .filter((row) =>
        adoptionState === undefined
          ? true
          : row.adoptionState === adoptionState,
      )
      .filter((row) =>
        matchState === undefined ? true : row.matchState === matchState,
      )
      .filter((row) =>
        matchedPatientId === undefined
          ? true
          : row.matchedPatientId === matchedPatientId,
      )
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));

    const views = [];
    for (const inboxItem of filteredItems) {
      const view = yield* buildEebInboxItemView(inboxItem._id);
      if (Option.isSome(view)) {
        views.push(view.value);
      }
    }

    return views;
  });

const adoptEebInboxItem = ({
  eebInboxItemId,
  existingPatientId,
  patientSeed,
}: typeof AdoptEebInboxItemArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const inboxItemOption = yield* reader
      .table("eebInboxItems")
      .get(eebInboxItemId)
      .pipe(Effect.option);

    if (Option.isNone(inboxItemOption)) {
      return { outcome: "eeb-inbox-item-not-found" as const };
    }

    const inboxItem = inboxItemOption.value;
    if (inboxItem.adoptionState !== "pending") {
      return {
        adoptionState: inboxItem.adoptionState,
        outcome: "adoption-not-pending" as const,
      };
    }

    if (!inboxItem.senderVerified) {
      return { outcome: "sender-not-verified" as const };
    }

    const snapshotOption = yield* findEebSnapshotByPayloadArtifactId(
      inboxItem.payloadArtifactId,
    );
    if (Option.isNone(snapshotOption)) {
      return { outcome: "snapshot-not-found" as const };
    }

    const snapshot = snapshotOption.value;
    const candidatePatientId = existingPatientId ?? inboxItem.matchedPatientId;

    if (!candidatePatientId && !patientSeed) {
      return { outcome: "needs-patient-seed" as const };
    }

    const quarterCardRead = yield* quarterCardReadStatus({
      patientId: candidatePatientId,
      timestamp: inboxItem.receivedAt,
    });
    if (!quarterCardRead.hasCardRead) {
      return {
        outcome: "quarter-card-read-required" as const,
        quarter: quarterCardRead.quarter,
      };
    }

    const adopted = yield* adoptSnapshot({
      ...(candidatePatientId ? { existingPatientId: candidatePatientId } : {}),
      ...(patientSeed ? { patientSeed } : {}),
      snapshotId: snapshot._id,
    });

    if (adopted.outcome === "snapshot-not-found") {
      return { outcome: "snapshot-not-found" as const };
    }
    if (adopted.outcome === "needs-patient-seed") {
      return { outcome: "needs-patient-seed" as const };
    }

    yield* writer.table("vsdSnapshots").patch(snapshot._id, {
      patientId: adopted.patientId,
    });
    yield* writer.table("eebInboxItems").patch(eebInboxItemId, {
      adoptedVsdSnapshotId: snapshot._id,
      adoptionState: "accepted",
      matchedCoverageId: adopted.coverageId,
      matchedPatientId: adopted.patientId,
      matchState: adopted.patientCreated ? "new-patient" : "matched-existing",
    });

    const integrationJobId = yield* writer.table("integrationJobs").insert({
      attemptCount: 1,
      counterparty: "KIM",
      direction: "inbound",
      idempotencyKey: `eeb-adopt:${String(eebInboxItemId)}`,
      jobType: "eeb-adopt",
      ownerId: String(eebInboxItemId),
      ownerKind: "eebInboxItem",
      payloadArtifactId: inboxItem.payloadArtifactId,
      status: "done",
    });
    yield* writer.table("integrationEvents").insert({
      artifactId: inboxItem.payloadArtifactId,
      eventType: "eeb-adopted",
      jobId: integrationJobId,
      message: `Adopted eEB inbox item ${String(eebInboxItemId)} into patient ${String(adopted.patientId)}.`,
      occurredAt: inboxItem.receivedAt,
    });

    return {
      coverageCreated: adopted.coverageCreated,
      coverageId: adopted.coverageId,
      inboxItemId: eebInboxItemId,
      matchedPatientId: adopted.patientId,
      outcome: "adopted" as const,
      patientCreated: adopted.patientCreated,
      ...(adopted.patientIdentifierId
        ? { patientIdentifierId: adopted.patientIdentifierId }
        : {}),
      snapshotId: snapshot._id,
    };
  });

const listOraclePlugins = ({ family }: typeof ListOraclePluginsArgs.Type) =>
  Effect.succeed(
    listRegisteredOraclePlugins().filter(
      (plugin) => family === undefined || plugin.family === family,
    ),
  );

const buildValidationPlan = ({
  artifactId,
  documentId,
  family,
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

const getValidationSummary = ({
  artifactId,
}: typeof ValidationSummaryArgs.Type) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const artifact = yield* reader
      .table("artifacts")
      .get(artifactId)
      .pipe(Effect.option);
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
  documentId,
  executionMode,
  family,
  payloadPreview,
  payloadPreviewXml,
  profileVersion,
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
    const resolvedFamily =
      family ?? resolveOracleFamily(artifact.artifactFamily);
    if (!resolvedFamily) {
      return { outcome: "no-oracle-plan" as const };
    }

    const executed = yield* Effect.promise(() =>
      buildAndExecuteOraclePlan({
        artifactId: String(artifactId),
        family: resolvedFamily,
        ...(documentId ? { documentId: String(documentId) } : {}),
        ...(profileVersion ? { profileVersion } : {}),
        executionMode: executionMode ?? "local",
        ...(payloadPreviewXml ? { payloadPreviewXml } : {}),
        ...(payloadPreview ? { payloadPreview } : {}),
      }),
    );

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
    FunctionImpl.make(api, "billing", "prepareKvdtExport", prepareKvdtExport),
    FunctionImpl.make(api, "billing", "getCase", getCase),
    FunctionImpl.make(api, "billing", "listCases", listCases),
    FunctionImpl.make(api, "billing", "getKvdtCaseView", getKvdtCaseView),
  ]),
);

const appointmentsGroup = GroupImpl.make(api, "appointments").pipe(
  Layer.provide([
    FunctionImpl.make(api, "appointments", "create", createAppointment),
    FunctionImpl.make(api, "appointments", "importTssSlots", importTssSlots),
    FunctionImpl.make(
      api,
      "appointments",
      "importTssSearchsetBundle",
      importTssSearchsetBundle,
    ),
    FunctionImpl.make(
      api,
      "appointments",
      "listByOrganization",
      listAppointmentsByOrganization,
    ),
    FunctionImpl.make(
      api,
      "appointments",
      "listAvailableTss",
      listAvailableTssAppointments,
    ),
    FunctionImpl.make(api, "appointments", "bookTss", bookTssAppointment),
  ]),
);

const referralsGroup = GroupImpl.make(api, "referrals").pipe(
  Layer.provide([
    FunctionImpl.make(api, "referrals", "create", createReferral),
    FunctionImpl.make(
      api,
      "referrals",
      "listByPatient",
      listReferralsByPatient,
    ),
    FunctionImpl.make(
      api,
      "referrals",
      "lookupByVermittlungscode",
      lookupReferralByVermittlungscode,
    ),
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
      "importDigaCatalogRefs",
      importDigaCatalogRefs,
    ),
    FunctionImpl.make(api, "catalog", "lookupDigaByPzn", lookupDigaByPzn),
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

const digaGroup = GroupImpl.make(api, "diga").pipe(
  Layer.provide([
    FunctionImpl.make(api, "diga", "createOrder", createDigaOrder),
    FunctionImpl.make(api, "diga", "getOrder", getDigaOrder),
    FunctionImpl.make(
      api,
      "diga",
      "listOrdersByPatient",
      listDigaOrdersByPatient,
    ),
    FunctionImpl.make(api, "diga", "finalizeOrder", finalizeDigaOrder),
    FunctionImpl.make(api, "diga", "renderEvdgaBundle", renderEvdgaBundle),
  ]),
);

const prescriptionsGroup = GroupImpl.make(api, "prescriptions").pipe(
  Layer.provide([
    FunctionImpl.make(
      api,
      "prescriptions",
      "createOrder",
      createMedicationOrder,
    ),
    FunctionImpl.make(api, "prescriptions", "getOrder", getMedicationOrder),
    FunctionImpl.make(
      api,
      "prescriptions",
      "listOrdersByPatient",
      listMedicationOrdersByPatient,
    ),
    FunctionImpl.make(
      api,
      "prescriptions",
      "finalizeOrder",
      finalizeMedicationOrder,
    ),
    FunctionImpl.make(api, "prescriptions", "renderErpBundle", renderErpBundle),
    FunctionImpl.make(api, "prescriptions", "renderVosBundle", renderVosBundle),
    FunctionImpl.make(
      api,
      "prescriptions",
      "publishVosBundle",
      publishVosBundle,
    ),
    FunctionImpl.make(api, "prescriptions", "readVosBundle", readVosBundle),
    FunctionImpl.make(api, "prescriptions", "readVosResource", readVosResource),
    FunctionImpl.make(
      api,
      "prescriptions",
      "searchVosResources",
      searchVosResources,
    ),
    FunctionImpl.make(api, "prescriptions", "importVosBundle", importVosBundle),
    FunctionImpl.make(
      api,
      "prescriptions",
      "createMedicationPlan",
      createMedicationPlan,
    ),
    FunctionImpl.make(
      api,
      "prescriptions",
      "addPlanEntry",
      addMedicationPlanEntry,
    ),
    FunctionImpl.make(api, "prescriptions", "getCurrentPlan", getCurrentPlan),
  ]),
);

const heilmittelGroup = GroupImpl.make(api, "heilmittel").pipe(
  Layer.provide([
    FunctionImpl.make(
      api,
      "heilmittel",
      "createApproval",
      createHeilmittelApproval,
    ),
    FunctionImpl.make(api, "heilmittel", "createOrder", createHeilmittelOrder),
    FunctionImpl.make(api, "heilmittel", "getOrder", getHeilmittelOrder),
    FunctionImpl.make(
      api,
      "heilmittel",
      "listOrdersByPatient",
      listHeilmittelOrdersByPatient,
    ),
    FunctionImpl.make(
      api,
      "heilmittel",
      "finalizeOrder",
      finalizeHeilmittelOrder,
    ),
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
    FunctionImpl.make(
      api,
      "documents",
      "listFormDefinitions",
      listFormDefinitions,
    ),
    FunctionImpl.make(api, "documents", "createEauDocument", createEauDocument),
    FunctionImpl.make(api, "documents", "renderEauDocument", renderEauDocument),
    FunctionImpl.make(
      api,
      "documents",
      "listFormInstancesByPatient",
      listFormInstancesByPatient,
    ),
    FunctionImpl.make(api, "documents", "getDocument", getDocument),
    FunctionImpl.make(
      api,
      "documents",
      "listByPatient",
      listDocumentsByPatient,
    ),
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
    FunctionImpl.make(
      api,
      "integration",
      "registerKimMailbox",
      registerKimMailbox,
    ),
    FunctionImpl.make(
      api,
      "integration",
      "receiveEebInboxItem",
      receiveEebInboxItem,
    ),
    FunctionImpl.make(api, "integration", "getEebInboxItem", getEebInboxItem),
    FunctionImpl.make(
      api,
      "integration",
      "listEebInboxItems",
      listEebInboxItems,
    ),
    FunctionImpl.make(
      api,
      "integration",
      "adoptEebInboxItem",
      adoptEebInboxItem,
    ),
    FunctionImpl.make(
      api,
      "integration",
      "listOraclePlugins",
      listOraclePlugins,
    ),
    FunctionImpl.make(
      api,
      "integration",
      "buildValidationPlan",
      buildValidationPlan,
    ),
    FunctionImpl.make(
      api,
      "integration",
      "getValidationSummary",
      getValidationSummary,
    ),
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
    appointmentsGroup,
    referralsGroup,
    catalogGroup,
    digaGroup,
    prescriptionsGroup,
    heilmittelGroup,
    documentsGroup,
    draftsGroup,
    integrationGroup,
  ]),
) as any;

export default Impl.finalize(unfinalizedImpl);
