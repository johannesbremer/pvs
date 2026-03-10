import { Schema } from "effect";

import {
  FhirBundleEntry,
  FhirCompositionResource,
  FhirConditionResource,
  FhirCoverageResource,
  FhirEncounterResource,
  FhirOrganizationResource,
  FhirPatientResource,
  FhirPractitionerResource,
} from "./common";

export const EauBundleResource = Schema.Struct({
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

export const EauPayload = Schema.Struct({
  profileVersion: Schema.String,
  composition: FhirCompositionResource,
  patient: FhirPatientResource,
  practitioner: FhirPractitionerResource,
  organization: FhirOrganizationResource,
  coverage: FhirCoverageResource,
  encounter: FhirEncounterResource,
  conditions: Schema.Array(FhirConditionResource),
  bundle: EauBundleResource,
});
