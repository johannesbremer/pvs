import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  ClinicalDocumentsFields,
  DocumentRevisionsFields,
  FormDefinitionsFields,
  FormInstancesFields,
} from "../../confect/tables/forms";
import {
  ArtifactsFields,
  DraftWorkspacesFields,
} from "../../confect/tables/integration";
import {
  HeilmittelApprovalsFields,
  HeilmittelCatalogRefsFields,
  HeilmittelOrdersFields,
  MedicationCatalogRefsFields,
  MedicationOrdersFields,
  MedicationPlanEntriesFields,
  MedicationPlansFields,
} from "../../confect/tables/prescribing";
import {
  AttachmentRefValue,
  IsoDate,
  IsoDateTime,
  QuantityValue,
} from "../../confect/tables/primitives";
import {
  FhirCoverageResource,
  FhirMedicationRequestResource,
  FhirMedicationResource,
  FhirOrganizationResource,
  FhirPatientResource,
  FhirPractitionerResource,
} from "../fhir-r4-effect/resources/common";
import { VosBundleResource, VosPayload } from "../fhir-r4-effect/resources/vos";
import { withSystemFields } from "./shared";

export const MedicationCatalogRefDocument = withSystemFields(
  "medicationCatalogRefs",
  MedicationCatalogRefsFields,
);
export const MedicationOrderDocument = withSystemFields(
  "medicationOrders",
  MedicationOrdersFields,
);
export const MedicationPlanDocument = withSystemFields(
  "medicationPlans",
  MedicationPlansFields,
);
export const MedicationPlanEntryDocument = withSystemFields(
  "medicationPlanEntries",
  MedicationPlanEntriesFields,
);
export const HeilmittelCatalogRefDocument = withSystemFields(
  "heilmittelCatalogRefs",
  HeilmittelCatalogRefsFields,
);
export const HeilmittelApprovalDocument = withSystemFields(
  "heilmittelApprovals",
  HeilmittelApprovalsFields,
);
export const HeilmittelOrderDocument = withSystemFields(
  "heilmittelOrders",
  HeilmittelOrdersFields,
);
export const FormDefinitionDocument = withSystemFields(
  "formDefinitions",
  FormDefinitionsFields,
);
export const FormInstanceDocument = withSystemFields(
  "formInstances",
  FormInstancesFields,
);
export const ClinicalDocumentDocument = withSystemFields(
  "clinicalDocuments",
  ClinicalDocumentsFields,
);
export const DocumentRevisionDocument = withSystemFields(
  "documentRevisions",
  DocumentRevisionsFields,
);
export const ArtifactDocument = withSystemFields("artifacts", ArtifactsFields);
export const DraftWorkspaceDocument = withSystemFields(
  "draftWorkspaces",
  DraftWorkspacesFields,
);

export const WorkflowIssue = Schema.Struct({
  blocking: Schema.Boolean,
  code: Schema.String,
  message: Schema.String,
});

export const ImportMedicationCatalogRefsArgs = Schema.Struct({
  entries: Schema.Array(MedicationCatalogRefsFields.omit("sourcePackageId")),
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
});
export const ImportMedicationCatalogRefsResult = Schema.Struct({
  entryIds: Schema.Array(GenericId.GenericId("medicationCatalogRefs")),
  importedCount: Schema.Number,
});

export const LookupMedicationByPznArgs = Schema.Struct({
  pzn: Schema.String,
});
export const LookupMedicationByPznFound = Schema.Struct({
  entry: MedicationCatalogRefDocument,
  found: Schema.Literal(true),
});
export const LookupMedicationByPznMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const LookupMedicationByPznResult = Schema.Union(
  LookupMedicationByPznFound,
  LookupMedicationByPznMissing,
);

export const ImportHeilmittelCatalogRefsArgs = Schema.Struct({
  entries: Schema.Array(HeilmittelCatalogRefsFields.omit("sourcePackageId")),
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
});
export const ImportHeilmittelCatalogRefsResult = Schema.Struct({
  entryIds: Schema.Array(GenericId.GenericId("heilmittelCatalogRefs")),
  importedCount: Schema.Number,
});

export const LookupHeilmittelByKeyArgs = Schema.Struct({
  heilmittelbereich: Schema.String,
  heilmittelCode: Schema.String,
});
export const LookupHeilmittelByKeyFound = Schema.Struct({
  entry: HeilmittelCatalogRefDocument,
  found: Schema.Literal(true),
});
export const LookupHeilmittelByKeyMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const LookupHeilmittelByKeyResult = Schema.Union(
  LookupHeilmittelByKeyFound,
  LookupHeilmittelByKeyMissing,
);

