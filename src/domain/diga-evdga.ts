import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  DigaCatalogRefsFields,
  DigaOrdersFields,
} from "../../confect/tables/prescribing";
import { IsoDateTime } from "../../confect/tables/primitives";
import { OraclePlanFields } from "../../tools/oracles/types";
import { EvdgaPayload } from "../fhir-r4-effect/resources/evdga";
import { withSystemFields } from "./shared";
import { FinalizeDocumentArtifactInput } from "./prescribing-documents";

export const DigaCatalogRefDocument = withSystemFields(
  "digaCatalogRefs",
  DigaCatalogRefsFields,
);
export const DigaOrderDocument = withSystemFields("digaOrders", DigaOrdersFields);

export const ImportDigaCatalogRefsArgs = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  entries: Schema.Array(DigaCatalogRefsFields.omit("sourcePackageId")),
});
export const ImportDigaCatalogRefsResult = Schema.Struct({
  importedCount: Schema.Number,
  entryIds: Schema.Array(GenericId.GenericId("digaCatalogRefs")),
});

export const LookupDigaByPznArgs = Schema.Struct({
  pzn: Schema.String,
});
export const LookupDigaByPznFound = Schema.Struct({
  found: Schema.Literal(true),
  entry: DigaCatalogRefDocument,
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
  digaOrderId: GenericId.GenericId("digaOrders"),
  finalizedAt: IsoDateTime,
  profileVersion: Schema.optional(Schema.String),
  artifact: FinalizeDocumentArtifactInput,
  patientPrint: Schema.optional(FinalizeDocumentArtifactInput),
  tokenArtifact: Schema.optional(FinalizeDocumentArtifactInput),
});

export const FinalizeDigaOrderFinalized = Schema.Struct({
  outcome: Schema.Literal("finalized"),
  digaOrderId: GenericId.GenericId("digaOrders"),
  documentId: GenericId.GenericId("clinicalDocuments"),
  revisionId: GenericId.GenericId("documentRevisions"),
  artifactId: GenericId.GenericId("artifacts"),
  patientPrintArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  tokenArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
});
export const FinalizeDigaOrderBlocked = Schema.Struct({
  outcome: Schema.Literal("blocked"),
  digaOrderId: GenericId.GenericId("digaOrders"),
  issues: Schema.Array(
    Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      blocking: Schema.Boolean,
    }),
  ),
});
export const FinalizeDigaOrderNotDraft = Schema.Struct({
  outcome: Schema.Literal("not-draft"),
  digaOrderId: GenericId.GenericId("digaOrders"),
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
  family: Schema.Literal("EVDGA"),
  encoding: Schema.Literal("UTF-8"),
  contentType: Schema.Literal("application/fhir+xml"),
  boundaryKind: Schema.Literal("emit-only"),
  xml: Schema.String,
});

export const RenderEvdgaBundleArgs = Schema.Struct({
  digaOrderId: GenericId.GenericId("digaOrders"),
  profileVersion: Schema.optional(Schema.String),
});
export const RenderEvdgaBundleFound = Schema.Struct({
  found: Schema.Literal(true),
  payload: EvdgaPayload,
  xml: EvdgaXmlRenderResult,
  validationPlan: Schema.optional(OraclePlanFields),
});
export const RenderEvdgaBundleMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const RenderEvdgaBundleResult = Schema.Union(
  RenderEvdgaBundleFound,
  RenderEvdgaBundleMissing,
);
