import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import { IsoDate, IsoDateTime } from "./primitives";

export const FormDefinitionsFields = Schema.Struct({
  formCode: Schema.String,
  displayName: Schema.String,
  theme: Schema.Literal("bfb", "dimus", "heilmittel", "billing", "other"),
  deliveryMode: Schema.Literal(
    "blanko-print",
    "digital-pdfa",
    "fhir-document",
    "mixed",
  ),
  templatePackageId: Schema.optional(GenericId.GenericId("masterDataPackages")),
  requiresBarcode: Schema.Boolean,
  requiresBfbCertification: Schema.Boolean,
  requiresDigitaleMusterCertification: Schema.Boolean,
  active: Schema.Boolean,
});

export const FormDefinitions = unsafeMakeTable(
  "formDefinitions",
  FormDefinitionsFields,
)
  .index("by_formCode", ["formCode"])
  .index("by_theme_and_active", ["theme", "active"]);

export const FormInstancesFields = Schema.Struct({
  patientId: Schema.optional(GenericId.GenericId("patients")),
  encounterId: Schema.optional(GenericId.GenericId("encounters")),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  formDefinitionId: GenericId.GenericId("formDefinitions"),
  subjectKind: Schema.Literal(
    "referral",
    "heilmittel",
    "billing",
    "eau",
    "prescription-print",
    "other",
  ),
  subjectId: Schema.optional(Schema.String),
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  issueDate: IsoDate,
  issuerPractitionerRoleId: Schema.optional(
    GenericId.GenericId("practitionerRoles"),
  ),
  issuingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  renderContextArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  outputArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
});

export const FormInstances = unsafeMakeTable("formInstances", FormInstancesFields)
  .index("by_patientId_and_issueDate", ["patientId", "issueDate"])
  .index("by_formDefinitionId_and_status", ["formDefinitionId", "status"]);

export const ClinicalDocumentsFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  kind: Schema.Literal(
    "erp",
    "evdga",
    "eau",
    "heilmittel",
    "bfb-form",
    "bmp-plan",
    "vos",
    "tss",
    "archive-import",
    "other",
  ),
  originInterface: Schema.String,
  currentRevisionNo: Schema.Number,
  status: Schema.Literal(
    "draft",
    "final",
    "cancelled",
    "superseded",
    "imported",
  ),
});

export const ClinicalDocuments = unsafeMakeTable(
  "clinicalDocuments",
  ClinicalDocumentsFields,
).index("by_patientId_and_kind", ["patientId", "kind"]);

export const DocumentRevisionsFields = Schema.Struct({
  documentId: GenericId.GenericId("clinicalDocuments"),
  revisionNo: Schema.Number,
  status: Schema.Literal(
    "draft",
    "final",
    "cancelled",
    "superseded",
    "imported",
  ),
  effectiveDate: IsoDateTime,
  authorPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  authorOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  replacesRevisionId: Schema.optional(GenericId.GenericId("documentRevisions")),
  summary: Schema.Struct({
    title: Schema.optional(Schema.String),
    formCode: Schema.optional(Schema.String),
    externalIdentifier: Schema.optional(Schema.String),
  }),
});

export const DocumentRevisions = unsafeMakeTable(
  "documentRevisions",
  DocumentRevisionsFields,
).index("by_documentId_and_revisionNo", ["documentId", "revisionNo"]);

export const FormTables = [
  FormDefinitions,
  FormInstances,
  ClinicalDocuments,
  DocumentRevisions,
] as const;
