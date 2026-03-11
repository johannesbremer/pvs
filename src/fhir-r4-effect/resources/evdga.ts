import { Schema } from "effect";

import {
  FhirBundleEntry,
  FhirCompositionResource,
  FhirCoverageResource,
  FhirDeviceRequestResource,
  FhirOrganizationResource,
  FhirPatientResource,
  FhirPractitionerResource,
} from "./common";

export const EvdgaBundleResource = Schema.Struct({
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

export const EvdgaPayload = Schema.Struct({
  bundle: EvdgaBundleResource,
  composition: FhirCompositionResource,
  coverage: FhirCoverageResource,
  deviceRequest: FhirDeviceRequestResource,
  organization: FhirOrganizationResource,
  patient: FhirPatientResource,
  practitioner: FhirPractitionerResource,
  profileVersion: Schema.String,
});
