export const canonicalDomainLayers = [
  "persistence",
  "functions",
  "ui-dtos",
  "integration-dtos",
  "artifacts",
] as const;

export const integrationBoundaries = [
  "reversible",
  "partially reversible",
  "emit-only",
  "import-authoritative",
] as const;
