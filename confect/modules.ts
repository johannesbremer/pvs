export const publicConfectModules = [
  "patients",
  "coverages",
  "vsd",
  "billing",
  "coding",
  "appointments",
  "referrals",
  "prescriptions",
  "heilmittel",
  "documents",
  "drafts",
  "catalog",
  "integration",
] as const;

export const internalConfectModules = [
  "integration.profileRegistry",
  "integration.fhir",
  "integration.kvdt",
  "integration.kim",
  "integration.tss",
  "integration.validation",
  "views",
] as const;
