import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  DigaCatalogRefsFields,
  DigaOrdersFields,
} from "../../confect/tables/prescribing";
import { IsoDateTime } from "../../confect/tables/primitives";
import { OraclePlanFields } from "../../tools/oracles/types";
import { EvdgaPayload } from "../fhir-r4-effect/resources/evdga";
import { FinalizeDocumentArtifactInput } from "./prescribing-documents";
import { withSystemFields } from "./shared";

export const DigaCatalogRefDocument = withSystemFields(
  "digaCatalogRefs",
  DigaCatalogRefsFields,
);
export const DigaOrderDocument = withSystemFields(
  "digaOrders",
  DigaOrdersFields,
);

export const ImportDigaCatalogRefsArgs = Schema.Struct({
  entries: Schema.Array(DigaCatalogRefsFields.omit("sourcePackageId")),
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
});
export const ImportDigaCatalogRefsResult = Schema.Struct({
  entryIds: Schema.Array(GenericId.GenericId("digaCatalogRefs")),
  importedCount: Schema.Number,
});

export const LookupDigaByPznArgs = Schema.Struct({
  pzn: Schema.String,
});
export const LookupDigaByPznFound = Schema.Struct({
  entry: DigaCatalogRefDocument,
  found: Schema.Literal(true),
});
export const LookupDigaByPznMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const LookupDigaByPznResult = Schema.Union(
  LookupDigaByPznFound,
  LookupDigaByPznMissing,
);

export const CreateDigaOrderArgs = DigaOrdersFields;
export const CreateDigaOrderResult = Schema.Struct({
  digaOrderId: GenericId.GenericId("digaOrders"),
});

export const GetDigaOrderArgs = Schema.Struct({
  digaOrderId: GenericId.GenericId("digaOrders"),
});
export const GetDigaOrderFound = Schema.Struct({
  found: Schema.Literal(true),
  order: DigaOrderDocument,
});
export const GetDigaOrderMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const GetDigaOrderResult = Schema.Union(
  GetDigaOrderFound,
  GetDigaOrderMissing,
);

export const ListDigaOrdersArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  status: Schema.optional(
    Schema.Literal("draft", "final", "cancelled", "superseded"),
  ),
});
export const ListDigaOrdersResult = Schema.Array(DigaOrderDocument);

export const FinalizeDigaOrderArgs = Schema.Struct({
  artifact: FinalizeDocumentArtifactInput,
  digaOrderId: GenericId.GenericId("digaOrders"),
  finalizedAt: IsoDateTime,
  patientPrint: Schema.optional(FinalizeDocumentArtifactInput),
  profileVersion: Schema.optional(Schema.String),
  tokenArtifact: Schema.optional(FinalizeDocumentArtifactInput),
});

export const FinalizeDigaOrderFinalized = Schema.Struct({
  artifactId: GenericId.GenericId("artifacts"),
  digaOrderId: GenericId.GenericId("digaOrders"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  outcome: Schema.Literal("finalized"),
  patientPrintArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  revisionId: GenericId.GenericId("documentRevisions"),
  tokenArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
});
export const FinalizeDigaOrderBlocked = Schema.Struct({
  digaOrderId: GenericId.GenericId("digaOrders"),
  issues: Schema.Array(
    Schema.Struct({
      blocking: Schema.Boolean,
      code: Schema.String,
      message: Schema.String,
    }),
  ),
  outcome: Schema.Literal("blocked"),
});
export const FinalizeDigaOrderNotDraft = Schema.Struct({
  digaOrderId: GenericId.GenericId("digaOrders"),
  outcome: Schema.Literal("not-draft"),
});
export const FinalizeDigaOrderMissing = Schema.Struct({
  outcome: Schema.Literal("order-not-found"),
});
export const FinalizeDigaOrderResult = Schema.Union(
  FinalizeDigaOrderFinalized,
  FinalizeDigaOrderBlocked,
  FinalizeDigaOrderNotDraft,
  FinalizeDigaOrderMissing,
);

export const EvdgaXmlRenderResult = Schema.Struct({
  boundaryKind: Schema.Literal("emit-only"),
  contentType: Schema.Literal("application/fhir+xml"),
  encoding: Schema.Literal("UTF-8"),
  family: Schema.Literal("EVDGA"),
  xml: Schema.String,
});

export const RenderEvdgaBundleArgs = Schema.Struct({
  digaOrderId: GenericId.GenericId("digaOrders"),
  profileVersion: Schema.optional(Schema.String),
});
export const RenderEvdgaBundleFound = Schema.Struct({
  found: Schema.Literal(true),
  payload: EvdgaPayload,
  validationPlan: Schema.optional(OraclePlanFields),
  xml: EvdgaXmlRenderResult,
});
export const RenderEvdgaBundleMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const RenderEvdgaBundleResult = Schema.Union(
  RenderEvdgaBundleFound,
  RenderEvdgaBundleMissing,
);
