import { FunctionSpec, GroupSpec, Spec } from "@confect/core";

import {
  AdoptVsdSnapshotArgs,
  AdoptVsdSnapshotResult,
  CreateManualPatientArgs,
  CreateManualPatientResult,
  GetVsdSnapshotArgs,
  GetVsdSnapshotResult,
  ListCoveragesArgs,
  ListCoveragesResult,
  PatientChartArgs,
  PatientChartResult,
  RecordVsdSnapshotArgs,
  RecordVsdSnapshotResult,
} from "../src/domain/patients";
import {
  AddBillingLineItemArgs,
  AddBillingLineItemResult,
  CreateBillingCaseArgs,
  CreateBillingCaseResult,
  CreateDiagnosisArgs,
  CreateDiagnosisResult,
  GetBillingCaseArgs,
  GetBillingCaseResult,
  GetKvdtCaseViewArgs,
  GetKvdtCaseViewResult,
  ImportIcdCatalogEntriesArgs,
  ImportIcdCatalogEntriesResult,
  ListBillingCasesArgs,
  ListBillingCasesResult,
  ListCodingEvaluationsByBillingCaseArgs,
  ListCodingEvaluationsByDiagnosisArgs,
  ListCodingEvaluationsResult,
  ListDiagnosesArgs,
  ListDiagnosesResult,
  PrepareKvdtExportArgs,
  PrepareKvdtExportResult,
  RegisterMasterDataPackageArgs,
  RegisterMasterDataPackageResult,
} from "../src/domain/billing-coding";
import {
  AddMedicationPlanEntryArgs,
  AddMedicationPlanEntryResult,
  CreateHeilmittelApprovalArgs,
  CreateHeilmittelApprovalResult,
  CreateHeilmittelOrderArgs,
  CreateHeilmittelOrderResult,
  CreateMedicationOrderArgs,
  CreateMedicationOrderResult,
  CreateMedicationPlanArgs,
  CreateMedicationPlanResult,
  FinalizeHeilmittelOrderArgs,
  FinalizeHeilmittelOrderResult,
  FinalizeMedicationOrderArgs,
  FinalizeMedicationOrderResult,
  GetCurrentMedicationPlanArgs,
  GetCurrentMedicationPlanResult,
  GetDocumentArgs,
  GetDocumentResult,
  GetDraftWorkspaceArgs,
  GetDraftWorkspaceResult,
  GetHeilmittelOrderArgs,
  GetHeilmittelOrderResult,
  GetMedicationOrderArgs,
  GetMedicationOrderResult,
  ImportHeilmittelCatalogRefsArgs,
  ImportHeilmittelCatalogRefsResult,
  ImportMedicationCatalogRefsArgs,
  ImportMedicationCatalogRefsResult,
  ListDocumentsByPatientArgs,
  ListDocumentsByPatientResult,
  ListFormDefinitionsArgs,
  ListFormDefinitionsResult,
  ListFormInstancesByPatientArgs,
  ListFormInstancesByPatientResult,
  ListHeilmittelOrdersArgs,
  ListHeilmittelOrdersResult,
  ListMedicationOrdersArgs,
  ListMedicationOrdersResult,
  LookupHeilmittelByKeyArgs,
  LookupHeilmittelByKeyResult,
  LookupMedicationByPznArgs,
  LookupMedicationByPznResult,
  PromoteDraftWorkspaceArgs,
  PromoteDraftWorkspaceResult,
  RegisterFormDefinitionArgs,
  RegisterFormDefinitionResult,
  SaveDraftWorkspaceArgs,
  SaveDraftWorkspaceResult,
} from "../src/domain/prescribing-documents";
import {
  BuildValidationPlanArgs,
  BuildValidationPlanResult,
  CreateEauDocumentArgs,
  CreateEauDocumentResult,
  ListOraclePluginsArgs,
  ListOraclePluginsResult,
  RenderEauDocumentArgs,
  RenderEauDocumentResult,
  RenderErpBundleArgs,
  RenderErpBundleResult,
  ValidationSummaryArgs,
  ValidationSummaryResult,
} from "../src/domain/emission";
import {
  internalConfectModules,
  publicConfectModules,
} from "./modules";

export const ConfectSpecLayout = {
  publicModules: publicConfectModules,
  internalModules: internalConfectModules,
} as const;

export const PatientsGroup = GroupSpec.make("patients")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "createManual",
      args: CreateManualPatientArgs,
      returns: CreateManualPatientResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getChart",
      args: PatientChartArgs,
      returns: PatientChartResult,
    }),
  );

export const CoveragesGroup = GroupSpec.make("coverages").addFunction(
  FunctionSpec.publicQuery({
    name: "listByPatient",
    args: ListCoveragesArgs,
    returns: ListCoveragesResult,
  }),
);

export const VsdGroup = GroupSpec.make("vsd")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "recordSnapshot",
      args: RecordVsdSnapshotArgs,
      returns: RecordVsdSnapshotResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getSnapshot",
      args: GetVsdSnapshotArgs,
      returns: GetVsdSnapshotResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "adoptSnapshot",
      args: AdoptVsdSnapshotArgs,
      returns: AdoptVsdSnapshotResult,
    }),
  );

export const CodingGroup = GroupSpec.make("coding")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "registerMasterDataPackage",
      args: RegisterMasterDataPackageArgs,
      returns: RegisterMasterDataPackageResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "importIcdCatalogEntries",
      args: ImportIcdCatalogEntriesArgs,
      returns: ImportIcdCatalogEntriesResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "createDiagnosis",
      args: CreateDiagnosisArgs,
      returns: CreateDiagnosisResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listDiagnoses",
      args: ListDiagnosesArgs,
      returns: ListDiagnosesResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listEvaluationsByDiagnosis",
      args: ListCodingEvaluationsByDiagnosisArgs,
      returns: ListCodingEvaluationsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listEvaluationsByBillingCase",
      args: ListCodingEvaluationsByBillingCaseArgs,
      returns: ListCodingEvaluationsResult,
    }),
  );

