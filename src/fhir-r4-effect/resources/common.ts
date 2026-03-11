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
  display: Schema.optional(Schema.String),
  reference: Schema.String,
});

export const FhirMeta = Schema.Struct({
  profile: Schema.Array(Schema.String),
});

export const FhirPatientResource = Schema.Struct({
  address: Schema.Array(FhirAddress),
  birthDate: Schema.optional(Schema.String),
  gender: Schema.optional(Schema.String),
  id: Schema.String,
  identifier: Schema.Array(FhirIdentifier),
  meta: Schema.optional(FhirMeta),
  name: Schema.Array(FhirHumanName),
  resourceType: Schema.Literal("Patient"),
  telecom: Schema.Array(FhirContactPoint),
});

export const FhirOrganizationResource = Schema.Struct({
  address: Schema.Array(FhirAddress),
  id: Schema.String,
  identifier: Schema.Array(FhirIdentifier),
  meta: Schema.optional(FhirMeta),
  name: Schema.String,
  resourceType: Schema.Literal("Organization"),
  telecom: Schema.Array(FhirContactPoint),
});

export const FhirPractitionerResource = Schema.Struct({
  id: Schema.String,
  identifier: Schema.Array(FhirIdentifier),
  meta: Schema.optional(FhirMeta),
  name: Schema.Array(FhirHumanName),
  resourceType: Schema.Literal("Practitioner"),
});

export const FhirCoverageResource = Schema.Struct({
  beneficiary: FhirReference,
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  payor: Schema.Array(FhirReference),
  resourceType: Schema.Literal("Coverage"),
  status: Schema.String,
  type: Schema.optional(FhirCodeableConcept),
});

export const FhirCompositionResource = Schema.Struct({
  author: Schema.Array(FhirReference),
  date: Schema.String,
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  resourceType: Schema.Literal("Composition"),
  status: Schema.String,
  subject: FhirReference,
  title: Schema.String,
  type: FhirCodeableConcept,
});

export const FhirMedicationResource = Schema.Struct({
  amount: Schema.optional(
    Schema.Struct({
      unit: Schema.optional(Schema.String),
      value: Schema.Number,
    }),
  ),
  code: Schema.optional(FhirCodeableConcept),
  form: Schema.optional(FhirCodeableConcept),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  resourceType: Schema.Literal("Medication"),
});

export const FhirMedicationRequestResource = Schema.Struct({
  authoredOn: Schema.String,
  dosageInstruction: Schema.Array(
    Schema.Struct({
      text: Schema.optional(Schema.String),
    }),
  ),
  id: Schema.String,
  insurance: Schema.Array(FhirReference),
  intent: Schema.String,
  medicationReference: Schema.optional(FhirReference),
  meta: Schema.optional(FhirMeta),
  requester: Schema.optional(FhirReference),
  resourceType: Schema.Literal("MedicationRequest"),
  status: Schema.String,
  subject: FhirReference,
});

export const FhirDeviceRequestResource = Schema.Struct({
  authoredOn: Schema.String,
  codeCodeableConcept: Schema.optional(FhirCodeableConcept),
  id: Schema.String,
  insurance: Schema.Array(FhirReference),
  intent: Schema.String,
  meta: Schema.optional(FhirMeta),
  reasonCode: Schema.Array(FhirCodeableConcept),
  requester: Schema.optional(FhirReference),
  resourceType: Schema.Literal("DeviceRequest"),
  status: Schema.String,
  subject: FhirReference,
});

export const FhirConditionResource = Schema.Struct({
  code: FhirCodeableConcept,
  encounter: Schema.optional(FhirReference),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  recordedDate: Schema.optional(Schema.String),
  resourceType: Schema.Literal("Condition"),
  subject: FhirReference,
});

export const FhirEncounterResource = Schema.Struct({
  class: Schema.Struct({
    code: Schema.String,
    system: Schema.String,
  }),
  id: Schema.String,
  meta: Schema.optional(FhirMeta),
  period: Schema.Struct({
    end: Schema.optional(Schema.String),
    start: Schema.String,
  }),
  resourceType: Schema.Literal("Encounter"),
  status: Schema.String,
  subject: FhirReference,
});

export const FhirBundleEntry = Schema.Struct({
  fullUrl: Schema.String,
  resource: Schema.Unknown,
});
