import { Table } from "@confect/server";
import { Schema } from "effect";

// Confect's schema-to-validator inference can overflow TS on large healthcare
// schemas. Keep the runtime schema intact and narrow the table metadata here.
export const unsafeMakeTable = (
  name: string,
  fields: Schema.Schema.AnyNoContext,
) => Table.make(name, fields as never) as any;
