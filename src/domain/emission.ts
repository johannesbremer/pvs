import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { AttachmentRefValue, IsoDate, IsoDateTime } from "../../confect/tables/primitives";
import { EauPayload } from "../fhir-r4-effect/resources/eau";
import { ErpPayload } from "../fhir-r4-effect/resources/erp";
import {
  OracleExecutionResultFields,
  OraclePlanFields,
  OraclePluginFields,
} from "../../tools/oracles/types";

export const XmlRenderResult = Schema.Struct({
  family: Schema.Literal("ERP", "EAU"),
  encoding: Schema.Literal("UTF-8"),
  contentType: Schema.Literal("application/fhir+xml"),
  boundaryKind: Schema.Literal("emit-only"),
  xml: Schema.String,
});

export const RenderErpBundleArgs = Schema.Struct({
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  profileVersion: Schema.optional(Schema.String),
});
export const RenderErpBundleFound = Schema.Struct({
  found: Schema.Literal(true),
  payload: ErpPayload,
  xml: XmlRenderResult,
  validationPlan: Schema.optional(OraclePlanFields),
});
export const RenderErpBundleMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const RenderErpBundleResult = Schema.Union(
  RenderErpBundleFound,
  RenderErpBundleMissing,
);

export const CreateEauDocumentArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  encounterId: GenericId.GenericId("encounters"),
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  attesterPractitionerId: GenericId.GenericId("practitioners"),
  signerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  organizationId: GenericId.GenericId("organizations"),
  coverageId: GenericId.GenericId("coverages"),
  finalizedAt: IsoDateTime,
  profileVersion: Schema.optional(Schema.String),
  artifact: Schema.Struct({
    attachment: AttachmentRefValue,
    externalIdentifier: Schema.optional(Schema.String),
  }),
  patientView: Schema.optional(
    Schema.Struct({
      attachment: AttachmentRefValue,
      externalIdentifier: Schema.optional(Schema.String),
    }),
  ),
  employerView: Schema.optional(
    Schema.Struct({
      attachment: AttachmentRefValue,
      externalIdentifier: Schema.optional(Schema.String),
    }),
  ),
  insurerView: Schema.optional(
    Schema.Struct({
      attachment: AttachmentRefValue,
      externalIdentifier: Schema.optional(Schema.String),
    }),
  ),
});
export const CreateEauDocumentResult = Schema.Struct({
  documentId: GenericId.GenericId("clinicalDocuments"),
  revisionId: GenericId.GenericId("documentRevisions"),
  artifactId: GenericId.GenericId("artifacts"),
  patientViewArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  employerViewArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  insurerViewArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
});

export const RenderEauDocumentArgs = Schema.Struct({
  documentId: GenericId.GenericId("clinicalDocuments"),
  encounterId: GenericId.GenericId("encounters"),
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  attesterPractitionerId: GenericId.GenericId("practitioners"),
  signerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  organizationId: GenericId.GenericId("organizations"),
  coverageId: GenericId.GenericId("coverages"),
  profileVersion: Schema.optional(Schema.String),
});
export const RenderEauDocumentFound = Schema.Struct({
  found: Schema.Literal(true),
  payload: EauPayload,
  xml: XmlRenderResult,
  validationPlan: Schema.optional(OraclePlanFields),
});
export const RenderEauDocumentMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const RenderEauDocumentResult = Schema.Union(
  RenderEauDocumentFound,
  RenderEauDocumentMissing,
);

export const ListOraclePluginsArgs = Schema.Struct({
  family: Schema.optional(Schema.String),
});
export const ListOraclePluginsResult = Schema.Array(OraclePluginFields);

export const BuildValidationPlanArgs = Schema.Struct({
  family: Schema.String,
  artifactId: Schema.optional(GenericId.GenericId("artifacts")),
  documentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
  profileVersion: Schema.optional(Schema.String),
});
export const BuildValidationPlanFound = Schema.Struct({
  found: Schema.Literal(true),
  plan: OraclePlanFields,
});
export const BuildValidationPlanMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const BuildValidationPlanResult = Schema.Union(
  BuildValidationPlanFound,
  BuildValidationPlanMissing,
);

export const ValidationSummaryArgs = Schema.Struct({
  artifactId: GenericId.GenericId("artifacts"),
});
export const ValidationSummaryFound = Schema.Struct({
  found: Schema.Literal(true),
  validationStatus: Schema.Literal("pending", "valid", "invalid"),
  validationSummary: Schema.optional(Schema.String),
});
export const ValidationSummaryMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const ValidationSummaryResult = Schema.Union(
  ValidationSummaryFound,
  ValidationSummaryMissing,
);

export const RunValidationArgs = Schema.Struct({
  artifactId: GenericId.GenericId("artifacts"),
  family: Schema.optional(Schema.String),
  documentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
  profileVersion: Schema.optional(Schema.String),
  executionMode: Schema.optional(Schema.Literal("local", "executable")),
  payloadPreviewXml: Schema.optional(Schema.String),
  payloadPreview: Schema.optional(Schema.String),
});
export const RunValidationMissing = Schema.Struct({
  outcome: Schema.Literal("artifact-not-found"),
});
export const RunValidationUnsupported = Schema.Struct({
  outcome: Schema.Literal("no-oracle-plan"),
});
export const RunValidationCompleted = Schema.Struct({
  outcome: Schema.Literal("completed"),
  plan: OraclePlanFields,
  report: OracleExecutionResultFields,
  validationStatus: Schema.Literal("valid", "invalid"),
});
export const RunValidationResult = Schema.Union(
  RunValidationMissing,
  RunValidationUnsupported,
  RunValidationCompleted,
);
