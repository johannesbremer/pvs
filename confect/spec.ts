import { FunctionSpec, GroupSpec, Spec } from "@confect/core";

import {
  BookTssAppointmentArgs,
  BookTssAppointmentResult,
  CreateAppointmentArgs,
  CreateAppointmentResult,
  CreateReferralArgs,
  CreateReferralResult,
  ListAppointmentsArgs,
  ListAppointmentsResult,
  ListAvailableTssAppointmentsArgs,
  ListAvailableTssAppointmentsResult,
  ListReferralsByPatientArgs,
  ListReferralsByPatientResult,
  LookupReferralByVermittlungscodeArgs,
  LookupReferralByVermittlungscodeResult,
} from "../src/domain/appointments-referrals";
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
  CreateDigaOrderArgs,
  CreateDigaOrderResult,
  FinalizeDigaOrderArgs,
  FinalizeDigaOrderResult,
  GetDigaOrderArgs,
  GetDigaOrderResult,
  ImportDigaCatalogRefsArgs,
  ImportDigaCatalogRefsResult,
  ListDigaOrdersArgs,
  ListDigaOrdersResult,
  LookupDigaByPznArgs,
  LookupDigaByPznResult,
  RenderEvdgaBundleArgs,
  RenderEvdgaBundleResult,
} from "../src/domain/diga-evdga";
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
  RunValidationArgs,
  RunValidationResult,
  ValidationSummaryArgs,
  ValidationSummaryResult,
} from "../src/domain/emission";
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
import { internalConfectModules, publicConfectModules } from "./modules";

export const ConfectSpecLayout = {
  internalModules: internalConfectModules,
  publicModules: publicConfectModules,
} as const;

export const PatientsGroup = GroupSpec.make("patients")
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateManualPatientArgs,
      name: "createManual",
      returns: CreateManualPatientResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: PatientChartArgs,
      name: "getChart",
      returns: PatientChartResult,
    }),
  );

export const CoveragesGroup = GroupSpec.make("coverages").addFunction(
  FunctionSpec.publicQuery({
    args: ListCoveragesArgs,
    name: "listByPatient",
    returns: ListCoveragesResult,
  }),
);

export const VsdGroup = GroupSpec.make("vsd")
  .addFunction(
    FunctionSpec.publicMutation({
      args: RecordVsdSnapshotArgs,
      name: "recordSnapshot",
      returns: RecordVsdSnapshotResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: GetVsdSnapshotArgs,
      name: "getSnapshot",
      returns: GetVsdSnapshotResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: AdoptVsdSnapshotArgs,
      name: "adoptSnapshot",
      returns: AdoptVsdSnapshotResult,
    }),
  );

export const CodingGroup = GroupSpec.make("coding")
  .addFunction(
    FunctionSpec.publicMutation({
      args: RegisterMasterDataPackageArgs,
      name: "registerMasterDataPackage",
      returns: RegisterMasterDataPackageResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: ImportIcdCatalogEntriesArgs,
      name: "importIcdCatalogEntries",
      returns: ImportIcdCatalogEntriesResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateDiagnosisArgs,
      name: "createDiagnosis",
      returns: CreateDiagnosisResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListDiagnosesArgs,
      name: "listDiagnoses",
      returns: ListDiagnosesResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListCodingEvaluationsByDiagnosisArgs,
      name: "listEvaluationsByDiagnosis",
      returns: ListCodingEvaluationsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListCodingEvaluationsByBillingCaseArgs,
      name: "listEvaluationsByBillingCase",
      returns: ListCodingEvaluationsResult,
    }),
  );

export const BillingGroup = GroupSpec.make("billing")
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateBillingCaseArgs,
      name: "createCase",
      returns: CreateBillingCaseResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: AddBillingLineItemArgs,
      name: "addLineItem",
      returns: AddBillingLineItemResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: PrepareKvdtExportArgs,
      name: "prepareKvdtExport",
      returns: PrepareKvdtExportResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: GetBillingCaseArgs,
      name: "getCase",
      returns: GetBillingCaseResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListBillingCasesArgs,
      name: "listCases",
      returns: ListBillingCasesResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: GetKvdtCaseViewArgs,
      name: "getKvdtCaseView",
      returns: GetKvdtCaseViewResult,
    }),
  );

export const AppointmentsGroup = GroupSpec.make("appointments")
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateAppointmentArgs,
      name: "create",
      returns: CreateAppointmentResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListAppointmentsArgs,
      name: "listByOrganization",
      returns: ListAppointmentsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListAvailableTssAppointmentsArgs,
      name: "listAvailableTss",
      returns: ListAvailableTssAppointmentsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: BookTssAppointmentArgs,
      name: "bookTss",
      returns: BookTssAppointmentResult,
    }),
  );

export const ReferralsGroup = GroupSpec.make("referrals")
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateReferralArgs,
      name: "create",
      returns: CreateReferralResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListReferralsByPatientArgs,
      name: "listByPatient",
      returns: ListReferralsByPatientResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: LookupReferralByVermittlungscodeArgs,
      name: "lookupByVermittlungscode",
      returns: LookupReferralByVermittlungscodeResult,
    }),
  );

