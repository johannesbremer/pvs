import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  AddressValue,
  CodingValue,
  ContactPointValue,
  HumanNameValue,
  IdentifierValue,
  IsoDate,
  IsoDateTime,
} from "../../confect/tables/primitives";
import {
  CoveragesFields,
  PatientIdentifiersFields,
  PatientsFields,
  VsdSnapshotsFields,
} from "../../confect/tables/core";
import { withSystemFields } from "./shared";

export const PatientDocument = withSystemFields("patients", PatientsFields);
export const PatientIdentifierDocument = withSystemFields(
  "patientIdentifiers",
  PatientIdentifiersFields,
);
export const CoverageDocument = withSystemFields("coverages", CoveragesFields);
export const VsdSnapshotDocument = withSystemFields(
  "vsdSnapshots",
  VsdSnapshotsFields,
);

export const PatientIdentifierSystem = {
  Kvid10: "https://gematik.de/fhir/sid/kvk/kvid-10",
  LegacyInsuranceNumber: "urn:kbv:kvdt:versichertennummer-3105",
} as const;

export const ManualPatientSeedFields = Schema.Struct({
  displayName: Schema.optional(Schema.String),
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
  sourcePath: Schema.optional(Schema.String),
  capturedAt: IsoDateTime,
});

export const CreateManualPatientArgs = Schema.Struct({
  patient: ManualPatientSeedFields,
  primaryIdentifier: Schema.optional(IdentifierValue),
});

export const CreateManualPatientResult = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  primaryIdentifierId: Schema.optional(GenericId.GenericId("patientIdentifiers")),
});

export const PatientChartArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
});

export const PatientChartFound = Schema.Struct({
  found: Schema.Literal(true),
  patient: PatientDocument,
  identifiers: Schema.Array(PatientIdentifierDocument),
  coverages: Schema.Array(CoverageDocument),
});

export const PatientChartMissing = Schema.Struct({
  found: Schema.Literal(false),
});

export const PatientChartResult = Schema.Union(
  PatientChartFound,
  PatientChartMissing,
);

export const ListCoveragesArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
});

export const ListCoveragesResult = Schema.Array(CoverageDocument);

export const RecordVsdSnapshotArgs = VsdSnapshotsFields;

export const RecordVsdSnapshotResult = Schema.Struct({
  snapshotId: GenericId.GenericId("vsdSnapshots"),
});

export const GetVsdSnapshotArgs = Schema.Struct({
  snapshotId: GenericId.GenericId("vsdSnapshots"),
});

export const GetVsdSnapshotFound = Schema.Struct({
  found: Schema.Literal(true),
  snapshot: VsdSnapshotDocument,
});

export const GetVsdSnapshotMissing = Schema.Struct({
  found: Schema.Literal(false),
});

export const GetVsdSnapshotResult = Schema.Union(
  GetVsdSnapshotFound,
  GetVsdSnapshotMissing,
);

export const AdoptVsdSnapshotArgs = Schema.Struct({
  snapshotId: GenericId.GenericId("vsdSnapshots"),
  existingPatientId: Schema.optional(GenericId.GenericId("patients")),
  patientSeed: Schema.optional(ManualPatientSeedFields),
});

export const AdoptVsdSnapshotAdopted = Schema.Struct({
  outcome: Schema.Literal("adopted"),
  patientId: GenericId.GenericId("patients"),
  coverageId: GenericId.GenericId("coverages"),
  patientIdentifierId: Schema.optional(GenericId.GenericId("patientIdentifiers")),
  patientCreated: Schema.Boolean,
  coverageCreated: Schema.Boolean,
});

export const AdoptVsdSnapshotNeedsSeed = Schema.Struct({
  outcome: Schema.Literal("needs-patient-seed"),
});

export const AdoptVsdSnapshotMissing = Schema.Struct({
  outcome: Schema.Literal("snapshot-not-found"),
});

export const AdoptVsdSnapshotResult = Schema.Union(
  AdoptVsdSnapshotAdopted,
  AdoptVsdSnapshotNeedsSeed,
  AdoptVsdSnapshotMissing,
);
