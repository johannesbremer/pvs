import { Schema } from "effect";

export const decodeJsonStringSync = <A, I>(
  schema: Schema.Schema<A, I, never>,
) => Schema.decodeUnknownSync(Schema.parseJson(schema));

export const encodeJsonStringSync = <A, I>(
  schema: Schema.Schema<A, I, never>,
) => Schema.encodeSync(Schema.parseJson(schema));
