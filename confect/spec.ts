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

const spec = Spec.make()
  .add(PatientsGroup)
  .add(CoveragesGroup)
  .add(VsdGroup)
  .add(CodingGroup)
  .add(BillingGroup);

export default spec;

export type PublicConfectModule = (typeof publicConfectModules)[number];
export type InternalConfectModule = (typeof internalConfectModules)[number];
