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
} from "../../confect/tables/primitives";
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
