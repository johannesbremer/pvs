export const plannedFhirResources = [
  "Patient",
  "Organization",
  "Practitioner",
  "PractitionerRole",
  "Coverage",
  "Composition",
  "Medication",
  "MedicationRequest",
  "DeviceRequest",
] as const;

export * from "./common";
export * from "./eau";
export * from "./erp";
export * from "./evdga";
