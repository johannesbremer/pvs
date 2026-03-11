import { GenericId } from "@confect/core";
import { Schema } from "effect";

export const withSystemFields = <const TableName extends string>(
  tableName: TableName,
  fields: Schema.Schema.AnyNoContext,
) =>
  Schema.Struct({
    _creationTime: Schema.Number,
    _id: GenericId.GenericId(tableName),
  }).pipe(Schema.extend(fields));
