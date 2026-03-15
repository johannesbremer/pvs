import { Effect, Schema } from "effect";

import { encodeJsonStringSync } from "../tools/oracles/json-schema";
import { fileSystem } from "../tools/oracles/platform";
import {
  type OracleExecutionResult,
  OracleExecutionResultFields,
} from "../tools/oracles/types";

export const decodeJsonString = <A, I, R>(
  json: string,
  schema: Schema.Schema<A, I, R>,
) => Schema.decodeUnknown(Schema.parseJson(schema))(json);

export const decodeJsonFile = <A, I, R>(
  filePath: string,
  schema: Schema.Schema<A, I, R>,
) =>
  Effect.flatMap(fileSystem.readFileString(filePath), (json) =>
    decodeJsonString(json, schema),
  );

export const encodeJsonString = <A, I>(
  value: A,
  schema: Schema.Schema<A, I, never>,
) => encodeJsonStringSync(schema)(value);

export const formatOracleExecutionResult = (result: OracleExecutionResult) =>
  encodeJsonStringSync(OracleExecutionResultFields)(result);
