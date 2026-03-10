import { GenericId } from "@confect/core";
import { Schema } from "effect";

export const IsoDate = Schema.String;
export const IsoDateTime = Schema.String;
export const NonEmptyString = Schema.String;

export const CodingValue = Schema.Struct({
  system: Schema.String,
  code: Schema.String,
  display: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  userSelected: Schema.optional(Schema.Boolean),
});

export const PeriodValue = Schema.Struct({
  start: Schema.optional(IsoDateTime),
  end: Schema.optional(IsoDateTime),
});

export const CodeableConceptValue = Schema.Struct({
  coding: Schema.Array(CodingValue),
  text: Schema.optional(Schema.String),
});

export const IdentifierValue = Schema.Struct({
  system: Schema.String,
  value: Schema.String,
  type: Schema.optional(CodingValue),
  use: Schema.optional(
    Schema.Literal("usual", "official", "temp", "secondary", "old"),
  ),
  assignerDisplay: Schema.optional(Schema.String),
  period: Schema.optional(PeriodValue),
});

export const HumanNameValue = Schema.Struct({
  use: Schema.optional(Schema.Literal("official", "usual", "maiden", "old")),
  family: Schema.String,
  ownName: Schema.optional(Schema.String),
  nameAddition: Schema.optional(Schema.String),
  prefixes: Schema.Array(Schema.String),
  given: Schema.Array(Schema.String),
});

export const AddressValue = Schema.Struct({
  type: Schema.optional(Schema.Literal("physical", "postal", "both")),
  line1: Schema.String,
  line2: Schema.optional(Schema.String),
  streetName: Schema.optional(Schema.String),
  houseNumber: Schema.optional(Schema.String),
  additionalLocator: Schema.optional(Schema.String),
  postBox: Schema.optional(Schema.String),
  postalCode: Schema.optional(Schema.String),
  city: Schema.optional(Schema.String),
  country: Schema.optional(Schema.String),
});

export const ContactPointValue = Schema.Struct({
  system: Schema.Literal("phone", "fax", "email", "url", "other"),
  value: Schema.String,
  use: Schema.optional(Schema.Literal("work", "home", "mobile", "temp")),
});

export const QuantityValue = Schema.Struct({
  value: Schema.Number,
  unit: Schema.optional(Schema.String),
  system: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
});

export const ReferenceValue = Schema.Struct({
  table: Schema.String,
  id: Schema.String,
  display: Schema.optional(Schema.String),
});

export const AttachmentRefValue = Schema.Struct({
  storageId: GenericId.GenericId("_storage"),
  contentType: Schema.String,
  byteSize: Schema.Number,
  sha256: Schema.String,
  title: Schema.optional(Schema.String),
  creationTime: Schema.optional(IsoDateTime),
});

export const SourceStampValue = Schema.Struct({
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
  importBatchId: Schema.optional(GenericId.GenericId("masterDataPackages")),
  capturedAt: IsoDateTime,
});
