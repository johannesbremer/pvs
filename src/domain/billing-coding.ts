import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  BillingCasesFields,
  BillingLineItemsFields,
  CodingEvaluationsFields,
  DiagnosesFields,
  IcdCatalogEntriesFields,
} from "../../confect/tables/billing";
import { MasterDataPackagesFields } from "../../confect/tables/core";
import { IsoDateTime } from "../../confect/tables/primitives";
import { withSystemFields } from "./shared";

export const BillingCaseDocument = withSystemFields(
  "billingCases",
  BillingCasesFields,
);
export const BillingLineItemDocument = withSystemFields(
  "billingLineItems",
  BillingLineItemsFields,
);
export const DiagnosisDocument = withSystemFields("diagnoses", DiagnosesFields);
export const CodingEvaluationDocument = withSystemFields(
  "codingEvaluations",
  CodingEvaluationsFields,
);
export const IcdCatalogEntryDocument = withSystemFields(
  "icdCatalogEntries",
  IcdCatalogEntriesFields,
);
export const MasterDataPackageDocument = withSystemFields(
  "masterDataPackages",
  MasterDataPackagesFields,
);

export const RegisterMasterDataPackageArgs = MasterDataPackagesFields;
export const RegisterMasterDataPackageResult = Schema.Struct({
  packageId: GenericId.GenericId("masterDataPackages"),
});

export const ImportIcdCatalogEntriesArgs = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  entries: Schema.Array(IcdCatalogEntriesFields.omit("sourcePackageId")),
});
export const ImportIcdCatalogEntriesResult = Schema.Struct({
  importedCount: Schema.Number,
  entryIds: Schema.Array(GenericId.GenericId("icdCatalogEntries")),
});

export const CreateBillingCaseArgs = BillingCasesFields;
export const CreateBillingCaseResult = Schema.Struct({
  billingCaseId: GenericId.GenericId("billingCases"),
});

export const AddBillingLineItemArgs = BillingLineItemsFields;
export const AddBillingLineItemResult = Schema.Struct({
  billingLineItemId: GenericId.GenericId("billingLineItems"),
});

export const CreateDiagnosisArgs = DiagnosesFields.omit("recordStatus").pipe(
  Schema.extend(
    Schema.Struct({
      createdAt: IsoDateTime,
    }),
  ),
);
export const CreateDiagnosisResult = Schema.Struct({
  diagnosisId: GenericId.GenericId("diagnoses"),
  evaluationIds: Schema.Array(GenericId.GenericId("codingEvaluations")),
});

export const GetBillingCaseArgs = Schema.Struct({
  billingCaseId: GenericId.GenericId("billingCases"),
});
export const GetBillingCaseFound = Schema.Struct({
  found: Schema.Literal(true),
  billingCase: BillingCaseDocument,
  diagnoses: Schema.Array(DiagnosisDocument),
  lineItems: Schema.Array(BillingLineItemDocument),
});
export const GetBillingCaseMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const GetBillingCaseResult = Schema.Union(
  GetBillingCaseFound,
  GetBillingCaseMissing,
);

export const ListBillingCasesArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  quarter: Schema.optional(Schema.String),
});
export const ListBillingCasesResult = Schema.Array(BillingCaseDocument);

export const GetKvdtCaseViewArgs = Schema.Struct({
  billingCaseId: GenericId.GenericId("billingCases"),
});
export const KvdtReadyIssue = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  blocking: Schema.Boolean,
});
export const GetKvdtCaseViewFound = Schema.Struct({
  found: Schema.Literal(true),
  billingCase: BillingCaseDocument,
  diagnoses: Schema.Array(DiagnosisDocument),
  lineItems: Schema.Array(BillingLineItemDocument),
  evaluations: Schema.Array(CodingEvaluationDocument),
  issues: Schema.Array(KvdtReadyIssue),
  exportReady: Schema.Boolean,
});
export const GetKvdtCaseViewMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const GetKvdtCaseViewResult = Schema.Union(
  GetKvdtCaseViewFound,
  GetKvdtCaseViewMissing,
);

export const PrepareKvdtExportArgs = Schema.Struct({
  billingCaseId: GenericId.GenericId("billingCases"),
});
export const PrepareKvdtExportReady = Schema.Struct({
  outcome: Schema.Literal("ready"),
  billingCaseId: GenericId.GenericId("billingCases"),
  issues: Schema.Array(KvdtReadyIssue),
});
export const PrepareKvdtExportBlocked = Schema.Struct({
  outcome: Schema.Literal("blocked"),
  billingCaseId: GenericId.GenericId("billingCases"),
  issues: Schema.Array(KvdtReadyIssue),
});
export const PrepareKvdtExportMissing = Schema.Struct({
  outcome: Schema.Literal("billing-case-not-found"),
});
export const PrepareKvdtExportResult = Schema.Union(
  PrepareKvdtExportReady,
  PrepareKvdtExportBlocked,
  PrepareKvdtExportMissing,
);

export const ListDiagnosesArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
});
export const ListDiagnosesResult = Schema.Array(DiagnosisDocument);

export const ListCodingEvaluationsByDiagnosisArgs = Schema.Struct({
  diagnosisId: GenericId.GenericId("diagnoses"),
});
export const ListCodingEvaluationsByBillingCaseArgs = Schema.Struct({
  billingCaseId: GenericId.GenericId("billingCases"),
});
export const ListCodingEvaluationsResult = Schema.Array(
  CodingEvaluationDocument,
);
