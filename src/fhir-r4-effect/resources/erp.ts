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
  entry: Schema.Array(FhirBundleEntry),
  identifier: Schema.optional(
    Schema.Struct({
      system: Schema.String,
      value: Schema.String,
    }),
  ),
  resourceType: Schema.Literal("Bundle"),
  timestamp: Schema.String,
  type: Schema.Literal("document"),
});

export const ErpPayload = Schema.Struct({
  bundle: ErpBundleResource,
  composition: FhirCompositionResource,
  coverage: FhirCoverageResource,
  medication: FhirMedicationResource,
  medicationRequest: FhirMedicationRequestResource,
  organization: FhirOrganizationResource,
  patient: FhirPatientResource,
  practitioner: FhirPractitionerResource,
  profileVersion: Schema.String,
});
