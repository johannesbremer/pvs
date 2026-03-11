import { GenericId } from "@confect/core";
import { Schema } from "effect";

export const IsoDate = Schema.String;
export const IsoDateTime = Schema.String;
export const NonEmptyString = Schema.String;

export const CodingValue = Schema.Struct({
  code: Schema.String,
  display: Schema.optional(Schema.String),
  system: Schema.String,
  userSelected: Schema.optional(Schema.Boolean),
  version: Schema.optional(Schema.String),
});

export const PeriodValue = Schema.Struct({
  end: Schema.optional(IsoDateTime),
  start: Schema.optional(IsoDateTime),
});

export const CodeableConceptValue = Schema.Struct({
  coding: Schema.Array(CodingValue),
  text: Schema.optional(Schema.String),
});

export const IdentifierValue = Schema.Struct({
  assignerDisplay: Schema.optional(Schema.String),
  period: Schema.optional(PeriodValue),
  system: Schema.String,
  type: Schema.optional(CodingValue),
  use: Schema.optional(
    Schema.Literal("usual", "official", "temp", "secondary", "old"),
  ),
  value: Schema.String,
});

export const HumanNameValue = Schema.Struct({
  family: Schema.String,
  given: Schema.Array(Schema.String),
  nameAddition: Schema.optional(Schema.String),
  ownName: Schema.optional(Schema.String),
  prefixes: Schema.Array(Schema.String),
  use: Schema.optional(Schema.Literal("official", "usual", "maiden", "old")),
});

export const AddressValue = Schema.Struct({
  additionalLocator: Schema.optional(Schema.String),
  city: Schema.optional(Schema.String),
  country: Schema.optional(Schema.String),
  houseNumber: Schema.optional(Schema.String),
  line1: Schema.String,
  line2: Schema.optional(Schema.String),
  postalCode: Schema.optional(Schema.String),
  postBox: Schema.optional(Schema.String),
  streetName: Schema.optional(Schema.String),
  type: Schema.optional(Schema.Literal("physical", "postal", "both")),
});

export const ContactPointValue = Schema.Struct({
  system: Schema.Literal("phone", "fax", "email", "url", "other"),
  use: Schema.optional(Schema.Literal("work", "home", "mobile", "temp")),
  value: Schema.String,
});

export const QuantityValue = Schema.Struct({
  code: Schema.optional(Schema.String),
  system: Schema.optional(Schema.String),
  unit: Schema.optional(Schema.String),
  value: Schema.Number,
});

export const ReferenceValue = Schema.Struct({
  display: Schema.optional(Schema.String),
  id: Schema.String,
  table: Schema.String,
});

export const AttachmentRefValue = Schema.Struct({
  byteSize: Schema.Number,
  contentType: Schema.String,
  creationTime: Schema.optional(IsoDateTime),
  sha256: Schema.String,
  storageId: GenericId.GenericId("_storage"),
  title: Schema.optional(Schema.String),
});

export const SourceStampValue = Schema.Struct({
  capturedAt: IsoDateTime,
  importBatchId: Schema.optional(GenericId.GenericId("masterDataPackages")),
  sourceKind: Schema.Literal(
    "manual",
    "egk",
    "kvk",
    "eeb",
    "kim",
    "fhir-import",
    "xdt-import",
    "migration",
  ),
  sourcePath: Schema.optional(Schema.String),
});
