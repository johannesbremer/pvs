export type XmlBoundaryKind =
  | "reversible"
  | "partially reversible"
  | "emit-only"
  | "import-authoritative";

export interface XmlFamilyDefinition {
  readonly family: string;
  readonly encoding: string;
  readonly boundaryKind: XmlBoundaryKind;
}
