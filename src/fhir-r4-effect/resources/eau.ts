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

export const EauPayload = Schema.Struct({
  bundle: EauBundleResource,
  composition: FhirCompositionResource,
  conditions: Schema.Array(FhirConditionResource),
  coverage: FhirCoverageResource,
  encounter: FhirEncounterResource,
  organization: FhirOrganizationResource,
  patient: FhirPatientResource,
  practitioner: FhirPractitionerResource,
  profileVersion: Schema.String,
});