export const CreateMedicationOrderArgs = MedicationOrdersFields;
export const CreateMedicationOrderResult = Schema.Struct({
  medicationOrderId: GenericId.GenericId("medicationOrders"),
});

export const GetMedicationOrderArgs = Schema.Struct({
  medicationOrderId: GenericId.GenericId("medicationOrders"),
});
export const GetMedicationOrderFound = Schema.Struct({
  found: Schema.Literal(true),
  order: MedicationOrderDocument,
});
export const GetMedicationOrderMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const GetMedicationOrderResult = Schema.Union(
  GetMedicationOrderFound,
  GetMedicationOrderMissing,
);

export const ListMedicationOrdersArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  status: Schema.optional(
    Schema.Literal("draft", "final", "cancelled", "superseded"),
  ),
});
export const ListMedicationOrdersResult = Schema.Array(MedicationOrderDocument);

export const FinalizeDocumentArtifactInput = Schema.Struct({
  attachment: AttachmentRefValue,
  externalIdentifier: Schema.optional(Schema.String),
});

export const FinalizePrintFormInput = Schema.Struct({
  formDefinitionId: GenericId.GenericId("formDefinitions"),
  issueDate: IsoDate,
  issuerPractitionerRoleId: Schema.optional(
    GenericId.GenericId("practitionerRoles"),
  ),
  issuingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  outputAttachment: Schema.optional(AttachmentRefValue),
  renderContextAttachment: Schema.optional(AttachmentRefValue),
});

export const FinalizeMedicationOrderArgs = Schema.Struct({
  artifact: FinalizeDocumentArtifactInput,
  finalizedAt: IsoDateTime,
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  patientPrint: Schema.optional(FinalizeDocumentArtifactInput),
  printForm: Schema.optional(FinalizePrintFormInput),
  profileVersion: Schema.optional(Schema.String),
});

export const FinalizeMedicationOrderFinalized = Schema.Struct({
  artifactId: GenericId.GenericId("artifacts"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  formInstanceId: Schema.optional(GenericId.GenericId("formInstances")),
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  outcome: Schema.Literal("finalized"),
  patientPrintArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  revisionId: GenericId.GenericId("documentRevisions"),
});
export const FinalizeMedicationOrderBlocked = Schema.Struct({
  issues: Schema.Array(WorkflowIssue),
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  outcome: Schema.Literal("blocked"),
});
export const FinalizeMedicationOrderNotDraft = Schema.Struct({
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  outcome: Schema.Literal("not-draft"),
});
export const FinalizeMedicationOrderMissing = Schema.Struct({
  outcome: Schema.Literal("order-not-found"),
});
export const FinalizeMedicationOrderResult = Schema.Union(
  FinalizeMedicationOrderFinalized,
  FinalizeMedicationOrderBlocked,
  FinalizeMedicationOrderNotDraft,
  FinalizeMedicationOrderMissing,
);

export const CreateMedicationPlanArgs = MedicationPlansFields;
export const CreateMedicationPlanResult = Schema.Struct({
  planId: GenericId.GenericId("medicationPlans"),
});

export const AddMedicationPlanEntryArgs = MedicationPlanEntriesFields;
export const AddMedicationPlanEntryResult = Schema.Struct({
  entryId: GenericId.GenericId("medicationPlanEntries"),
});

export const GetCurrentMedicationPlanArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
});
export const GetCurrentMedicationPlanFound = Schema.Struct({
  entries: Schema.Array(MedicationPlanEntryDocument),
  found: Schema.Literal(true),
  plan: MedicationPlanDocument,
});
export const GetCurrentMedicationPlanMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const GetCurrentMedicationPlanResult = Schema.Union(
  GetCurrentMedicationPlanFound,
  GetCurrentMedicationPlanMissing,
);

export const VosJsonRenderResult = Schema.Struct({
  boundaryKind: Schema.Literal("partially reversible"),
  contentType: Schema.Literal("application/fhir+json"),
  family: Schema.Literal("VoS"),
});

