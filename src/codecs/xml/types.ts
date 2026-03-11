export type XmlBoundaryKind =
  | "emit-only"
  | "import-authoritative"
  | "partially reversible"
  | "reversible";

export interface XmlFamilyDefinition {
  readonly boundaryKind: XmlBoundaryKind;
  readonly encoding: string;
  readonly family: string;
}
