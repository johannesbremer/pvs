export interface XdtFamilyDefinition {
  readonly boundaryKind:
    | "emit-only"
    | "import-authoritative"
    | "partially reversible"
    | "reversible";
  readonly family: string;
}
