import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  FormDefinitionsFields,
  FormInstancesFields,
  ClinicalDocumentsFields,
  DocumentRevisionsFields,
} from "../../confect/tables/forms";
import { ArtifactsFields, DraftWorkspacesFields } from "../../confect/tables/integration";
import {
  HeilmittelApprovalsFields,
  HeilmittelCatalogRefsFields,
  HeilmittelOrdersFields,
  MedicationCatalogRefsFields,
  MedicationOrdersFields,
  MedicationPlanEntriesFields,
  MedicationPlansFields,
} from "../../confect/tables/prescribing";
import { AttachmentRefValue, IsoDate, IsoDateTime } from "../../confect/tables/primitives";
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
  code: Schema.String,
  message: Schema.String,
  blocking: Schema.Boolean,
});

export const ImportMedicationCatalogRefsArgs = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  entries: Schema.Array(
    MedicationCatalogRefsFields.omit("sourcePackageId"),
  ),
});
export const ImportMedicationCatalogRefsResult = Schema.Struct({
  importedCount: Schema.Number,
  entryIds: Schema.Array(GenericId.GenericId("medicationCatalogRefs")),
});

export const LookupMedicationByPznArgs = Schema.Struct({
  pzn: Schema.String,
});
export const LookupMedicationByPznFound = Schema.Struct({
  found: Schema.Literal(true),
  entry: MedicationCatalogRefDocument,
});
export const LookupMedicationByPznMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const LookupMedicationByPznResult = Schema.Union(
  LookupMedicationByPznFound,
  LookupMedicationByPznMissing,
);

export const ImportHeilmittelCatalogRefsArgs = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  entries: Schema.Array(
    HeilmittelCatalogRefsFields.omit("sourcePackageId"),
  ),
});
export const ImportHeilmittelCatalogRefsResult = Schema.Struct({
  importedCount: Schema.Number,
  entryIds: Schema.Array(GenericId.GenericId("heilmittelCatalogRefs")),
});

export const LookupHeilmittelByKeyArgs = Schema.Struct({
  heilmittelbereich: Schema.String,
  heilmittelCode: Schema.String,
});
export const LookupHeilmittelByKeyFound = Schema.Struct({
  found: Schema.Literal(true),
  entry: HeilmittelCatalogRefDocument,
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
  renderContextAttachment: Schema.optional(AttachmentRefValue),
  outputAttachment: Schema.optional(AttachmentRefValue),
});

export const FinalizeMedicationOrderArgs = Schema.Struct({
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  finalizedAt: IsoDateTime,
  profileVersion: Schema.optional(Schema.String),
  artifact: FinalizeDocumentArtifactInput,
  patientPrint: Schema.optional(FinalizeDocumentArtifactInput),
  printForm: Schema.optional(FinalizePrintFormInput),
});

export const FinalizeMedicationOrderFinalized = Schema.Struct({
  outcome: Schema.Literal("finalized"),
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  revisionId: GenericId.GenericId("documentRevisions"),
  artifactId: GenericId.GenericId("artifacts"),
  patientPrintArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  formInstanceId: Schema.optional(GenericId.GenericId("formInstances")),
});
export const FinalizeMedicationOrderBlocked = Schema.Struct({
  outcome: Schema.Literal("blocked"),
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  issues: Schema.Array(WorkflowIssue),
});
export const FinalizeMedicationOrderNotDraft = Schema.Struct({
  outcome: Schema.Literal("not-draft"),
  medicationOrderId: GenericId.GenericId("medicationOrders"),
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
  found: Schema.Literal(true),
  plan: MedicationPlanDocument,
  entries: Schema.Array(MedicationPlanEntryDocument),
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
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
  finalizedAt: IsoDateTime,
  profileVersion: Schema.optional(Schema.String),
  artifact: FinalizeDocumentArtifactInput,
  printForm: Schema.optional(FinalizePrintFormInput),
});

export const FinalizeHeilmittelOrderFinalized = Schema.Struct({
  outcome: Schema.Literal("finalized"),
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  revisionId: GenericId.GenericId("documentRevisions"),
  artifactId: GenericId.GenericId("artifacts"),
  formInstanceId: Schema.optional(GenericId.GenericId("formInstances")),
});
export const FinalizeHeilmittelOrderBlocked = Schema.Struct({
  outcome: Schema.Literal("blocked"),
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
  issues: Schema.Array(WorkflowIssue),
});
export const FinalizeHeilmittelOrderNotDraft = Schema.Struct({
  outcome: Schema.Literal("not-draft"),
  heilmittelOrderId: GenericId.GenericId("heilmittelOrders"),
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
  theme: Schema.optional(
    Schema.Literal("bfb", "dimus", "heilmittel", "billing", "other"),
  ),
  activeOnly: Schema.optional(Schema.Boolean),
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
export const ListFormInstancesByPatientResult = Schema.Array(
  FormInstanceDocument,
);

export const GetDocumentArgs = Schema.Struct({
  documentId: GenericId.GenericId("clinicalDocuments"),
});
export const GetDocumentFound = Schema.Struct({
  found: Schema.Literal(true),
  document: ClinicalDocumentDocument,
  revisions: Schema.Array(DocumentRevisionDocument),
  artifacts: Schema.Array(ArtifactDocument),
});
export const GetDocumentMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const GetDocumentResult = Schema.Union(
  GetDocumentFound,
  GetDocumentMissing,
);

export const ListDocumentsByPatientArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
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
});
export const ListDocumentsByPatientResult = Schema.Array(
  ClinicalDocumentDocument,
);

export const SaveDraftWorkspaceArgs = Schema.Struct({
  ownerKind: Schema.String,
  ownerId: Schema.String,
  workflowKind: Schema.String,
  snapshot: Schema.Unknown,
  schemaVersion: Schema.Number,
  lastTouchedAt: IsoDateTime,
  lastTouchedBy: Schema.String,
  status: Schema.optional(Schema.Literal("open", "abandoned")),
});
export const SaveDraftWorkspaceResult = Schema.Struct({
  draftWorkspaceId: GenericId.GenericId("draftWorkspaces"),
  created: Schema.Boolean,
});

export const GetDraftWorkspaceArgs = Schema.Struct({
  ownerKind: Schema.String,
  ownerId: Schema.String,
  workflowKind: Schema.String,
});
export const GetDraftWorkspaceFound = Schema.Struct({
  found: Schema.Literal(true),
  draftWorkspace: DraftWorkspaceDocument,
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
  outcome: Schema.Literal("promoted"),
  draftWorkspaceId: GenericId.GenericId("draftWorkspaces"),
});
export const PromoteDraftWorkspaceMissing = Schema.Struct({
  outcome: Schema.Literal("draft-workspace-not-found"),
});
export const PromoteDraftWorkspaceResult = Schema.Union(
  PromoteDraftWorkspacePromoted,
  PromoteDraftWorkspaceMissing,
);