export const RenderVosBundleArgs = Schema.Struct({
  kId: Schema.optional(Schema.String),
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  profileVersion: Schema.optional(Schema.String),
});
export const RenderVosBundleFound = Schema.Struct({
  found: Schema.Literal(true),
  json: VosJsonRenderResult,
  payload: VosPayload,
});
export const RenderVosBundleMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const RenderVosBundleResult = Schema.Union(
  RenderVosBundleFound,
  RenderVosBundleMissing,
);

export const PublishVosBundleArgs = Schema.Struct({
  artifact: FinalizeDocumentArtifactInput,
  expiresAt: IsoDateTime,
  issuedAt: IsoDateTime,
  kId: Schema.String,
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  profileVersion: Schema.optional(Schema.String),
});
export const PublishVosBundlePublished = Schema.Struct({
  artifactId: GenericId.GenericId("artifacts"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  jobId: GenericId.GenericId("integrationJobs"),
  kId: Schema.String,
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  outcome: Schema.Literal("published"),
  revisionId: GenericId.GenericId("documentRevisions"),
});
export const PublishVosBundleBlocked = Schema.Struct({
  issues: Schema.Array(WorkflowIssue),
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  outcome: Schema.Literal("blocked"),
});
export const PublishVosBundleMissing = Schema.Struct({
  outcome: Schema.Literal("order-not-found"),
});
export const PublishVosBundleResult = Schema.Union(
  PublishVosBundlePublished,
  PublishVosBundleBlocked,
  PublishVosBundleMissing,
);

export const ReadVosBundleArgs = Schema.Struct({
  kId: Schema.String,
  requestedAt: IsoDateTime,
});
export const ReadVosBundleFound = Schema.Struct({
  artifactId: GenericId.GenericId("artifacts"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  expiresAt: IsoDateTime,
  found: Schema.Literal(true),
  json: VosJsonRenderResult,
  kId: Schema.String,
  payload: VosPayload,
});
export const ReadVosBundleMissing = Schema.Struct({
  found: Schema.Literal(false),
  reason: Schema.Literal("expired", "not-published"),
});
export const ReadVosBundleResult = Schema.Union(
  ReadVosBundleFound,
  ReadVosBundleMissing,
);

export const VosProjectedResourceType = Schema.Literal(
  "Bundle",
  "Coverage",
  "Medication",
  "MedicationRequest",
  "Organization",
  "Patient",
  "Practitioner",
);
export const VosProjectedResource = Schema.Union(
  VosBundleResource,
  FhirCoverageResource,
  FhirMedicationResource,
  FhirMedicationRequestResource,
  FhirOrganizationResource,
  FhirPatientResource,
  FhirPractitionerResource,
);

export const ReadVosResourceArgs = Schema.Struct({
  kId: Schema.String,
  requestedAt: IsoDateTime,
  resourceId: Schema.String,
  resourceType: VosProjectedResourceType,
});
export const ReadVosResourceFound = Schema.Struct({
  found: Schema.Literal(true),
  resource: VosProjectedResource,
});
export const ReadVosResourceMissing = Schema.Struct({
  found: Schema.Literal(false),
  reason: Schema.Literal("expired", "not-published", "resource-not-found"),
});
export const ReadVosResourceResult = Schema.Union(
  ReadVosResourceFound,
  ReadVosResourceMissing,
);

export const SearchVosResourcesArgs = Schema.Struct({
  identifierValue: Schema.optional(Schema.String),
  kId: Schema.String,
  requestedAt: IsoDateTime,
  resourceId: Schema.optional(Schema.String),
  resourceType: VosProjectedResourceType,
});
export const SearchVosResourcesFound = Schema.Struct({
  found: Schema.Literal(true),
  resources: Schema.Array(VosProjectedResource),
});
export const SearchVosResourcesMissing = Schema.Struct({
  found: Schema.Literal(false),
  reason: Schema.Literal("expired", "not-published"),
});
export const SearchVosResourcesResult = Schema.Union(
  SearchVosResourcesFound,
  SearchVosResourcesMissing,
);

export const ImportVosMedicationOrderInput = Schema.Struct({
  authoredOn: IsoDateTime,
  dosageText: Schema.optional(Schema.String),
  freeTextMedication: Schema.optional(Schema.String),
  legalBasisCode: Schema.optional(Schema.String),
  medicationCatalogRefId: Schema.optional(
    GenericId.GenericId("medicationCatalogRefs"),
  ),
  orderKind: Schema.Literal("pzn", "ingredient", "compounding", "freetext"),
  packageCount: Schema.optional(Schema.Number),
  prescriptionContext: Schema.Literal(
    "regular",
    "practice-supply",
    "home-visit",
    "care-home",
    "technical-fallback",
  ),
  prescriptionMode: Schema.Literal("paper", "electronic", "fallback-paper"),
  quantity: Schema.optional(QuantityValue),
  serFlag: Schema.optional(Schema.Boolean),
  specialRecipeType: Schema.optional(Schema.Literal("btm", "t-rezept", "none")),
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  statusCoPaymentCode: Schema.optional(Schema.String),
  substitutionAllowed: Schema.optional(Schema.Boolean),
});

export const ImportVosMedicationPlanEntryInput = Schema.Struct({
  activeIngredientText: Schema.optional(Schema.String),
  displayName: Schema.String,
  dosageText: Schema.optional(Schema.String),
  doseFormText: Schema.optional(Schema.String),
  indicationText: Schema.optional(Schema.String),
  isRecipePreparation: Schema.Boolean,
  printOnPlan: Schema.Boolean,
  productCode: Schema.optional(Schema.String),
  sortOrder: Schema.Number,
  strengthText: Schema.optional(Schema.String),
  supplementLineText: Schema.optional(Schema.String),
});

export const ImportVosMedicationPlanInput = Schema.Struct({
  barcodePayload: Schema.optional(Schema.String),
  bmpVersion: Schema.optional(Schema.String),
  documentIdentifier: Schema.optional(Schema.String),
  entries: Schema.Array(ImportVosMedicationPlanEntryInput),
  setIdentifier: Schema.optional(Schema.String),
  updatedAt: IsoDateTime,
});

export const ImportVosBundleArgs = Schema.Struct({
  artifact: FinalizeDocumentArtifactInput,
  coverageId: GenericId.GenericId("coverages"),
  importedAt: IsoDateTime,
  kId: Schema.optional(Schema.String),
  medicationOrders: Schema.Array(ImportVosMedicationOrderInput),
  medicationPlan: Schema.optional(ImportVosMedicationPlanInput),
  organizationId: GenericId.GenericId("organizations"),
  patientId: GenericId.GenericId("patients"),
  practitionerId: GenericId.GenericId("practitioners"),
  profileVersion: Schema.optional(Schema.String),
});
export const ImportVosBundleImported = Schema.Struct({
  artifactId: GenericId.GenericId("artifacts"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  importedMedicationOrderIds: Schema.Array(
    GenericId.GenericId("medicationOrders"),
  ),
  medicationPlanId: Schema.optional(GenericId.GenericId("medicationPlans")),
  outcome: Schema.Literal("imported"),
  revisionId: GenericId.GenericId("documentRevisions"),
});
export const ImportVosBundleBlocked = Schema.Struct({
  issues: Schema.Array(WorkflowIssue),
  outcome: Schema.Literal("blocked"),
});
export const ImportVosBundleResult = Schema.Union(
  ImportVosBundleImported,
  ImportVosBundleBlocked,
);

export const CreateHeilmittelApprovalArgs = HeilmittelApprovalsFields;
export const CreateHeilmittelApprovalResult = Schema.Struct({
  approvalId: GenericId.GenericId("heilmittelApprovals"),
});

export const CreateHeilmittelOrderArgs = HeilmittelOrdersFields;
export const CreateHeilmittelOrderResult = Schema.Struct({
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
});

export const GetHeilmittelOrderArgs = Schema.Struct({
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
});
export const GetHeilmittelOrderFound = Schema.Struct({
  found: Schema.Literal(true),
  order: HeilmittelOrderDocument,
});
export const GetHeilmittelOrderMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const GetHeilmittelOrderResult = Schema.Union(
  GetHeilmittelOrderFound,
  GetHeilmittelOrderMissing,
);

export const ListHeilmittelOrdersArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  status: Schema.optional(
    Schema.Literal("draft", "final", "cancelled", "superseded"),
  ),
});
export const ListHeilmittelOrdersResult = Schema.Array(HeilmittelOrderDocument);

export const FinalizeHeilmittelOrderArgs = Schema.Struct({
  artifact: FinalizeDocumentArtifactInput,
  finalizedAt: IsoDateTime,
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
  printForm: Schema.optional(FinalizePrintFormInput),
  profileVersion: Schema.optional(Schema.String),
});

export const FinalizeHeilmittelOrderFinalized = Schema.Struct({
  artifactId: GenericId.GenericId("artifacts"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  formInstanceId: Schema.optional(GenericId.GenericId("formInstances")),
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
  outcome: Schema.Literal("finalized"),
  revisionId: GenericId.GenericId("documentRevisions"),
});
export const FinalizeHeilmittelOrderBlocked = Schema.Struct({
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
  issues: Schema.Array(WorkflowIssue),
  outcome: Schema.Literal("blocked"),
});
export const FinalizeHeilmittelOrderNotDraft = Schema.Struct({
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
  outcome: Schema.Literal("not-draft"),
});
export const FinalizeHeilmittelOrderMissing = Schema.Struct({
  outcome: Schema.Literal("order-not-found"),
});
export const FinalizeHeilmittelOrderResult = Schema.Union(
  FinalizeHeilmittelOrderFinalized,
  FinalizeHeilmittelOrderBlocked,
  FinalizeHeilmittelOrderNotDraft,
  FinalizeHeilmittelOrderMissing,
);

export const RegisterFormDefinitionArgs = FormDefinitionsFields;
export const RegisterFormDefinitionResult = Schema.Struct({
  formDefinitionId: GenericId.GenericId("formDefinitions"),
});

export const ListFormDefinitionsArgs = Schema.Struct({
  activeOnly: Schema.optional(Schema.Boolean),
  theme: Schema.optional(
    Schema.Literal("bfb", "dimus", "heilmittel", "billing", "other"),
  ),
});
export const ListFormDefinitionsResult = Schema.Array(FormDefinitionDocument);

export const ListFormInstancesByPatientArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  subjectKind: Schema.optional(
    Schema.Literal(
      "referral",
      "heilmittel",
      "billing",
      "eau",
      "prescription-print",
      "other",
    ),
  ),
});
export const ListFormInstancesByPatientResult =
  Schema.Array(FormInstanceDocument);

