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

export const OraclePlanFields = Schema.Struct({
  family: Schema.String,
  pluginKind: OraclePluginKind,
  inputKind: Schema.String,
  fixtureRoot: Schema.String,
  command: Schema.optional(Schema.String),
  workingDirectory: Schema.optional(Schema.String),
  expectedOutputs: Schema.Array(Schema.String),
  passFailRule: Schema.String,
  artifactId: Schema.optional(Schema.String),
  documentId: Schema.optional(Schema.String),
  profileVersion: Schema.optional(Schema.String),
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
  severity: Schema.Literal("info", "warning", "error"),
  message: Schema.String,
});

export type OracleFinding = Schema.Schema.Type<typeof OracleFindingFields>;

export const OracleExecutionResultFields = Schema.Struct({
  family: Schema.String,
  passed: Schema.Boolean,
  findings: Schema.Array(OracleFindingFields),
  summary: Schema.String,
});

export type OracleExecutionResult =
  Schema.Schema.Type<typeof OracleExecutionResultFields>;
