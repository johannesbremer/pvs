import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import { CodingValue, IsoDate, IsoDateTime } from "./primitives";

export const DiagnosesFields = Schema.Struct({
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  category: Schema.Literal("acute", "dauerdiagnose", "anamnestisch"),
  diagnoseerlaeuterung: Schema.optional(Schema.String),
  diagnoseklartext: Schema.optional(Schema.String),
  diagnosensicherheit: Schema.optional(Schema.String),
  encounterId: Schema.optional(GenericId.GenericId("encounters")),
  icd10gm: CodingValue,
  icdCode: Schema.String,
  isPrimary: Schema.optional(Schema.Boolean),
  isSecondary: Schema.optional(Schema.Boolean),
  patientId: GenericId.GenericId("patients"),
  recordStatus: Schema.Literal("active", "cancelled", "superseded"),
  seitenlokalisation: Schema.optional(Schema.String),
});

export const Diagnoses = unsafeMakeTable("diagnoses", DiagnosesFields)
  .index("by_patientId_and_recordStatus", ["patientId", "recordStatus"])
  .index("by_encounterId", ["encounterId"])
  .index("by_icdCode", ["icdCode"]);

export const IcdCatalogEntriesFields = Schema.Struct({
  ageErrorType: Schema.optional(Schema.String),
  ageLower: Schema.optional(Schema.Number),
  ageUpper: Schema.optional(Schema.Number),
  code: Schema.String,
  genderConstraint: Schema.optional(Schema.String),
  genderErrorType: Schema.optional(Schema.String),
  isBillable: Schema.Boolean,
  notationFlag: Schema.optional(Schema.String),
  rareDiseaseFlag: Schema.optional(Schema.Boolean),
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  text: Schema.String,
});

export const IcdCatalogEntries = unsafeMakeTable(
  "icdCatalogEntries",
  IcdCatalogEntriesFields,
)
  .index("by_code", ["code"])
  .index("by_sourcePackageId_and_code", ["sourcePackageId", "code"]);

export const CodingEvaluationsFields = Schema.Struct({
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  blocking: Schema.Boolean,
  createdAt: IsoDateTime,
  diagnosisId: Schema.optional(GenericId.GenericId("diagnoses")),
  message: Schema.String,
  patientId: GenericId.GenericId("patients"),
  ruleCode: Schema.String,
  ruleFamily: Schema.Literal("sdicd", "sdkh", "sdkrw"),
  severity: Schema.Literal("info", "warning", "error"),
});

export const CodingEvaluations = unsafeMakeTable(
  "codingEvaluations",
  CodingEvaluationsFields,
)
  .index("by_diagnosisId", ["diagnosisId"])
  .index("by_billingCaseId_and_ruleFamily", ["billingCaseId", "ruleFamily"]);

export const BillingCasesFields = Schema.Struct({
  coverageId: Schema.optional(GenericId.GenericId("coverages")),
  einlesedatum4109: Schema.optional(IsoDate),
  kostentraegerkennung4133: Schema.optional(Schema.String),
  kostentraegername4134: Schema.optional(Schema.String),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  organizationId: GenericId.GenericId("organizations"),
  patientId: GenericId.GenericId("patients"),
  practitionerRoleId: Schema.optional(GenericId.GenericId("practitionerRoles")),
  quarter: Schema.String,
  scheinuntergruppe: Schema.optional(Schema.String),
  status: Schema.Literal("open", "ready-for-export", "exported", "corrected"),
  tssAppointmentId: Schema.optional(GenericId.GenericId("appointments")),
  tssRelevant: Schema.Boolean,
  vsdSnapshotId: Schema.optional(GenericId.GenericId("vsdSnapshots")),
});

export const BillingCases = unsafeMakeTable("billingCases", BillingCasesFields)
  .index("by_patientId_and_quarter", ["patientId", "quarter"])
  .index("by_organizationId_and_quarter", ["organizationId", "quarter"])
  .index("by_status_and_quarter", ["status", "quarter"]);

export const BillingLineItemsFields = Schema.Struct({
  billingCaseId: GenericId.GenericId("billingCases"),
  chargeCode: Schema.String,
  chargeCodeSystem: Schema.Literal("EBM", "GOAE", "other"),
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  modifierCodes: Schema.Array(CodingValue),
  originKind: Schema.Literal("manual", "form", "tss", "import"),
  quantity: Schema.Number,
  serviceDate: IsoDate,
});

export const BillingLineItems = unsafeMakeTable(
  "billingLineItems",
  BillingLineItemsFields,
)
  .index("by_billingCaseId", ["billingCaseId"])
  .index("by_chargeCodeSystem_and_chargeCode", [
    "chargeCodeSystem",
    "chargeCode",
  ]);

export const BillingTables = [
  Diagnoses,
  IcdCatalogEntries,
  CodingEvaluations,
  BillingCases,
  BillingLineItems,
] as const;
