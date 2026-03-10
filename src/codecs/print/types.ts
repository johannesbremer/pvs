export interface PrintFamilyDefinition {
  readonly family: string;
  readonly rendererKind: "blanko-print" | "digital-pdfa" | "mixed";
}
