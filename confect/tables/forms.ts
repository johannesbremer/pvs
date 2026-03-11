import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import { IsoDate, IsoDateTime } from "./primitives";

export const FormDefinitionsFields = Schema.Struct({
  active: Schema.Boolean,
  deliveryMode: Schema.Literal(
    "blanko-print",
    "digital-pdfa",
    "fhir-document",
    "mixed",
  ),
  displayName: Schema.String,
  formCode: Schema.String,
  requiresBarcode: Schema.Boolean,
  requiresBfbCertification: Schema.Boolean,
  requiresDigitaleMusterCertification: Schema.Boolean,
  templatePackageId: Schema.optional(GenericId.GenericId("masterDataPackages")),
  theme: Schema.Literal("bfb", "dimus", "heilmittel", "billing", "other"),
});

export const FormDefinitions = unsafeMakeTable(
  "formDefinitions",
  FormDefinitionsFields,
)
  .index("by_formCode", ["formCode"])
  .index("by_theme_and_active", ["theme", "active"]);

export const FormInstancesFields = Schema.Struct({
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  encounterId: Schema.optional(GenericId.GenericId("encounters")),
  formDefinitionId: GenericId.GenericId("formDefinitions"),
  issueDate: IsoDate,
  issuerPractitionerRoleId: Schema.optional(
    GenericId.GenericId("practitionerRoles"),
  ),
  issuingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  outputArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  patientId: Schema.optional(GenericId.GenericId("patients")),
  renderContextArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  subjectId: Schema.optional(Schema.String),
  subjectKind: Schema.Literal(
    "referral",
    "heilmittel",
    "billing",
    "eau",
    "prescription-print",
    "other",
  ),
});

export const FormInstances = unsafeMakeTable(
  "formInstances",
  FormInstancesFields,
)
  .index("by_patientId_and_issueDate", ["patientId", "issueDate"])
  .index("by_formDefinitionId_and_status", ["formDefinitionId", "status"]);

export const ClinicalDocumentsFields = Schema.Struct({
  currentRevisionNo: Schema.Number,
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
  patientId: GenericId.GenericId("patients"),
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
  authorOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  authorPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  documentId: GenericId.GenericId("clinicalDocuments"),
  effectiveDate: IsoDateTime,
  replacesRevisionId: Schema.optional(GenericId.GenericId("documentRevisions")),
  revisionNo: Schema.Number,
  status: Schema.Literal(
    "draft",
    "final",
    "cancelled",
    "superseded",
    "imported",
  ),
  summary: Schema.Struct({
    externalIdentifier: Schema.optional(Schema.String),
    formCode: Schema.optional(Schema.String),
    title: Schema.optional(Schema.String),
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
