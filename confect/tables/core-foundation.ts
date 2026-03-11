import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import {
  AddressValue,
  AttachmentRefValue,
  CodeableConceptValue,
  CodingValue,
  ContactPointValue,
  HumanNameValue,
  IdentifierValue,
  IsoDate,
  IsoDateTime,
  PeriodValue,
  SourceStampValue,
} from "./primitives";

export const InterfaceProfilesFields = Schema.Struct({
  artifactFamily: Schema.Literal(
    "FOR",
    "ERP",
    "EVDGA",
    "EAU",
    "VoS",
    "KVDT",
    "TSS",
    "AW",
    "Heilmittel",
    "BFB",
  ),
  effectiveFrom: IsoDate,
  effectiveTo: Schema.optional(IsoDate),
  exampleDataPath: Schema.optional(Schema.String),
  packagePath: Schema.String,
  profileVersion: Schema.String,
  status: Schema.Literal("active", "planned", "retired"),
  transportKind: Schema.Literal(
    "fhir-rest",
    "fhir-bundle-xml",
    "xdt",
    "kim",
    "pdfa",
    "print",
    "bmp-xml",
  ),
  validatorPackagePath: Schema.optional(Schema.String),
});

export const InterfaceProfiles = unsafeMakeTable(
  "interfaceProfiles",
  InterfaceProfilesFields,
)
  .index("by_artifactFamily_and_effectiveFrom", [
    "artifactFamily",
    "effectiveFrom",
  ])
  .index("by_artifactFamily_and_profileVersion", [
    "artifactFamily",
    "profileVersion",
  ]);

export const MasterDataPackagesFields = Schema.Struct({
  artifact: AttachmentRefValue,
  effectiveFrom: Schema.optional(IsoDate),
  effectiveTo: Schema.optional(IsoDate),
  family: Schema.Literal(
    "SDICD",
    "SDKH",
    "SDKRW",
    "SDKT",
    "SDHM",
    "SDHMA",
    "AMDB",
    "ARV",
    "DIGA",
    "BMP",
    "BFB_TEMPLATE",
    "SDKVCA",
    "SDVA",
  ),
  importedAt: IsoDateTime,
  sourcePath: Schema.String,
  status: Schema.Literal("active", "superseded", "failed"),
  version: Schema.String,
});

export const MasterDataPackages = unsafeMakeTable(
  "masterDataPackages",
  MasterDataPackagesFields,
)
  .index("by_family_and_version", ["family", "version"])
  .index("by_family_and_effectiveFrom", ["family", "effectiveFrom"]);

export const OrganizationsFields = Schema.Struct({
  active: Schema.Boolean,
  addresses: Schema.Array(AddressValue),
  bsnr: Schema.optional(Schema.String),
  identifiers: Schema.Array(IdentifierValue),
  iknr: Schema.optional(Schema.String),
  kind: Schema.Literal("practice", "hospital", "payor", "bg", "kv", "other"),
  name: Schema.String,
  nbsnr: Schema.optional(Schema.String),
  parentOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  sourceStamp: SourceStampValue,
  telecom: Schema.Array(ContactPointValue),
  telematikId: Schema.optional(Schema.String),
});

export const Organizations = unsafeMakeTable(
  "organizations",
  OrganizationsFields,
)
  .index("by_bsnr", ["bsnr"])
  .index("by_iknr", ["iknr"])
  .index("by_telematikId", ["telematikId"])
  .index("by_kind_and_name", ["kind", "name"]);

export const PracticeLocationsFields = Schema.Struct({
  address: AddressValue,
  asvTeamNumber: Schema.optional(Schema.String),
  bsnrOrNbsnr: Schema.String,
  isDefault: Schema.Boolean,
  name: Schema.optional(Schema.String),
  organizationId: GenericId.GenericId("organizations"),
  sourceStamp: SourceStampValue,
  telecom: Schema.Array(ContactPointValue),
});

export const PracticeLocations = unsafeMakeTable(
  "practiceLocations",
  PracticeLocationsFields,
)
  .index("by_organizationId", ["organizationId"])
  .index("by_bsnrOrNbsnr", ["bsnrOrNbsnr"])
  .index("by_asvTeamNumber", ["asvTeamNumber"]);

export const PractitionersFields = Schema.Struct({
  active: Schema.Boolean,
  displayName: Schema.String,
  lanr: Schema.optional(Schema.String),
  names: Schema.Array(HumanNameValue),
  nameSortKey: Schema.String,
  qualifications: Schema.Array(CodeableConceptValue),
  sourceStamp: SourceStampValue,
  telematikId: Schema.optional(Schema.String),
  zanr: Schema.optional(Schema.String),
});

export const Practitioners = unsafeMakeTable(
  "practitioners",
  PractitionersFields,
)
  .index("by_lanr", ["lanr"])
  .index("by_telematikId", ["telematikId"])
  .index("by_nameSortKey", ["nameSortKey"]);

export const PractitionerRolesFields = Schema.Struct({
  asvTeamNumber: Schema.optional(Schema.String),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  organizationId: GenericId.GenericId("organizations"),
  period: Schema.optional(PeriodValue),
  practitionerId: GenericId.GenericId("practitioners"),
  roleCodes: Schema.Array(CodingValue),
  sourceStamp: SourceStampValue,
  specialtyCodes: Schema.Array(CodingValue),
});

export const PractitionerRoles = unsafeMakeTable(
  "practitionerRoles",
  PractitionerRolesFields,
)
  .index("by_practitionerId_and_organizationId", [
    "practitionerId",
    "organizationId",
  ])
  .index("by_asvTeamNumber", ["asvTeamNumber"])
  .index("by_locationId", ["locationId"]);

export const TiIdentitiesFields = Schema.Struct({
  certificateSerial: Schema.optional(Schema.String),
  directoryEntryId: Schema.optional(Schema.String),
  display: Schema.String,
  holderId: Schema.String,
  holderKind: Schema.Literal("organization", "practitioner"),
  identityType: Schema.Literal("smc-b", "hsm-b", "ehba", "telematik-id"),
  status: Schema.Literal("active", "inactive", "expired", "revoked"),
  validFrom: Schema.optional(IsoDate),
  validTo: Schema.optional(IsoDate),
});

export const TiIdentities = unsafeMakeTable("tiIdentities", TiIdentitiesFields)
  .index("by_holderKind_and_holderId", ["holderKind", "holderId"])
  .index("by_identityType_and_status", ["identityType", "status"])
  .index("by_directoryEntryId", ["directoryEntryId"]);

export const KimMailboxesFields = Schema.Struct({
  address: Schema.String,
  identityId: Schema.optional(GenericId.GenericId("tiIdentities")),
  identityPreference: Schema.optional(Schema.Literal("auto", "smc-b", "ehba")),
  isDefaultInbound: Schema.Boolean,
  ownerId: Schema.String,
  ownerKind: Schema.Literal("organization", "practitioner"),
  pollingIntervalMinutes: Schema.optional(Schema.Number),
  pollingMode: Schema.optional(
    Schema.Literal("manual", "scheduled", "event-driven"),
  ),
  serviceTags: Schema.Array(Schema.String),
  status: Schema.Literal("active", "inactive"),
});

export const KimMailboxes = unsafeMakeTable("kimMailboxes", KimMailboxesFields)
  .index("by_address", ["address"])
  .index("by_ownerKind_and_ownerId", ["ownerKind", "ownerId"]);
