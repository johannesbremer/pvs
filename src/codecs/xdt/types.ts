export interface XdtFamilyDefinition {
  readonly family: string;
  readonly boundaryKind:
    | "reversible"
    | "partially reversible"
    | "emit-only"
    | "import-authoritative";
}
