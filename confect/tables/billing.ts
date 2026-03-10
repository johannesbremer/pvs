import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import {
  CodingValue,
  IsoDate,
  IsoDateTime,
} from "./primitives";

export const DiagnosesFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  encounterId: Schema.optional(GenericId.GenericId("encounters")),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  icdCode: Schema.String,
  icd10gm: CodingValue,
  diagnoseklartext: Schema.optional(Schema.String),
  category: Schema.Literal("acute", "dauerdiagnose", "anamnestisch"),
  diagnosensicherheit: Schema.optional(Schema.String),
  seitenlokalisation: Schema.optional(Schema.String),
  diagnoseerlaeuterung: Schema.optional(Schema.String),
  isPrimary: Schema.optional(Schema.Boolean),
  isSecondary: Schema.optional(Schema.Boolean),
  recordStatus: Schema.Literal("active", "cancelled", "superseded"),
});

export const Diagnoses = unsafeMakeTable("diagnoses", DiagnosesFields)
  .index("by_patientId_and_recordStatus", ["patientId", "recordStatus"])
  .index("by_encounterId", ["encounterId"])
  .index("by_icdCode", ["icdCode"]);

export const IcdCatalogEntriesFields = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  code: Schema.String,
  text: Schema.String,
  isBillable: Schema.Boolean,
  notationFlag: Schema.optional(Schema.String),
  ageLower: Schema.optional(Schema.Number),
  ageUpper: Schema.optional(Schema.Number),
  ageErrorType: Schema.optional(Schema.String),
  genderConstraint: Schema.optional(Schema.String),
  genderErrorType: Schema.optional(Schema.String),
  rareDiseaseFlag: Schema.optional(Schema.Boolean),
});

export const IcdCatalogEntries = unsafeMakeTable(
  "icdCatalogEntries",
  IcdCatalogEntriesFields,
)
  .index("by_code", ["code"])
  .index("by_sourcePackageId_and_code", ["sourcePackageId", "code"]);

export const CodingEvaluationsFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  diagnosisId: Schema.optional(GenericId.GenericId("diagnoses")),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  ruleFamily: Schema.Literal("sdicd", "sdkh", "sdkrw"),
  severity: Schema.Literal("info", "warning", "error"),
  ruleCode: Schema.String,
  message: Schema.String,
  blocking: Schema.Boolean,
  createdAt: IsoDateTime,
});

export const CodingEvaluations = unsafeMakeTable(
  "codingEvaluations",
  CodingEvaluationsFields,
)
  .index("by_diagnosisId", ["diagnosisId"])
  .index("by_billingCaseId_and_ruleFamily", ["billingCaseId", "ruleFamily"]);

export const BillingCasesFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  coverageId: Schema.optional(GenericId.GenericId("coverages")),
  organizationId: GenericId.GenericId("organizations"),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  practitionerRoleId: Schema.optional(GenericId.GenericId("practitionerRoles")),
  quarter: Schema.String,
  scheinuntergruppe: Schema.optional(Schema.String),
  einlesedatum4109: Schema.optional(IsoDate),
  vsdSnapshotId: Schema.optional(GenericId.GenericId("vsdSnapshots")),
  kostentraegerkennung4133: Schema.optional(Schema.String),
  kostentraegername4134: Schema.optional(Schema.String),
  tssRelevant: Schema.Boolean,
  tssAppointmentId: Schema.optional(GenericId.GenericId("appointments")),
  status: Schema.Literal("open", "ready-for-export", "exported", "corrected"),
});

export const BillingCases = unsafeMakeTable("billingCases", BillingCasesFields)
  .index("by_patientId_and_quarter", ["patientId", "quarter"])
  .index("by_organizationId_and_quarter", ["organizationId", "quarter"])
  .index("by_status_and_quarter", ["status", "quarter"]);

export const BillingLineItemsFields = Schema.Struct({
  billingCaseId: GenericId.GenericId("billingCases"),
  chargeCodeSystem: Schema.Literal("EBM", "GOAE", "other"),
  chargeCode: Schema.String,
  serviceDate: IsoDate,
  quantity: Schema.Number,
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  modifierCodes: Schema.Array(CodingValue),
  originKind: Schema.Literal("manual", "form", "tss", "import"),
});

export const BillingLineItems = unsafeMakeTable(
  "billingLineItems",
  BillingLineItemsFields,
)
  .index("by_billingCaseId", ["billingCaseId"])
  .index("by_chargeCodeSystem_and_chargeCode", ["chargeCodeSystem", "chargeCode"]);

export const BillingTables = [
  Diagnoses,
  IcdCatalogEntries,
  CodingEvaluations,
  BillingCases,
  BillingLineItems,
] as const;
