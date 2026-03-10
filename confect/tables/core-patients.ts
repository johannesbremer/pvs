import { GenericId } from "@confect/core";
import { Schema } from "effect";

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
import { unsafeMakeTable } from "./makeTable";

export const PatientsFields = Schema.Struct({
  status: Schema.Literal("active", "archived", "merged"),
  displayName: Schema.String,
  names: Schema.Array(HumanNameValue),
  birthDate: Schema.optional(IsoDate),
  administrativeGender: Schema.optional(CodingValue),
  addresses: Schema.Array(AddressValue),
  telecom: Schema.Array(ContactPointValue),
  generalPractitionerRoleId: Schema.optional(
    GenericId.GenericId("practitionerRoles"),
  ),
  managingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  preferredLanguages: Schema.Array(CodingValue),
  mergedIntoPatientId: Schema.optional(GenericId.GenericId("patients")),
  sourceStamp: SourceStampValue,
});

export const Patients = unsafeMakeTable("patients", PatientsFields)
  .index("by_displayName", ["displayName"])
  .index("by_birthDate", ["birthDate"])
  .index("by_generalPractitionerRoleId", ["generalPractitionerRoleId"]);

export const PatientIdentifiersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  system: Schema.String,
  value: Schema.String,
  identifier: IdentifierValue,
  isPrimary: Schema.Boolean,
  sourceStamp: SourceStampValue,
  verifiedAt: Schema.optional(IsoDateTime),
});

export const PatientIdentifiers = unsafeMakeTable(
  "patientIdentifiers",
  PatientIdentifiersFields,
)
  .index("by_patientId_and_isPrimary", ["patientId", "isPrimary"])
  .index("by_system_and_value", ["system", "value"]);

export const CoveragesFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  subscriberPatientId: Schema.optional(GenericId.GenericId("patients")),
  payorOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  kind: Schema.Literal("gkv", "pkv", "bg", "sozialamt", "self-pay", "other"),
  kvid10: Schema.optional(Schema.String),
  legacyInsuranceNumber: Schema.optional(Schema.String),
  kostentraegerkennung: Schema.optional(Schema.String),
  kostentraegerName: Schema.optional(Schema.String),
  versichertenart: Schema.optional(Schema.String),
  besonderePersonengruppe: Schema.optional(Schema.String),
  dmpKennzeichnung: Schema.optional(Schema.String),
  statusKennzeichen: Schema.optional(Schema.String),
  ruhenderLeistungsanspruch: Schema.optional(CodeableConceptValue),
  costReimbursementFlags: Schema.optional(
    Schema.Struct({
      aerztlicheVersorgung: Schema.optional(Schema.Boolean),
      zahnaerztlicheVersorgung: Schema.optional(Schema.Boolean),
      stationaererBereich: Schema.optional(Schema.Boolean),
      veranlassteLeistungen: Schema.optional(Schema.Boolean),
    }),
  ),
  period: Schema.optional(PeriodValue),
  sourceVsdSnapshotId: Schema.optional(GenericId.GenericId("vsdSnapshots")),
  sourceStamp: SourceStampValue,
});

export const Coverages = unsafeMakeTable("coverages", CoveragesFields)
  .index("by_patientId", ["patientId"])
  .index("by_kvid10", ["kvid10"])
  .index("by_kostentraegerkennung", ["kostentraegerkennung"]);

export const VsdSnapshotsFields = Schema.Struct({
  patientId: Schema.optional(GenericId.GenericId("patients")),
  readSource: Schema.Literal("egk", "kvk", "eeb"),
  schemaVersion3006: Schema.optional(Schema.String),
  readAt: IsoDateTime,
  onlineCheckTimestamp3010: Schema.optional(IsoDateTime),
  onlineCheckResult3011: Schema.optional(Schema.String),
  onlineCheckErrorCode3012: Schema.optional(Schema.String),
  onlineCheckPruefziffer3013: Schema.optional(Schema.String),
  versichertenId3119: Schema.optional(Schema.String),
  coveragePayload: Schema.Struct({
    versichertenId3119: Schema.optional(Schema.String),
    versichertennummer3105: Schema.optional(Schema.String),
    versichertenart3108: Schema.optional(Schema.String),
    geschlecht3110: Schema.optional(Schema.String),
    geburtsdatum3103: Schema.optional(Schema.String),
    strasse3107: Schema.optional(Schema.String),
    plz3112: Schema.optional(Schema.String),
    ort3113: Schema.optional(Schema.String),
    versicherungsschutzEnde3116: Schema.optional(Schema.String),
    kostentraegerkennung4133: Schema.optional(Schema.String),
    kostentraegername4134: Schema.optional(Schema.String),
  }),
  rawArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
});

export const VsdSnapshots = unsafeMakeTable("vsdSnapshots", VsdSnapshotsFields)
  .index("by_patientId_and_readAt", ["patientId", "readAt"])
  .index("by_readSource_and_readAt", ["readSource", "readAt"])
  .index("by_versichertenId3119", ["versichertenId3119"]);

export const EebInboxItemsFields = Schema.Struct({
  kimMessageId: Schema.String,
  kimMailboxId: GenericId.GenericId("kimMailboxes"),
  serviceIdentifier: Schema.String,
  senderDisplay: Schema.optional(Schema.String),
  senderVerified: Schema.Boolean,
  receivedAt: IsoDateTime,
  payloadArtifactId: GenericId.GenericId("artifacts"),
  matchedPatientId: Schema.optional(GenericId.GenericId("patients")),
  matchedCoverageId: Schema.optional(GenericId.GenericId("coverages")),
  matchState: Schema.Literal(
    "unmatched",
    "matched-existing",
    "new-patient",
    "manual-review",
  ),
  adoptionState: Schema.Literal("pending", "accepted", "rejected"),
  adoptedVsdSnapshotId: Schema.optional(GenericId.GenericId("vsdSnapshots")),
});

export const EebInboxItems = unsafeMakeTable("eebInboxItems", EebInboxItemsFields)
  .index("by_kimMessageId", ["kimMessageId"])
  .index("by_matchState_and_receivedAt", ["matchState", "receivedAt"])
  .index("by_matchedPatientId", ["matchedPatientId"]);
