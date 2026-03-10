import { Schema } from "effect";

export const OraclePluginKind = Schema.Literal(
  "executable-backed",
  "xsd-backed",
  "fixture-backed",
);

export const OraclePluginFields = Schema.Struct({
  family: Schema.String,
  kind: OraclePluginKind,
  inputKind: Schema.String,
  fixtureRoot: Schema.String,
  command: Schema.optional(Schema.String),
  workingDirectory: Schema.optional(Schema.String),
  expectedOutputs: Schema.Array(Schema.String),
  reportParser: Schema.optional(Schema.String),
  normalizationRules: Schema.Array(Schema.String),
  passFailRule: Schema.String,
});

export type OraclePlugin = Schema.Schema.Type<typeof OraclePluginFields>;
