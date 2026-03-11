import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  AttachmentRefValue,
  IsoDate,
  IsoDateTime,
} from "../../confect/tables/primitives";
import {
  OracleExecutionResultFields,
  OraclePlanFields,
  OraclePluginFields,
} from "../../tools/oracles/types";
import { EauPayload } from "../fhir-r4-effect/resources/eau";
import { ErpPayload } from "../fhir-r4-effect/resources/erp";

export const XmlRenderResult = Schema.Struct({
  boundaryKind: Schema.Literal("emit-only"),
  contentType: Schema.Literal("application/fhir+xml"),
  encoding: Schema.Literal("UTF-8"),
  family: Schema.Literal("ERP", "EAU"),
  xml: Schema.String,
});

export const RenderErpBundleArgs = Schema.Struct({
  medicationOrderId: GenericId.GenericId("medicationOrders"),
  profileVersion: Schema.optional(Schema.String),
});
export const RenderErpBundleFound = Schema.Struct({
  found: Schema.Literal(true),
  payload: ErpPayload,
  validationPlan: Schema.optional(OraclePlanFields),
  xml: XmlRenderResult,
});
export const RenderErpBundleMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const RenderErpBundleResult = Schema.Union(
  RenderErpBundleFound,
  RenderErpBundleMissing,
);

export const CreateEauDocumentArgs = Schema.Struct({
  artifact: Schema.Struct({
    attachment: AttachmentRefValue,
    externalIdentifier: Schema.optional(Schema.String),
  }),
  attesterPractitionerId: GenericId.GenericId("practitioners"),
  coverageId: GenericId.GenericId("coverages"),
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  employerView: Schema.optional(
    Schema.Struct({
      attachment: AttachmentRefValue,
      externalIdentifier: Schema.optional(Schema.String),
    }),
  ),
  encounterId: GenericId.GenericId("encounters"),
  finalizedAt: IsoDateTime,
  insurerView: Schema.optional(
    Schema.Struct({
      attachment: AttachmentRefValue,
      externalIdentifier: Schema.optional(Schema.String),
    }),
  ),
  organizationId: GenericId.GenericId("organizations"),
  patientId: GenericId.GenericId("patients"),
  patientView: Schema.optional(
    Schema.Struct({
      attachment: AttachmentRefValue,
      externalIdentifier: Schema.optional(Schema.String),
    }),
  ),
  profileVersion: Schema.optional(Schema.String),
  signerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
});
export const CreateEauDocumentResult = Schema.Struct({
  artifactId: GenericId.GenericId("artifacts"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  employerViewArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  insurerViewArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  patientViewArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  revisionId: GenericId.GenericId("documentRevisions"),
});

export const RenderEauDocumentArgs = Schema.Struct({
  attesterPractitionerId: GenericId.GenericId("practitioners"),
  coverageId: GenericId.GenericId("coverages"),
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  documentId: GenericId.GenericId("clinicalDocuments"),
  encounterId: GenericId.GenericId("encounters"),
  organizationId: GenericId.GenericId("organizations"),
  profileVersion: Schema.optional(Schema.String),
  signerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
});
export const RenderEauDocumentFound = Schema.Struct({
  found: Schema.Literal(true),
  payload: EauPayload,
  validationPlan: Schema.optional(OraclePlanFields),
  xml: XmlRenderResult,
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
  artifactId: Schema.optional(GenericId.GenericId("artifacts")),
  documentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
  family: Schema.String,
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
  documentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
  executionMode: Schema.optional(Schema.Literal("local", "executable")),
  family: Schema.optional(Schema.String),
  payloadPreview: Schema.optional(Schema.String),
  payloadPreviewXml: Schema.optional(Schema.String),
  profileVersion: Schema.optional(Schema.String),
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
