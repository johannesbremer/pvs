import { GenericId } from "@confect/core";
import { Schema } from "effect";

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
import { unsafeMakeTable } from "./makeTable";

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
  profileVersion: Schema.String,
  effectiveFrom: IsoDate,
  effectiveTo: Schema.optional(IsoDate),
  transportKind: Schema.Literal(
    "fhir-rest",
    "fhir-bundle-xml",
    "xdt",
    "kim",
    "pdfa",
    "print",
    "bmp-xml",
  ),
  packagePath: Schema.String,
  validatorPackagePath: Schema.optional(Schema.String),
  exampleDataPath: Schema.optional(Schema.String),
  status: Schema.Literal("active", "planned", "retired"),
});

export const InterfaceProfiles = unsafeMakeTable(
  "interfaceProfiles",
  InterfaceProfilesFields,
)
  .index("by_artifactFamily_and_effectiveFrom", ["artifactFamily", "effectiveFrom"])
  .index("by_artifactFamily_and_profileVersion", ["artifactFamily", "profileVersion"]);

export const MasterDataPackagesFields = Schema.Struct({
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
  version: Schema.String,
  effectiveFrom: Schema.optional(IsoDate),
  effectiveTo: Schema.optional(IsoDate),
  sourcePath: Schema.String,
  artifact: AttachmentRefValue,
  importedAt: IsoDateTime,
  status: Schema.Literal("active", "superseded", "failed"),
});

export const MasterDataPackages = unsafeMakeTable(
  "masterDataPackages",
  MasterDataPackagesFields,
)
  .index("by_family_and_version", ["family", "version"])
  .index("by_family_and_effectiveFrom", ["family", "effectiveFrom"]);

export const OrganizationsFields = Schema.Struct({
  active: Schema.Boolean,
  kind: Schema.Literal("practice", "hospital", "payor", "bg", "kv", "other"),
  name: Schema.String,
  identifiers: Schema.Array(IdentifierValue),
  bsnr: Schema.optional(Schema.String),
  nbsnr: Schema.optional(Schema.String),
  iknr: Schema.optional(Schema.String),
  telematikId: Schema.optional(Schema.String),
  addresses: Schema.Array(AddressValue),
  telecom: Schema.Array(ContactPointValue),
  parentOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  sourceStamp: SourceStampValue,
});

export const Organizations = unsafeMakeTable("organizations", OrganizationsFields)
  .index("by_bsnr", ["bsnr"])
  .index("by_iknr", ["iknr"])
  .index("by_telematikId", ["telematikId"])
  .index("by_kind_and_name", ["kind", "name"]);

export const PracticeLocationsFields = Schema.Struct({
  organizationId: GenericId.GenericId("organizations"),
  name: Schema.optional(Schema.String),
  bsnrOrNbsnr: Schema.String,
  asvTeamNumber: Schema.optional(Schema.String),
  address: AddressValue,
  telecom: Schema.Array(ContactPointValue),
  isDefault: Schema.Boolean,
  sourceStamp: SourceStampValue,
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
  nameSortKey: Schema.String,
  names: Schema.Array(HumanNameValue),
  lanr: Schema.optional(Schema.String),
  zanr: Schema.optional(Schema.String),
  telematikId: Schema.optional(Schema.String),
  qualifications: Schema.Array(CodeableConceptValue),
  sourceStamp: SourceStampValue,
});

export const Practitioners = unsafeMakeTable("practitioners", PractitionersFields)
  .index("by_lanr", ["lanr"])
  .index("by_telematikId", ["telematikId"])
  .index("by_nameSortKey", ["nameSortKey"]);

export const PractitionerRolesFields = Schema.Struct({
  practitionerId: GenericId.GenericId("practitioners"),
  organizationId: GenericId.GenericId("organizations"),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  roleCodes: Schema.Array(CodingValue),
  specialtyCodes: Schema.Array(CodingValue),
  asvTeamNumber: Schema.optional(Schema.String),
  period: Schema.optional(PeriodValue),
  sourceStamp: SourceStampValue,
});

export const PractitionerRoles = unsafeMakeTable(
  "practitionerRoles",
  PractitionerRolesFields,
)
  .index("by_practitionerId_and_organizationId", ["practitionerId", "organizationId"])
  .index("by_asvTeamNumber", ["asvTeamNumber"])
  .index("by_locationId", ["locationId"]);

export const TiIdentitiesFields = Schema.Struct({
  holderKind: Schema.Literal("organization", "practitioner"),
  holderId: Schema.String,
  identityType: Schema.Literal("smc-b", "hsm-b", "ehba", "telematik-id"),
  display: Schema.String,
  directoryEntryId: Schema.optional(Schema.String),
  certificateSerial: Schema.optional(Schema.String),
  validFrom: Schema.optional(IsoDate),
  validTo: Schema.optional(IsoDate),
  status: Schema.Literal("active", "inactive", "expired", "revoked"),
});

export const TiIdentities = unsafeMakeTable("tiIdentities", TiIdentitiesFields)
  .index("by_holderKind_and_holderId", ["holderKind", "holderId"])
  .index("by_identityType_and_status", ["identityType", "status"])
  .index("by_directoryEntryId", ["directoryEntryId"]);

export const KimMailboxesFields = Schema.Struct({
  ownerKind: Schema.Literal("organization", "practitioner"),
  ownerId: Schema.String,
  address: Schema.String,
  identityId: Schema.optional(GenericId.GenericId("tiIdentities")),
  isDefaultInbound: Schema.Boolean,
  identityPreference: Schema.optional(
    Schema.Literal("auto", "smc-b", "ehba"),
  ),
  pollingMode: Schema.optional(
    Schema.Literal("manual", "scheduled", "event-driven"),
  ),
  pollingIntervalMinutes: Schema.optional(Schema.Number),
  serviceTags: Schema.Array(Schema.String),
  status: Schema.Literal("active", "inactive"),
});

export const KimMailboxes = unsafeMakeTable("kimMailboxes", KimMailboxesFields)
  .index("by_address", ["address"])
  .index("by_ownerKind_and_ownerId", ["ownerKind", "ownerId"]);
