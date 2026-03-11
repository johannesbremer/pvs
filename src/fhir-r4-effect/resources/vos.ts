import { Schema } from "effect";

import {
  FhirBundleEntry,
  FhirCoverageResource,
  FhirMedicationRequestResource,
  FhirMedicationResource,
  FhirOrganizationResource,
  FhirPatientResource,
  FhirPractitionerResource,
} from "./common";

export const VosBundleResource = Schema.Struct({
  entry: Schema.Array(FhirBundleEntry),
  id: Schema.String,
  identifier: Schema.Struct({
    system: Schema.String,
    value: Schema.String,
  }),
  resourceType: Schema.Literal("Bundle"),
  timestamp: Schema.String,
  type: Schema.Literal("collection"),
});

export const VosPayload = Schema.Struct({
  bundle: VosBundleResource,
  coverage: FhirCoverageResource,
  medicationRequests: Schema.Array(FhirMedicationRequestResource),
  medications: Schema.Array(FhirMedicationResource),
  organization: FhirOrganizationResource,
  patient: FhirPatientResource,
  practitioner: FhirPractitionerResource,
  profileVersion: Schema.String,
});
