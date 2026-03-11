import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  CoveragesFields,
  PatientIdentifiersFields,
  PatientsFields,
  VsdSnapshotsFields,
} from "../../confect/tables/core";
import {
  AddressValue,
  CodingValue,
  ContactPointValue,
  HumanNameValue,
  IdentifierValue,
  IsoDate,
  IsoDateTime,
} from "../../confect/tables/primitives";
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
  addresses: Schema.Array(AddressValue),
  administrativeGender: Schema.optional(CodingValue),
  birthDate: Schema.optional(IsoDate),
  capturedAt: IsoDateTime,
  displayName: Schema.optional(Schema.String),
  generalPractitionerRoleId: Schema.optional(
    GenericId.GenericId("practitionerRoles"),
  ),
  managingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  names: Schema.Array(HumanNameValue),
  preferredLanguages: Schema.Array(CodingValue),
  sourcePath: Schema.optional(Schema.String),
  telecom: Schema.Array(ContactPointValue),
});

export const CreateManualPatientArgs = Schema.Struct({
  patient: ManualPatientSeedFields,
  primaryIdentifier: Schema.optional(IdentifierValue),
});

export const CreateManualPatientResult = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  primaryIdentifierId: Schema.optional(
    GenericId.GenericId("patientIdentifiers"),
  ),
});

export const PatientChartArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
});

export const PatientChartFound = Schema.Struct({
  coverages: Schema.Array(CoverageDocument),
  found: Schema.Literal(true),
  identifiers: Schema.Array(PatientIdentifierDocument),
  patient: PatientDocument,
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
  existingPatientId: Schema.optional(GenericId.GenericId("patients")),
  patientSeed: Schema.optional(ManualPatientSeedFields),
  snapshotId: GenericId.GenericId("vsdSnapshots"),
});

export const AdoptVsdSnapshotAdopted = Schema.Struct({
  coverageCreated: Schema.Boolean,
  coverageId: GenericId.GenericId("coverages"),
  outcome: Schema.Literal("adopted"),
  patientCreated: Schema.Boolean,
  patientId: GenericId.GenericId("patients"),
  patientIdentifierId: Schema.optional(
    GenericId.GenericId("patientIdentifiers"),
  ),
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
