import { Schema } from "effect";

import {
  AddressValue,
  CodingValue,
  ContactPointValue,
  HumanNameValue,
  IdentifierValue,
} from "../../../confect/tables/primitives";

export const FhirIdentifier = IdentifierValue;
export const FhirHumanName = HumanNameValue;
export const FhirAddress = AddressValue;
export const FhirContactPoint = ContactPointValue;
export const FhirCoding = CodingValue;
export const FhirCodeableConcept = Schema.Struct({
  coding: Schema.Array(FhirCoding),
  text: Schema.optional(Schema.String),
});

export const FhirReference = Schema.Struct({
  reference: Schema.String,
  display: Schema.optional(Schema.String),
});

export const FhirMeta = Schema.Struct({
  profile: Schema.Array(Schema.String),
});

export const FhirPatientResource = Schema.Struct({
  resourceType: Schema.Literal("Patient"),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  identifier: Schema.Array(FhirIdentifier),
  name: Schema.Array(FhirHumanName),
  birthDate: Schema.optional(Schema.String),
  gender: Schema.optional(Schema.String),
  address: Schema.Array(FhirAddress),
  telecom: Schema.Array(FhirContactPoint),
});

export const FhirOrganizationResource = Schema.Struct({
  resourceType: Schema.Literal("Organization"),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  identifier: Schema.Array(FhirIdentifier),
  name: Schema.String,
  telecom: Schema.Array(FhirContactPoint),
  address: Schema.Array(FhirAddress),
});

export const FhirPractitionerResource = Schema.Struct({
  resourceType: Schema.Literal("Practitioner"),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  identifier: Schema.Array(FhirIdentifier),
  name: Schema.Array(FhirHumanName),
});

export const FhirCoverageResource = Schema.Struct({
  resourceType: Schema.Literal("Coverage"),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  status: Schema.String,
  type: Schema.optional(FhirCodeableConcept),
  beneficiary: FhirReference,
  payor: Schema.Array(FhirReference),
});

export const FhirCompositionResource = Schema.Struct({
  resourceType: Schema.Literal("Composition"),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  status: Schema.String,
  type: FhirCodeableConcept,
  date: Schema.String,
  title: Schema.String,
  subject: FhirReference,
  author: Schema.Array(FhirReference),
});

export const FhirMedicationResource = Schema.Struct({
  resourceType: Schema.Literal("Medication"),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  code: Schema.optional(FhirCodeableConcept),
  form: Schema.optional(FhirCodeableConcept),
  amount: Schema.optional(
    Schema.Struct({
      value: Schema.Number,
      unit: Schema.optional(Schema.String),
    }),
  ),
});

export const FhirMedicationRequestResource = Schema.Struct({
  resourceType: Schema.Literal("MedicationRequest"),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  status: Schema.String,
  intent: Schema.String,
  subject: FhirReference,
  authoredOn: Schema.String,
  requester: Schema.optional(FhirReference),
  insurance: Schema.Array(FhirReference),
  medicationReference: Schema.optional(FhirReference),
  dosageInstruction: Schema.Array(
    Schema.Struct({
      text: Schema.optional(Schema.String),
    }),
  ),
});

export const FhirConditionResource = Schema.Struct({
  resourceType: Schema.Literal("Condition"),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  code: FhirCodeableConcept,
  subject: FhirReference,
  encounter: Schema.optional(FhirReference),
  recordedDate: Schema.optional(Schema.String),
});

export const FhirEncounterResource = Schema.Struct({
  resourceType: Schema.Literal("Encounter"),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  status: Schema.String,
  class: Schema.Struct({
    system: Schema.String,
    code: Schema.String,
  }),
  subject: FhirReference,
  period: Schema.Struct({
    start: Schema.String,
    end: Schema.optional(Schema.String),
  }),
});

export const FhirBundleEntry = Schema.Struct({
  fullUrl: Schema.String,
  resource: Schema.Unknown,
});
