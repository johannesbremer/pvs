import { Schema } from "effect";

import {
  FhirBundleEntry,
  FhirCompositionResource,
  FhirCoverageResource,
  FhirMedicationRequestResource,
  FhirMedicationResource,
  FhirOrganizationResource,
  FhirPatientResource,
  FhirPractitionerResource,
} from "./common";

export const ErpBundleResource = Schema.Struct({
  resourceType: Schema.Literal("Bundle"),
  type: Schema.Literal("document"),
  identifier: Schema.optional(
    Schema.Struct({
      system: Schema.String,
      value: Schema.String,
    }),
  ),
  timestamp: Schema.String,
  entry: Schema.Array(FhirBundleEntry),
});

export const ErpPayload = Schema.Struct({
  profileVersion: Schema.String,
  composition: FhirCompositionResource,
  patient: FhirPatientResource,
  practitioner: FhirPractitionerResource,
  organization: FhirOrganizationResource,
  coverage: FhirCoverageResource,
  medication: FhirMedicationResource,
  medicationRequest: FhirMedicationRequestResource,
  bundle: ErpBundleResource,
});
