import { GenericId } from "@confect/core";
import { Schema } from "effect";

export const withSystemFields = <const TableName extends string>(
  tableName: TableName,
  fields: Schema.Schema.AnyNoContext,
) =>
  Schema.Struct({
    _id: GenericId.GenericId(tableName),
    _creationTime: Schema.Number,
  }).pipe(Schema.extend(fields));