export const BillingGroup = GroupSpec.make("billing")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "createCase",
      args: CreateBillingCaseArgs,
      returns: CreateBillingCaseResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "addLineItem",
      args: AddBillingLineItemArgs,
      returns: AddBillingLineItemResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "prepareKvdtExport",
      args: PrepareKvdtExportArgs,
      returns: PrepareKvdtExportResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getCase",
      args: GetBillingCaseArgs,
      returns: GetBillingCaseResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listCases",
      args: ListBillingCasesArgs,
      returns: ListBillingCasesResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getKvdtCaseView",
      args: GetKvdtCaseViewArgs,
      returns: GetKvdtCaseViewResult,
    }),
  );

export const CatalogGroup = GroupSpec.make("catalog")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "importMedicationCatalogRefs",
      args: ImportMedicationCatalogRefsArgs,
      returns: ImportMedicationCatalogRefsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "lookupMedicationByPzn",
      args: LookupMedicationByPznArgs,
      returns: LookupMedicationByPznResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "importHeilmittelCatalogRefs",
      args: ImportHeilmittelCatalogRefsArgs,
      returns: ImportHeilmittelCatalogRefsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "lookupHeilmittelByKey",
      args: LookupHeilmittelByKeyArgs,
      returns: LookupHeilmittelByKeyResult,
    }),
  );

export const PrescriptionsGroup = GroupSpec.make("prescriptions")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "createOrder",
      args: CreateMedicationOrderArgs,
      returns: CreateMedicationOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getOrder",
      args: GetMedicationOrderArgs,
      returns: GetMedicationOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listOrdersByPatient",
      args: ListMedicationOrdersArgs,
      returns: ListMedicationOrdersResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "finalizeOrder",
      args: FinalizeMedicationOrderArgs,
      returns: FinalizeMedicationOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "renderErpBundle",
      args: RenderErpBundleArgs,
      returns: RenderErpBundleResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "createMedicationPlan",
      args: CreateMedicationPlanArgs,
      returns: CreateMedicationPlanResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "addPlanEntry",
      args: AddMedicationPlanEntryArgs,
      returns: AddMedicationPlanEntryResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getCurrentPlan",
      args: GetCurrentMedicationPlanArgs,
      returns: GetCurrentMedicationPlanResult,
    }),
  );

export const HeilmittelGroup = GroupSpec.make("heilmittel")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "createApproval",
      args: CreateHeilmittelApprovalArgs,
      returns: CreateHeilmittelApprovalResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "createOrder",
      args: CreateHeilmittelOrderArgs,
      returns: CreateHeilmittelOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getOrder",
      args: GetHeilmittelOrderArgs,
      returns: GetHeilmittelOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listOrdersByPatient",
      args: ListHeilmittelOrdersArgs,
      returns: ListHeilmittelOrdersResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "finalizeOrder",
      args: FinalizeHeilmittelOrderArgs,
      returns: FinalizeHeilmittelOrderResult,
    }),
  );

export const DocumentsGroup = GroupSpec.make("documents")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "registerFormDefinition",
      args: RegisterFormDefinitionArgs,
      returns: RegisterFormDefinitionResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listFormDefinitions",
      args: ListFormDefinitionsArgs,
      returns: ListFormDefinitionsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listFormInstancesByPatient",
      args: ListFormInstancesByPatientArgs,
      returns: ListFormInstancesByPatientResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "createEauDocument",
      args: CreateEauDocumentArgs,
      returns: CreateEauDocumentResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "renderEauDocument",
      args: RenderEauDocumentArgs,
      returns: RenderEauDocumentResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getDocument",
      args: GetDocumentArgs,
      returns: GetDocumentResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listByPatient",
      args: ListDocumentsByPatientArgs,
      returns: ListDocumentsByPatientResult,
    }),
  );

export const DraftsGroup = GroupSpec.make("drafts")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "saveWorkspace",
      args: SaveDraftWorkspaceArgs,
      returns: SaveDraftWorkspaceResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getWorkspace",
      args: GetDraftWorkspaceArgs,
      returns: GetDraftWorkspaceResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "promoteWorkspace",
      args: PromoteDraftWorkspaceArgs,
      returns: PromoteDraftWorkspaceResult,
    }),
  );

export const IntegrationGroup = GroupSpec.make("integration")
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listOraclePlugins",
      args: ListOraclePluginsArgs,
      returns: ListOraclePluginsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "buildValidationPlan",
      args: BuildValidationPlanArgs,
      returns: BuildValidationPlanResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getValidationSummary",
      args: ValidationSummaryArgs,
      returns: ValidationSummaryResult,
    }),
  );

const spec = Spec.make()
  .add(PatientsGroup)
  .add(CoveragesGroup)
  .add(VsdGroup)
  .add(CodingGroup)
  .add(BillingGroup)
  .add(CatalogGroup)
  .add(PrescriptionsGroup)
  .add(HeilmittelGroup)
  .add(DocumentsGroup)
  .add(DraftsGroup)
  .add(IntegrationGroup);

export default spec;

export type PublicConfectModule = (typeof publicConfectModules)[number];
export type InternalConfectModule = (typeof internalConfectModules)[number];