export const GetDocumentArgs = Schema.Struct({
  documentId: GenericId.GenericId("clinicalDocuments"),
});
export const GetDocumentFound = Schema.Struct({
  artifacts: Schema.Array(ArtifactDocument),
  document: ClinicalDocumentDocument,
  found: Schema.Literal(true),
  revisions: Schema.Array(DocumentRevisionDocument),
});
export const GetDocumentMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const GetDocumentResult = Schema.Union(
  GetDocumentFound,
  GetDocumentMissing,
);

export const ListDocumentsByPatientArgs = Schema.Struct({
  kind: Schema.optional(
    Schema.Literal(
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
  ),
  patientId: GenericId.GenericId("patients"),
});
export const ListDocumentsByPatientResult = Schema.Array(
  ClinicalDocumentDocument,
);

export const SaveDraftWorkspaceArgs = Schema.Struct({
  lastTouchedAt: IsoDateTime,
  lastTouchedBy: Schema.String,
  ownerId: Schema.String,
  ownerKind: Schema.String,
  schemaVersion: Schema.Number,
  snapshot: Schema.Unknown,
  status: Schema.optional(Schema.Literal("open", "abandoned")),
  workflowKind: Schema.String,
});
export const SaveDraftWorkspaceResult = Schema.Struct({
  created: Schema.Boolean,
  draftWorkspaceId: GenericId.GenericId("draftWorkspaces"),
});

export const GetDraftWorkspaceArgs = Schema.Struct({
  ownerId: Schema.String,
  ownerKind: Schema.String,
  workflowKind: Schema.String,
});
export const GetDraftWorkspaceFound = Schema.Struct({
  draftWorkspace: DraftWorkspaceDocument,
  found: Schema.Literal(true),
});
export const GetDraftWorkspaceMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const GetDraftWorkspaceResult = Schema.Union(
  GetDraftWorkspaceFound,
  GetDraftWorkspaceMissing,
);

export const PromoteDraftWorkspaceArgs = Schema.Struct({
  draftWorkspaceId: GenericId.GenericId("draftWorkspaces"),
  promotedAt: IsoDateTime,
  promotedBy: Schema.String,
});
export const PromoteDraftWorkspacePromoted = Schema.Struct({
  draftWorkspaceId: GenericId.GenericId("draftWorkspaces"),
  outcome: Schema.Literal("promoted"),
});
export const PromoteDraftWorkspaceMissing = Schema.Struct({
  outcome: Schema.Literal("draft-workspace-not-found"),
});
export const PromoteDraftWorkspaceResult = Schema.Union(
  PromoteDraftWorkspacePromoted,
  PromoteDraftWorkspaceMissing,
);
