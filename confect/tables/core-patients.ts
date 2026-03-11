import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import {
  AddressValue,
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

export const PatientsFields = Schema.Struct({
  addresses: Schema.Array(AddressValue),
  administrativeGender: Schema.optional(CodingValue),
  birthDate: Schema.optional(IsoDate),
  displayName: Schema.String,
  generalPractitionerRoleId: Schema.optional(
    GenericId.GenericId("practitionerRoles"),
  ),
  managingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  mergedIntoPatientId: Schema.optional(GenericId.GenericId("patients")),
  names: Schema.Array(HumanNameValue),
  preferredLanguages: Schema.Array(CodingValue),
  sourceStamp: SourceStampValue,
  status: Schema.Literal("active", "archived", "merged"),
  telecom: Schema.Array(ContactPointValue),
});

export const Patients = unsafeMakeTable("patients", PatientsFields)
  .index("by_displayName", ["displayName"])
  .index("by_birthDate", ["birthDate"])
  .index("by_generalPractitionerRoleId", ["generalPractitionerRoleId"]);

export const PatientIdentifiersFields = Schema.Struct({
  identifier: IdentifierValue,
  isPrimary: Schema.Boolean,
  patientId: GenericId.GenericId("patients"),
  sourceStamp: SourceStampValue,
  system: Schema.String,
  value: Schema.String,
  verifiedAt: Schema.optional(IsoDateTime),
});

export const PatientIdentifiers = unsafeMakeTable(
  "patientIdentifiers",
  PatientIdentifiersFields,
)
  .index("by_patientId_and_isPrimary", ["patientId", "isPrimary"])
  .index("by_system_and_value", ["system", "value"]);

export const CoveragesFields = Schema.Struct({
  besonderePersonengruppe: Schema.optional(Schema.String),
  costReimbursementFlags: Schema.optional(
    Schema.Struct({
      aerztlicheVersorgung: Schema.optional(Schema.Boolean),
      stationaererBereich: Schema.optional(Schema.Boolean),
      veranlassteLeistungen: Schema.optional(Schema.Boolean),
      zahnaerztlicheVersorgung: Schema.optional(Schema.Boolean),
    }),
  ),
  dmpKennzeichnung: Schema.optional(Schema.String),
  kind: Schema.Literal("gkv", "pkv", "bg", "sozialamt", "self-pay", "other"),
  kostentraegerkennung: Schema.optional(Schema.String),
  kostentraegerName: Schema.optional(Schema.String),
  kvid10: Schema.optional(Schema.String),
  legacyInsuranceNumber: Schema.optional(Schema.String),
  patientId: GenericId.GenericId("patients"),
  payorOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  period: Schema.optional(PeriodValue),
  ruhenderLeistungsanspruch: Schema.optional(CodeableConceptValue),
  sourceStamp: SourceStampValue,
  sourceVsdSnapshotId: Schema.optional(GenericId.GenericId("vsdSnapshots")),
  statusKennzeichen: Schema.optional(Schema.String),
  subscriberPatientId: Schema.optional(GenericId.GenericId("patients")),
  versichertenart: Schema.optional(Schema.String),
});

export const Coverages = unsafeMakeTable("coverages", CoveragesFields)
  .index("by_patientId", ["patientId"])
  .index("by_kvid10", ["kvid10"])
  .index("by_kostentraegerkennung", ["kostentraegerkennung"]);

export const VsdSnapshotsFields = Schema.Struct({
  coveragePayload: Schema.Struct({
    geburtsdatum3103: Schema.optional(Schema.String),
    geschlecht3110: Schema.optional(Schema.String),
    kostentraegerkennung4133: Schema.optional(Schema.String),
    kostentraegername4134: Schema.optional(Schema.String),
    ort3113: Schema.optional(Schema.String),
    plz3112: Schema.optional(Schema.String),
    strasse3107: Schema.optional(Schema.String),
    versichertenart3108: Schema.optional(Schema.String),
    versichertenId3119: Schema.optional(Schema.String),
    versichertennummer3105: Schema.optional(Schema.String),
    versicherungsschutzEnde3116: Schema.optional(Schema.String),
  }),
  onlineCheckErrorCode3012: Schema.optional(Schema.String),
  onlineCheckPruefziffer3013: Schema.optional(Schema.String),
  onlineCheckResult3011: Schema.optional(Schema.String),
  onlineCheckTimestamp3010: Schema.optional(IsoDateTime),
  patientId: Schema.optional(GenericId.GenericId("patients")),
  rawArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  readAt: IsoDateTime,
  readSource: Schema.Literal("egk", "kvk", "eeb"),
  schemaVersion3006: Schema.optional(Schema.String),
  versichertenId3119: Schema.optional(Schema.String),
});

export const VsdSnapshots = unsafeMakeTable("vsdSnapshots", VsdSnapshotsFields)
  .index("by_patientId_and_readAt", ["patientId", "readAt"])
  .index("by_readSource_and_readAt", ["readSource", "readAt"])
  .index("by_versichertenId3119", ["versichertenId3119"]);

export const EebInboxItemsFields = Schema.Struct({
  adoptedVsdSnapshotId: Schema.optional(GenericId.GenericId("vsdSnapshots")),
  adoptionState: Schema.Literal("pending", "accepted", "rejected"),
  kimMailboxId: GenericId.GenericId("kimMailboxes"),
  kimMessageId: Schema.String,
  matchedCoverageId: Schema.optional(GenericId.GenericId("coverages")),
  matchedPatientId: Schema.optional(GenericId.GenericId("patients")),
  matchState: Schema.Literal(
    "unmatched",
    "matched-existing",
    "new-patient",
    "manual-review",
  ),
  payloadArtifactId: GenericId.GenericId("artifacts"),
  receivedAt: IsoDateTime,
  senderDisplay: Schema.optional(Schema.String),
  senderVerified: Schema.Boolean,
  serviceIdentifier: Schema.String,
});

export const EebInboxItems = unsafeMakeTable(
  "eebInboxItems",
  EebInboxItemsFields,
)
  .index("by_kimMessageId", ["kimMessageId"])
  .index("by_matchState_and_receivedAt", ["matchState", "receivedAt"])
  .index("by_matchedPatientId", ["matchedPatientId"]);
