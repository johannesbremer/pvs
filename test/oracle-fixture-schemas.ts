import { Schema } from "effect";

import { BfbRenderContextPreviewFields } from "../tools/oracles/bfb/run";
import {
  CodingOraclePreviewFields,
  CodingPackagePreviewFields,
} from "../tools/oracles/coding/run";
import { HeilmittelOraclePreviewFields } from "../tools/oracles/heilmittel/run";

const OptionalStringArray = Schema.optional(Schema.Array(Schema.String));

export const BfbFixtureFields = Schema.extend(
  BfbRenderContextPreviewFields,
  Schema.Struct({
    expectedErrorCodes: OptionalStringArray,
    expectedPassed: Schema.Boolean,
  }),
);

export const CodingFixtureFields = Schema.extend(
  CodingOraclePreviewFields,
  Schema.Struct({
    expectedErrorCodes: OptionalStringArray,
    expectedPassed: Schema.Boolean,
    expectedWarningCodes: OptionalStringArray,
  }),
);

export const CodingPackageFixtureFields = Schema.extend(
  CodingPackagePreviewFields,
  Schema.Struct({
    expectedErrorCodes: OptionalStringArray,
    expectedPassed: Schema.Boolean,
  }),
);

export const HeilmittelFixtureFields = Schema.extend(
  HeilmittelOraclePreviewFields,
  Schema.Struct({
    expectedErrorCodes: OptionalStringArray,
    expectedPassed: Schema.Boolean,
  }),
);

export const CoverageInventoryFields = Schema.Struct({
  asOf: Schema.String,
  families: Schema.Array(
    Schema.Struct({
      canonicalModel: Schema.Union(Schema.Boolean, Schema.String),
      currentNote: Schema.String,
      family: Schema.String,
      oracleStatus: Schema.String,
      runtimeWorkflow: Schema.Union(Schema.Boolean, Schema.String),
      sourceQuarterOrVersion: Schema.String,
      testStatus: Schema.String,
    }),
  ),
  inventoryVersion: Schema.Number,
});
