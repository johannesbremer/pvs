import { Schema } from "effect";

export const OraclePluginKind = Schema.Literal(
  "executable-backed",
  "xsd-backed",
  "fixture-backed",
);

export const OraclePluginFields = Schema.Struct({
  command: Schema.optional(Schema.String),
  expectedOutputs: Schema.Array(Schema.String),
  family: Schema.String,
  fixtureRoot: Schema.String,
  inputKind: Schema.String,
  kind: OraclePluginKind,
  normalizationRules: Schema.Array(Schema.String),
  passFailRule: Schema.String,
  reportParser: Schema.optional(Schema.String),
  workingDirectory: Schema.optional(Schema.String),
});

export type OraclePlugin = Schema.Schema.Type<typeof OraclePluginFields>;

export const OraclePlanFields = Schema.Struct({
  artifactId: Schema.optional(Schema.String),
  command: Schema.optional(Schema.String),
  documentId: Schema.optional(Schema.String),
  expectedOutputs: Schema.Array(Schema.String),
  family: Schema.String,
  fixtureRoot: Schema.String,
  inputKind: Schema.String,
  passFailRule: Schema.String,
  pluginKind: OraclePluginKind,
  profileVersion: Schema.optional(Schema.String),
  workingDirectory: Schema.optional(Schema.String),
});

export type OraclePlan = Schema.Schema.Type<typeof OraclePlanFields>;

export const OracleReportFields = Schema.Struct({
  family: Schema.String,
  passed: Schema.Boolean,
  severity: Schema.Literal("info", "warning", "error"),
  summary: Schema.String,
});

export type OracleReport = Schema.Schema.Type<typeof OracleReportFields>;

export const OracleFindingFields = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  severity: Schema.Literal("info", "warning", "error"),
});

export type OracleFinding = Schema.Schema.Type<typeof OracleFindingFields>;

export const OracleExecutionResultFields = Schema.Struct({
  family: Schema.String,
  findings: Schema.Array(OracleFindingFields),
  passed: Schema.Boolean,
  summary: Schema.String,
});

export type OracleExecutionResult = Schema.Schema.Type<
  typeof OracleExecutionResultFields
>;