export const CatalogGroup = GroupSpec.make("catalog")
  .addFunction(
    FunctionSpec.publicMutation({
      args: ImportMedicationCatalogRefsArgs,
      name: "importMedicationCatalogRefs",
      returns: ImportMedicationCatalogRefsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: LookupMedicationByPznArgs,
      name: "lookupMedicationByPzn",
      returns: LookupMedicationByPznResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: ImportDigaCatalogRefsArgs,
      name: "importDigaCatalogRefs",
      returns: ImportDigaCatalogRefsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: LookupDigaByPznArgs,
      name: "lookupDigaByPzn",
      returns: LookupDigaByPznResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: ImportHeilmittelCatalogRefsArgs,
      name: "importHeilmittelCatalogRefs",
      returns: ImportHeilmittelCatalogRefsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: LookupHeilmittelByKeyArgs,
      name: "lookupHeilmittelByKey",
      returns: LookupHeilmittelByKeyResult,
    }),
  );

export const DigaGroup = GroupSpec.make("diga")
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateDigaOrderArgs,
      name: "createOrder",
      returns: CreateDigaOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: GetDigaOrderArgs,
      name: "getOrder",
      returns: GetDigaOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListDigaOrdersArgs,
      name: "listOrdersByPatient",
      returns: ListDigaOrdersResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: FinalizeDigaOrderArgs,
      name: "finalizeOrder",
      returns: FinalizeDigaOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: RenderEvdgaBundleArgs,
      name: "renderEvdgaBundle",
      returns: RenderEvdgaBundleResult,
    }),
  );

export const PrescriptionsGroup = GroupSpec.make("prescriptions")
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateMedicationOrderArgs,
      name: "createOrder",
      returns: CreateMedicationOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: GetMedicationOrderArgs,
      name: "getOrder",
      returns: GetMedicationOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListMedicationOrdersArgs,
      name: "listOrdersByPatient",
      returns: ListMedicationOrdersResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: FinalizeMedicationOrderArgs,
      name: "finalizeOrder",
      returns: FinalizeMedicationOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: RenderErpBundleArgs,
      name: "renderErpBundle",
      returns: RenderErpBundleResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateMedicationPlanArgs,
      name: "createMedicationPlan",
      returns: CreateMedicationPlanResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: AddMedicationPlanEntryArgs,
      name: "addPlanEntry",
      returns: AddMedicationPlanEntryResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: GetCurrentMedicationPlanArgs,
      name: "getCurrentPlan",
      returns: GetCurrentMedicationPlanResult,
    }),
  );

export const HeilmittelGroup = GroupSpec.make("heilmittel")
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateHeilmittelApprovalArgs,
      name: "createApproval",
      returns: CreateHeilmittelApprovalResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateHeilmittelOrderArgs,
      name: "createOrder",
      returns: CreateHeilmittelOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: GetHeilmittelOrderArgs,
      name: "getOrder",
      returns: GetHeilmittelOrderResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListHeilmittelOrdersArgs,
      name: "listOrdersByPatient",
      returns: ListHeilmittelOrdersResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: FinalizeHeilmittelOrderArgs,
      name: "finalizeOrder",
      returns: FinalizeHeilmittelOrderResult,
    }),
  );

export const DocumentsGroup = GroupSpec.make("documents")
  .addFunction(
    FunctionSpec.publicMutation({
      args: RegisterFormDefinitionArgs,
      name: "registerFormDefinition",
      returns: RegisterFormDefinitionResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListFormDefinitionsArgs,
      name: "listFormDefinitions",
      returns: ListFormDefinitionsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListFormInstancesByPatientArgs,
      name: "listFormInstancesByPatient",
      returns: ListFormInstancesByPatientResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: CreateEauDocumentArgs,
      name: "createEauDocument",
      returns: CreateEauDocumentResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: RenderEauDocumentArgs,
      name: "renderEauDocument",
      returns: RenderEauDocumentResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: GetDocumentArgs,
      name: "getDocument",
      returns: GetDocumentResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListDocumentsByPatientArgs,
      name: "listByPatient",
      returns: ListDocumentsByPatientResult,
    }),
  );

export const DraftsGroup = GroupSpec.make("drafts")
  .addFunction(
    FunctionSpec.publicMutation({
      args: SaveDraftWorkspaceArgs,
      name: "saveWorkspace",
      returns: SaveDraftWorkspaceResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: GetDraftWorkspaceArgs,
      name: "getWorkspace",
      returns: GetDraftWorkspaceResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: PromoteDraftWorkspaceArgs,
      name: "promoteWorkspace",
      returns: PromoteDraftWorkspaceResult,
    }),
  );

export const IntegrationGroup = GroupSpec.make("integration")
  .addFunction(
    FunctionSpec.publicQuery({
      args: ListOraclePluginsArgs,
      name: "listOraclePlugins",
      returns: ListOraclePluginsResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: BuildValidationPlanArgs,
      name: "buildValidationPlan",
      returns: BuildValidationPlanResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      args: ValidationSummaryArgs,
      name: "getValidationSummary",
      returns: ValidationSummaryResult,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      args: RunValidationArgs,
      name: "runValidation",
      returns: RunValidationResult,
    }),
  );

const spec = Spec.make()
  .add(PatientsGroup)
  .add(CoveragesGroup)
  .add(VsdGroup)
  .add(CodingGroup)
  .add(BillingGroup)
  .add(AppointmentsGroup)
  .add(ReferralsGroup)
  .add(CatalogGroup)
  .add(DigaGroup)
  .add(PrescriptionsGroup)
  .add(HeilmittelGroup)
  .add(DocumentsGroup)
  .add(DraftsGroup)
  .add(IntegrationGroup);

export default spec;

export type InternalConfectModule = (typeof internalConfectModules)[number];
export type PublicConfectModule = (typeof publicConfectModules)[number];
