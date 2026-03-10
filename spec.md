# Specification: Confect-Based KBV-Aligned PVS

## 1. Goal

This document is the implementation specification for a Praxisverwaltungssystem (PVS) built on:

- `Confect` as the application and schema layer
- `Effect Schema` as the only schema language for persistence, functions, codecs, and generators
- `Convex` as the storage/runtime platform underneath Confect
- `TypeScript` end to end
- `TanStack Form` for typed UI forms
- `fast-check` for schema laws, domain invariants, and oracle-backed property tests

This is the first believable path toward a certifiable PVS based on the official KBV material in this repository.

This document is intentionally Confect-first:

- persistence schemas are authored in `confect/schema.ts`
- tables are declared with `Table.make(...)`
- the database is assembled with `DatabaseSchema.make().addTable(...)`
- IDs are modeled with `GenericId.GenericId("table")`
- function args and returns are modeled with the same `Effect Schema` values that back persistence
- FHIR, XML, xDT, and print DTOs are separate codecs layered on top of the canonical Confect model

`@solarahealth/fhir-r4` is not the runtime validator in this architecture. It is reference material only. The runtime FHIR layer is custom `Effect Schema`, derived from official HL7 R4 plus KBV profile artifacts in this repo.

## 2. Normative Source Map

Treat the following repo files as the primary sources for this spec. All table sections later in this document repeat the specific source paths that justify their fields.

### 2.1 Core patient, insured, billing, and coding sources

- `Abrechnung/KBV_ITA_VGEX_Mapping_KVK.pdf.md`
- `Service-Informationen/Feldkatalog/KBV_ITA_SIEX_Feld_und_Regelkatalog.pdf.md`
- `Abrechnung/KBV_ITA_VGEX_Datensatzbeschreibung_KVDT.pdf.md`
- `Abrechnung/KBV_ITA_VGEX_Anforderungskatalog_KVDT.pdf.md`
- `Abrechnung/KBV_ITA_VGEX_Anforderungskatalog_ICD-10.pdf.md`
- `Stammdateien/SDICD/SDICD_V2.4.0.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDICD.pdf.md`
- `Stammdateien/SDKH/SDKH_V1.01.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDKH.pdf.md`
- `Stammdateien/SDKRW/SDKRW_V1.40.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDKRW.pdf.md`
- `Stammdateien/SDKT/SDKT_V1.05.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDKT.pdf.md`
- `Abrechnung/eEB/KBV_ITA_VGEX_Technische_Anlage_eEB.pdf.md`

### 2.2 Prescribing, FHIR, and digital forms sources

- `371-Schnittstellen/Verordnungssoftware-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_SST_VoS.pdf.md`
- `371-Schnittstellen/Verordnungssoftware-Schnittstelle/KBV_ITA_VGEX_FAQ_SST_VoS.pdf.md`
- `Verordnungen/Arzneimittel/EXT_ITA_VGEX_Anforderungskatalog_AVWG.pdf.md`
- `Verordnungen/Arzneimittel/BMP/EXT_ITA_VGEX_BMP_Anlage3.pdf.md`
- `Verordnungen/Arzneimittel/BMP/KBV_ITA_AHEX_BMP_FAQs_PVS.pdf.md`
- `Verordnungen/VDGA/KBV_ITA_VGEX_Anforderungskatalog_VDGA.pdf.md`
- `Verordnungen/VDGA/KBV_ITA_SIEX_Sprechstunde_VDGA.pdf.md`
- `Verordnungen/Heilmittel/EXT_ITA_VGEX_Anforderungskatalog_Heilmittel.pdf.md`
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`
- `Blankoformulare/KBV_ITA_VGEX_Technisches_Handbuch_BFB.pdf.md`
- `Abrechnung/KBV_ITA_VGEX_Anforderungskatalog_Formularbedruckung.pdf.md`
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Patient.xml`
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Organization.xml`
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Practitioner.xml`
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_PractitionerRole.xml`
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Coverage.xml`
- `DigitaleMuster/ERP/Q3_2026/eRP_Beispiele_V1.4.zip.extracted/Beispiel_10_1.xml`
- `DigitaleMuster/eVDGA/eVDGA_Beispieldaten_V1.2.zip.extracted/EVDGA_Bundle.xml`
- `DigitaleMuster/eVDGA/Q3_2026/KBV_ITA_VGEX_Technische_Anlage_eVDGA.pdf.md`
- `DigitaleMuster/eAU/eAU_Beispiele_V1.2.zip.extracted/EEAU0_3f6e664d-2bfc-4eb7-9dc1-29ab73259e92.xml`

### 2.3 Archive, transport, and future-adapter sources

- `371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_AW_SST.pdf.md`
- `371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/KBV_FHIR_AW.zip.extracted/Profile/KBV_PR_AW_Patient.xml`
- `TSS/3_0_0/KBV_ITA_VGEX_Anforderungskatalog_TSS.pdf.md`
- `TSS/3_0_0/Spezifikation 116117 Terminservice - Abrechnungsinformation_V1.0.2.pdf.md`
- `TSS/3_0_0/Technische Anlage zur Spezifikation _116117 Terminservice - Abrechnungsinformation_V1.0.1.pdf.md`
- `TSS/3_0_0/KBV_ITA_AHEX_Pruefpaket_116117_Terminservice_Abr.pdf.md`
- `Labor/Labordatenkommunikation/EXT_ITA_VGEX_LDT 3_2_19_Gesamtdokument.pdf.md`
- `Abrechnung/eArztbrief/KBV_ITA_VGEX_Anforderungskatalog_eArztbrief.pdf.md`
- `Abrechnung/1-Click-Abrechnung/KIM/Begleitdatei_V1.0.3.pdf.md`

### 2.4 Certification scope source

- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITV_VGEX_Definition_von_Pruefnummern.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_Zert_Software.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_KVDT.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_BFB.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_AVWG.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_Heilmittel.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_DiMus.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_VDGA.pdf.md`
- `Allgemein/KBV_ITA_SIEX_Inhalt_Update.pdf.md`
- `Allgemein/KBV_ITA_RLEX_Zert.pdf.md`

## 3. Certification Scope and Corrections

The repo does not define one universal mandatory certification bundle for all PVS. It defines separate certification themes with separate Prüfnummern and a product may hold a subset of them.

For this project, the minimum believable path toward a certifiable PVS is:

- practice and practitioner master data
- insured-data capture from `eGK`, `KVK`, and `eEB`
- `KVDT`-ready billing anchors and quarterly export
- `ICD-10` compliant diagnosis and coding support
- `Blankoformularbedruckung` for the high-frequency paper forms we support
- `Arzneimittelverordnung` including `AMV-eRezept`
- `Heilmittel`
- `Digitale Muster` for `eAU`
- artifact, transport, audit, and revision handling

The following are independent or adjacent certification tracks. They are not blockers for the first certifiable path, but the schema must accommodate them cleanly:

- `VoS`
- `eVDGA`
- `AW-SST` full import/export
- `TSS` production certification
- `LDT`
- `eArztbrief`
- `1-Click KIM` and `eDokumentation KIM`
- XML-based DMP/QS documentation families
- `Kollegensuche`

Corrections already incorporated into this version:

- `eGK / VSD / Personalienfeld / insured-master-data capture` is core, not future.
- `KVDT` is part of the first certifiable path.
- `Heilmittel` is included in scope and schema.
- `eEB` is explicit as inbound KIM intake.
- `ICD-10 / SDICD / SDKH / SDKRW` is first-class.
- `Blankoformularbedruckung` is modeled as a real subsystem.
- `TI / KIM / SMC-B / eHBA` identity state is modeled.
- `AW-SST` is treated as authoritative historical import/export.

## 4. Confect-First Architecture Rules

### 4.1 Canonical model

- The canonical source of truth is a typed Confect domain model.
- Raw FHIR resources are not the persistence model.
- Raw UI form state is not the persistence model.
- The canonical model uses FHIR-aligned primitives, but aggregate roots are business concepts.
- The same `Effect Schema` values define:
  - stored documents
  - function args and returns
  - UI DTOs where appropriate
  - integration DTOs
  - test arbitraries

### 4.2 Persistence and schema rules

- `confect/schema.ts` is the only authoritative persistence schema.
- Each table is defined as:
  - `Fields = Schema.Struct(...)`
  - `Table = Table.make("tableName", Fields).index(...)`
- The database is exported as `DatabaseSchema.make().addTable(...)...`.
- Every table below must be declared explicitly. No generic `resources` table.
- Large binary payloads belong in Convex storage. Stored documents keep storage ids and metadata only.
- Avoid required circular references. Use optional or nullable back-references where lifecycle demands it.
- Read models may be denormalized, but canonical state lives in the tables below.

### 4.3 Reference rules

- Persisted foreign keys use `GenericId.GenericId("table")`.
- Embedded transport references are regular `Schema.Struct` values and must not be mistaken for DB references.
- UI lookup DTOs are separate projections and must not be written back directly as persistence documents.
- Prefer explicit link tables or nullable references over hidden polymorphic string ids unless the domain is truly polymorphic.

### 4.4 Artifact and revision rules

- Any issued, signed, exported, or transmitted record is immutable.
- Editing after issuance creates:
  - a new draft or new domain revision
  - a new artifact
  - a supersession link
- Inbound external payloads are preserved as immutable artifacts before mapping into canonical tables.

### 4.5 Codec and reversibility rules

- `Effect Schema` is the only schema language in this system.
- Not every external format is semantically reversible.
- Keep separate:
  - canonical domain state
  - immutable artifacts
  - typed codecs between them
- Treat each boundary family explicitly as one of:
  - `reversible`
  - `partially reversible`
  - `emit-only`
  - `import-authoritative`
- Signed artifacts, BFB render outputs, archive deliveries, and some FHIR bundles are not the canonical source of truth even if they can be parsed.

### 4.6 FHIR rules

- Build a custom `Effect Schema` FHIR R4 layer in `src/fhir-r4-effect/*`.
- Source-of-truth order for the FHIR layer:
  1. official HL7 FHIR R4 / 4.0.1 structure
  2. KBV profile artifacts in this repo
  3. `@solarahealth/fhir-r4` as reference material only
- The canonical model remains independent from FHIR resource envelopes.

### 4.7 XML, xDT, and print rules

- Use typed `Effect Schema` DTOs for XML, xDT, print, and render contexts.
- Do not use one generic XML encoder as the only XML strategy.
- Each XML family must define:
  - exact element names
  - exact namespace declarations
  - attribute rendering rules
  - required character encoding
  - XSD or oracle validation step
- Each xDT family must define:
  - segment/field ordering
  - file wrapper rules
  - field normalization rules
  - validator/oracle binding

## 5. Shared Effect Schemas

Define shared healthcare primitives in `confect/tables/primitives.ts` and reuse them across tables and codecs.

```ts
import { GenericId } from "@confect/core";
import { Schema } from "effect";

export const IsoDate = Schema.String;
export const IsoDateTime = Schema.String;
export const NonEmptyString = Schema.String;
```

### 5.1 `CodingValue`

```ts
export const CodingValue = Schema.Struct({
  system: Schema.String,
  code: Schema.String,
  display: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  userSelected: Schema.optional(Schema.Boolean),
});
```

### 5.2 `CodeableConceptValue`

```ts
export const CodeableConceptValue = Schema.Struct({
  coding: Schema.Array(CodingValue),
  text: Schema.optional(Schema.String),
});
```

### 5.3 `IdentifierValue`

```ts
export const IdentifierValue = Schema.Struct({
  system: Schema.String,
  value: Schema.String,
  type: Schema.optional(CodingValue),
  use: Schema.optional(
    Schema.Literal("usual", "official", "temp", "secondary", "old"),
  ),
  assignerDisplay: Schema.optional(Schema.String),
  period: Schema.optional(PeriodValue),
});
```

### 5.4 `HumanNameValue`

```ts
export const HumanNameValue = Schema.Struct({
  use: Schema.optional(Schema.Literal("official", "usual", "maiden", "old")),
  family: Schema.String,
  ownName: Schema.optional(Schema.String),
  nameAddition: Schema.optional(Schema.String),
  prefixes: Schema.Array(Schema.String),
  given: Schema.Array(Schema.String),
});
```

### 5.5 `AddressValue`

```ts
export const AddressValue = Schema.Struct({
  type: Schema.optional(Schema.Literal("physical", "postal", "both")),
  line1: Schema.String,
  line2: Schema.optional(Schema.String),
  streetName: Schema.optional(Schema.String),
  houseNumber: Schema.optional(Schema.String),
  additionalLocator: Schema.optional(Schema.String),
  postBox: Schema.optional(Schema.String),
  postalCode: Schema.optional(Schema.String),
  city: Schema.optional(Schema.String),
  country: Schema.optional(Schema.String),
});
```

### 5.6 `ContactPointValue`

```ts
export const ContactPointValue = Schema.Struct({
  system: Schema.Literal("phone", "fax", "email", "url", "other"),
  value: Schema.String,
  use: Schema.optional(Schema.Literal("work", "home", "mobile", "temp")),
});
```

### 5.7 `PeriodValue`

```ts
export const PeriodValue = Schema.Struct({
  start: Schema.optional(IsoDateTime),
  end: Schema.optional(IsoDateTime),
});
```

### 5.8 `QuantityValue`

```ts
export const QuantityValue = Schema.Struct({
  value: Schema.Number,
  unit: Schema.optional(Schema.String),
  system: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
});
```

### 5.9 `ReferenceValue`

```ts
export const ReferenceValue = Schema.Struct({
  table: Schema.String,
  id: Schema.String,
  display: Schema.optional(Schema.String),
});
```

### 5.10 `AttachmentRefValue`

```ts
export const AttachmentRefValue = Schema.Struct({
  storageId: GenericId.GenericId("_storage"),
  contentType: Schema.String,
  byteSize: Schema.Number,
  sha256: Schema.String,
  title: Schema.optional(Schema.String),
  creationTime: Schema.optional(IsoDateTime),
});
```

### 5.11 `SourceStampValue`

```ts
export const SourceStampValue = Schema.Struct({
  sourceKind: Schema.Literal(
    "manual",
    "egk",
    "kvk",
    "eeb",
    "kim",
    "fhir-import",
    "xdt-import",
    "migration",
  ),
  sourcePath: Schema.optional(Schema.String),
  importBatchId: Schema.optional(GenericId.GenericId("masterDataPackages")),
  capturedAt: IsoDateTime,
});
```

## 6. Authoritative Confect Schema Blueprint

Every table below must be implemented in this pattern:

```ts
export const ExampleFields = Schema.Struct({
  /* fields */
});

export const Example = Table.make("example", ExampleFields)
  .index("by_some_field", ["someField"]);
```

Use exported `Fields` schemas as the source for:

- DB persistence
- public/internal function args and returns where shapes match
- DTO derivation
- test generators and `fast-check` arbitraries

### 6.1 `interfaceProfiles`

Sources:
- `Allgemein/KBV_ITA_SIEX_Inhalt_Update.pdf.md`
- `DigitaleMuster/eVDGA/Q3_2026/KBV_ITA_VGEX_Technische_Anlage_eVDGA.pdf.md`
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Patient.xml`

Purpose:
- version registry for profile-family selection by effective date

Fields:

```ts
export const InterfaceProfilesFields = Schema.Struct({
  artifactFamily: Schema.Literal(
    "FOR",
    "ERP",
    "EVDGA",
    "EAU",
    "VoS",
    "KVDT",
    "TSS",
    "AW",
    "Heilmittel",
    "BFB",
  ),
  profileVersion: Schema.String,
  effectiveFrom: IsoDate,
  effectiveTo: Schema.optional(IsoDate),
  transportKind: Schema.Literal(
    "fhir-rest",
    "fhir-bundle-xml",
    "xdt",
    "kim",
    "pdfa",
    "print",
    "bmp-xml",
  ),
  packagePath: Schema.String,
  validatorPackagePath: Schema.optional(Schema.String),
  exampleDataPath: Schema.optional(Schema.String),
  status: Schema.Literal("active", "planned", "retired"),
});
```

Indexes:
- `by_artifactFamily_and_effectiveFrom`
- `by_artifactFamily_and_profileVersion`

### 6.2 `masterDataPackages`

Sources:
- `Stammdateien/SDICD/SDICD_V2.4.0.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDICD.pdf.md`
- `Stammdateien/SDKH/SDKH_V1.01.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDKH.pdf.md`
- `Stammdateien/SDKRW/SDKRW_V1.40.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDKRW.pdf.md`
- `Stammdateien/SDKT/SDKT_V1.05.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDKT.pdf.md`
- `Stammdateien/SDHM/SDHM_V2.10.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDHM.pdf.md`
- `Stammdateien/SDHMA/SDHMA_V1.30.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDHMA.pdf.md`
- `Verordnungen/Arzneimittel/EXT_ITA_VGEX_Anforderungskatalog_AVWG.pdf.md`
- `Verordnungen/Arzneimittel/BMP/EXT_ITA_VGEX_BMP_Anlage3.pdf.md`
- `Blankoformulare/KBV_ITA_VGEX_Technisches_Handbuch_BFB.pdf.md`
- `Verordnungen/VDGA/KBV_ITA_VGEX_Anforderungskatalog_VDGA.pdf.md`

Purpose:
- metadata and provenance for imported KBV/GKV/BfArM data packages

Fields:

```ts
export const MasterDataPackagesFields = Schema.Struct({
  family: Schema.Literal(
    "SDICD",
    "SDKH",
    "SDKRW",
    "SDKT",
    "SDHM",
    "SDHMA",
    "AMDB",
    "ARV",
    "DIGA",
    "BMP",
    "BFB_TEMPLATE",
    "SDKVCA",
    "SDVA",
  ),
  version: Schema.String,
  effectiveFrom: Schema.optional(IsoDate),
  effectiveTo: Schema.optional(IsoDate),
  sourcePath: Schema.String,
  artifact: AttachmentRefValue,
  importedAt: IsoDateTime,
  status: Schema.Literal("active", "superseded", "failed"),
});
```

Indexes:
- `by_family_and_version`
- `by_family_and_effectiveFrom`

### 6.3 `organizations`

Sources:
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Organization.xml`
- `Service-Informationen/Feldkatalog/KBV_ITA_SIEX_Feld_und_Regelkatalog.pdf.md`
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`
- `Abrechnung/KBV_ITA_VGEX_Mapping_KVK.pdf.md`

Purpose:
- legal and billing-relevant organizations, mainly practices and payors

Fields:

```ts
export const OrganizationsFields = Schema.Struct({
  active: Schema.Boolean,
  kind: Schema.Literal("practice", "hospital", "payor", "bg", "kv", "other"),
  name: Schema.String,
  identifiers: Schema.Array(IdentifierValue),
  bsnr: Schema.optional(Schema.String),
  nbsnr: Schema.optional(Schema.String),
  iknr: Schema.optional(Schema.String),
  telematikId: Schema.optional(Schema.String),
  addresses: Schema.Array(AddressValue),
  telecom: Schema.Array(ContactPointValue),
  parentOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  sourceStamp: SourceStampValue,
});
```

Indexes:
- `by_bsnr`
- `by_iknr`
- `by_telematikId`
- `by_kind_and_name`

### 6.4 `practiceLocations`

Sources:
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`
- `371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/KBV_FHIR_AW.zip.extracted/Profile/KBV_PR_AW_Unfall_Ort.xml`
- `Service-Informationen/Feldkatalog/KBV_ITA_SIEX_Feld_und_Regelkatalog.pdf.md`

Purpose:
- operational locations under an organization; needed for BSNR/NBSNR, ASV, form output, and billing

Fields:

```ts
export const PracticeLocationsFields = Schema.Struct({
  organizationId: GenericId.GenericId("organizations"),
  name: Schema.optional(Schema.String),
  bsnrOrNbsnr: Schema.String,
  asvTeamNumber: Schema.optional(Schema.String),
  address: AddressValue,
  telecom: Schema.Array(ContactPointValue),
  isDefault: Schema.Boolean,
  sourceStamp: SourceStampValue,
});
```

Indexes:
- `by_organizationId`
- `by_bsnrOrNbsnr`
- `by_asvTeamNumber`

### 6.5 `practitioners`

Sources:
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Practitioner.xml`
- `DigitaleMuster/eVDGA/eVDGA_Beispieldaten_V1.2.zip.extracted/EVDGA_Bundle.xml`
- `Service-Informationen/Feldkatalog/KBV_ITA_SIEX_Feld_und_Regelkatalog.pdf.md`

Purpose:
- human prescribers / behandelnde persons

Fields:

```ts
export const PractitionersFields = Schema.Struct({
  active: Schema.Boolean,
  displayName: Schema.String,
  nameSortKey: Schema.String,
  names: Schema.Array(HumanNameValue),
  lanr: Schema.optional(Schema.String),
  zanr: Schema.optional(Schema.String),
  telematikId: Schema.optional(Schema.String),
  qualifications: Schema.Array(CodeableConceptValue),
  sourceStamp: SourceStampValue,
});
```

Indexes:
- `by_lanr`
- `by_telematikId`
- `by_nameSortKey`

### 6.6 `practitionerRoles`

Sources:
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_PractitionerRole.xml`
- `DigitaleMuster/eAU/eAU_Beispiele_V1.2.zip.extracted/EEAU0_3f6e664d-2bfc-4eb7-9dc1-29ab73259e92.xml`
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`

Purpose:
- role of a practitioner in a specific practice/location context

Fields:

```ts
export const PractitionerRolesFields = Schema.Struct({
  practitionerId: GenericId.GenericId("practitioners"),
  organizationId: GenericId.GenericId("organizations"),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  roleCodes: Schema.Array(CodingValue),
  specialtyCodes: Schema.Array(CodingValue),
  asvTeamNumber: Schema.optional(Schema.String),
  period: Schema.optional(PeriodValue),
  sourceStamp: SourceStampValue,
});
```

Indexes:
- `by_practitionerId_and_organizationId`
- `by_asvTeamNumber`
- `by_locationId`

### 6.7 `tiIdentities`

Sources:
- `SMCB/KBV_ITA_FMEX_AAZ_SMCB.pdf.md`
- `Abrechnung/eArztbrief/KBV_ITA_VGEX_Anforderungskatalog_eArztbrief.pdf.md`
- `Abrechnung/eEB/KBV_ITA_VGEX_Technische_Anlage_eEB.pdf.md`

Purpose:
- track SMC-B, HSM-B, eHBA, Telematik-ID, and certificate lifecycle needed for KIM/TI workflows

Fields:

```ts
export const TiIdentitiesFields = Schema.Struct({
  holderKind: Schema.Literal("organization", "practitioner"),
  holderId: Schema.String,
  identityType: Schema.Literal("smc-b", "hsm-b", "ehba", "telematik-id"),
  display: Schema.String,
  directoryEntryId: Schema.optional(Schema.String),
  certificateSerial: Schema.optional(Schema.String),
  validFrom: Schema.optional(IsoDate),
  validTo: Schema.optional(IsoDate),
  status: Schema.Literal("active", "inactive", "expired", "revoked"),
});
```

Indexes:
- `by_holderKind_and_holderId`
- `by_identityType_and_status`
- `by_directoryEntryId`

### 6.8 `kimMailboxes`

Sources:
- `Abrechnung/eEB/KBV_ITA_VGEX_Technische_Anlage_eEB.pdf.md`
- `Abrechnung/eArztbrief/KBV_ITA_VGEX_Anforderungskatalog_eArztbrief.pdf.md`
- `Abrechnung/1-Click-Abrechnung/KIM/Begleitdatei_V1.0.3.pdf.md`

Purpose:
- inbound/outbound KIM addresses and routing metadata

Fields:

```ts
export const KimMailboxesFields = Schema.Struct({
  ownerKind: Schema.Literal("organization", "practitioner"),
  ownerId: Schema.String,
  address: Schema.String,
  identityId: Schema.optional(GenericId.GenericId("tiIdentities")),
  isDefaultInbound: Schema.Boolean,
  identityPreference: Schema.optional(
    Schema.Literal("auto", "smc-b", "ehba"),
  ),
  pollingMode: Schema.optional(
    Schema.Literal("manual", "scheduled", "event-driven"),
  ),
  pollingIntervalMinutes: Schema.optional(Schema.Number),
  serviceTags: Schema.Array(Schema.String),
  status: Schema.Literal("active", "inactive"),
});
```

Indexes:
- `by_address`
- `by_ownerKind_and_ownerId`

### 6.9 `patients`

Sources:
- `Abrechnung/KBV_ITA_VGEX_Mapping_KVK.pdf.md`
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Patient.xml`
- `371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/KBV_FHIR_AW.zip.extracted/Profile/KBV_PR_AW_Patient.xml`
- `Abrechnung/eEB/KBV_ITA_VGEX_Technische_Anlage_eEB.pdf.md`

Purpose:
- patient chart root

Fields:

```ts
export const PatientsFields = Schema.Struct({
  status: Schema.Literal("active", "archived", "merged"),
  displayName: Schema.String,
  names: Schema.Array(HumanNameValue),
  birthDate: Schema.optional(IsoDate),
  administrativeGender: Schema.optional(CodingValue),
  addresses: Schema.Array(AddressValue),
  telecom: Schema.Array(ContactPointValue),
  generalPractitionerRoleId: Schema.optional(
    GenericId.GenericId("practitionerRoles"),
  ),
  managingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  preferredLanguages: Schema.Array(CodingValue),
  mergedIntoPatientId: Schema.optional(GenericId.GenericId("patients")),
  sourceStamp: SourceStampValue,
});
```

Indexes:
- `by_displayName`
- `by_birthDate`
- `by_generalPractitionerRoleId`

### 6.10 `patientIdentifiers`

Sources:
- `Abrechnung/KBV_ITA_VGEX_Mapping_KVK.pdf.md`
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Patient.xml`
- `Service-Informationen/Feldkatalog/KBV_ITA_SIEX_Feld_und_Regelkatalog.pdf.md`

Purpose:
- multiple identifiers per patient without bloating the patient document

Fields:

```ts
export const PatientIdentifiersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  system: Schema.String,
  value: Schema.String,
  identifier: IdentifierValue,
  isPrimary: Schema.Boolean,
  sourceStamp: SourceStampValue,
  verifiedAt: Schema.optional(IsoDateTime),
});
```

Indexes:
- `by_patientId_and_isPrimary`
- `by_system_and_value`

### 6.11 `coverages`

Sources:
- `Abrechnung/KBV_ITA_VGEX_Mapping_KVK.pdf.md`
- `DigitaleMuster/FOR/KBV_FHIR_FOR_V1.2.1.zip.extracted/KBV_PR_FOR_Coverage.xml`
- `DigitaleMuster/eVDGA/eVDGA_Beispieldaten_V1.2.zip.extracted/EVDGA_Bundle.xml`
- `Abrechnung/eEB/KBV_ITA_VGEX_Technische_Anlage_eEB.pdf.md`

Purpose:
- current insurance / payor relationship for treatment and prescribing

Fields:

```ts
export const CoveragesFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  subscriberPatientId: Schema.optional(GenericId.GenericId("patients")),
  payorOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  kind: Schema.Literal("gkv", "pkv", "bg", "sozialamt", "self-pay", "other"),
  kvid10: Schema.optional(Schema.String),
  legacyInsuranceNumber: Schema.optional(Schema.String),
  kostentraegerkennung: Schema.optional(Schema.String),
  kostentraegerName: Schema.optional(Schema.String),
  versichertenart: Schema.optional(Schema.String),
  besonderePersonengruppe: Schema.optional(Schema.String),
  dmpKennzeichnung: Schema.optional(Schema.String),
  statusKennzeichen: Schema.optional(Schema.String),
  ruhenderLeistungsanspruch: Schema.optional(CodeableConceptValue),
  costReimbursementFlags: Schema.optional(
    Schema.Struct({
      aerztlicheVersorgung: Schema.optional(Schema.Boolean),
      zahnaerztlicheVersorgung: Schema.optional(Schema.Boolean),
      stationaererBereich: Schema.optional(Schema.Boolean),
      veranlassteLeistungen: Schema.optional(Schema.Boolean),
    }),
  ),
  period: Schema.optional(PeriodValue),
  sourceVsdSnapshotId: Schema.optional(GenericId.GenericId("vsdSnapshots")),
  sourceStamp: SourceStampValue,
});
```

Indexes:
- `by_patientId`
- `by_kvid10`
- `by_kostentraegerkennung`

### 6.12 `vsdSnapshots`

Sources:
- `Abrechnung/KBV_ITA_VGEX_Mapping_KVK.pdf.md`
- `Service-Informationen/Feldkatalog/KBV_ITA_SIEX_Feld_und_Regelkatalog.pdf.md`
- `Abrechnung/eEB/KBV_ITA_VGEX_Technische_Anlage_eEB.pdf.md`

Purpose:
- immutable snapshots of insured master data read from eGK/KVK/eEB

Fields:

```ts
export const VsdSnapshotsFields = Schema.Struct({
  patientId: Schema.optional(GenericId.GenericId("patients")),
  readSource: Schema.Literal("egk", "kvk", "eeb"),
  schemaVersion3006: Schema.optional(Schema.String),
  readAt: IsoDateTime,
  onlineCheckTimestamp3010: Schema.optional(IsoDateTime),
  onlineCheckResult3011: Schema.optional(Schema.String),
  onlineCheckErrorCode3012: Schema.optional(Schema.String),
  onlineCheckPruefziffer3013: Schema.optional(Schema.String),
  versichertenId3119: Schema.optional(Schema.String),
  coveragePayload: Schema.Struct({
    versichertenId3119: Schema.optional(Schema.String),
    versichertennummer3105: Schema.optional(Schema.String),
    versichertenart3108: Schema.optional(Schema.String),
    geschlecht3110: Schema.optional(Schema.String),
    geburtsdatum3103: Schema.optional(Schema.String),
    strasse3107: Schema.optional(Schema.String),
    plz3112: Schema.optional(Schema.String),
    ort3113: Schema.optional(Schema.String),
    versicherungsschutzEnde3116: Schema.optional(Schema.String),
    kostentraegerkennung4133: Schema.optional(Schema.String),
    kostentraegername4134: Schema.optional(Schema.String),
  }),
  rawArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
});
```

Indexes:
- `by_patientId_and_readAt`
- `by_readSource_and_readAt`
- `by_versichertenId3119`

### 6.13 `eebInboxItems`

Sources:
- `Abrechnung/eEB/KBV_ITA_VGEX_Technische_Anlage_eEB.pdf.md`

Purpose:
- track inbound eEB KIM messages and adoption workflow

Fields:

```ts
export const EebInboxItemsFields = Schema.Struct({
  kimMessageId: Schema.String,
  kimMailboxId: GenericId.GenericId("kimMailboxes"),
  serviceIdentifier: Schema.String,
  senderDisplay: Schema.optional(Schema.String),
  senderVerified: Schema.Boolean,
  receivedAt: IsoDateTime,
  payloadArtifactId: GenericId.GenericId("artifacts"),
  matchedPatientId: Schema.optional(GenericId.GenericId("patients")),
  matchedCoverageId: Schema.optional(GenericId.GenericId("coverages")),
  matchState: Schema.Literal(
    "unmatched",
    "matched-existing",
    "new-patient",
    "manual-review",
  ),
  adoptionState: Schema.Literal("pending", "accepted", "rejected"),
  adoptedVsdSnapshotId: Schema.optional(GenericId.GenericId("vsdSnapshots")),
});
```

Indexes:
- `by_kimMessageId`
- `by_matchState_and_receivedAt`
- `by_matchedPatientId`

### 6.14 `appointments`

Sources:
- `TSS/3_0_0/KBV_ITA_VGEX_Anforderungskatalog_TSS.pdf.md`
- `TSS/3_0_0/KBV_ITA_AHEX_Pruefpaket_116117_Terminservice_Abr.pdf.md`
- `371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/KBV_FHIR_AW.zip.extracted/Terminologie/KBV_CS_AW_Ressourcentyp.xml`

Purpose:
- internal and TSS-linked appointments

Fields:

```ts
export const AppointmentsFields = Schema.Struct({
  patientId: Schema.optional(GenericId.GenericId("patients")),
  organizationId: GenericId.GenericId("organizations"),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  start: IsoDateTime,
  end: Schema.optional(IsoDateTime),
  status: Schema.Literal("proposed", "booked", "fulfilled", "cancelled", "noshow"),
  source: Schema.Literal("internal", "tss"),
  externalAppointmentId: Schema.optional(Schema.String),
  vermittlungscode: Schema.optional(Schema.String),
  tssServiceType: Schema.optional(Schema.String),
  displayBucket: Schema.optional(Schema.String),
});
```

Indexes:
- `by_patientId_and_start`
- `by_source_and_externalAppointmentId`
- `by_organizationId_and_start`

### 6.15 `encounters`

Sources:
- `Abrechnung/KBV_ITA_VGEX_Datensatzbeschreibung_KVDT.pdf.md`
- `371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/KBV_FHIR_AW.zip.extracted/Profile/KBV_EX_AW_Begegnung_Spezielle_Begegnungsinformationen.xml`
- `TSS/3_0_0/KBV_ITA_VGEX_Anforderungskatalog_TSS.pdf.md`

Purpose:
- treatment context bridging clinical, billing, and form workflows

Fields:

```ts
export const EncountersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  organizationId: GenericId.GenericId("organizations"),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  practitionerRoleId: Schema.optional(GenericId.GenericId("practitionerRoles")),
  appointmentId: Schema.optional(GenericId.GenericId("appointments")),
  coverageId: Schema.optional(GenericId.GenericId("coverages")),
  quarter: Schema.String,
  start: IsoDateTime,
  end: Schema.optional(IsoDateTime),
  caseType: Schema.Literal(
    "regular",
    "tss",
    "accident",
    "asv",
    "home-visit",
    "heilmittel",
    "prescription-only",
  ),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
});
```

Indexes:
- `by_patientId_and_start`
- `by_billingCaseId`
- `by_quarter_and_organizationId`

### 6.16 `referrals`

Sources:
- `TSS/3_0_0/Spezifikation 116117 Terminservice - Vermittlungscode_V1.0.2.pdf.md`
- `Service-Informationen/Feldkatalog/KBV_ITA_SIEX_Feld_und_Regelkatalog.pdf.md`
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`

Purpose:
- referrals and first-referrer data required for forms and TSS

Fields:

```ts
export const ReferralsFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  requesterRoleId: GenericId.GenericId("practitionerRoles"),
  recipientOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  recipientPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  issueDate: IsoDate,
  reasonCodes: Schema.Array(CodingValue),
  vermittlungscode: Schema.optional(Schema.String),
  erstveranlasserBsnr: Schema.optional(Schema.String),
  erstveranlasserLanr: Schema.optional(Schema.String),
  status: Schema.Literal("active", "used", "cancelled", "expired"),
});
```

Indexes:
- `by_patientId_and_issueDate`
- `by_vermittlungscode`

### 6.17 `diagnoses`

Sources:
- `Abrechnung/KBV_ITA_VGEX_Anforderungskatalog_ICD-10.pdf.md`
- `Stammdateien/SDICD/SDICD_V2.4.0.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDICD.pdf.md`
- `Abrechnung/KBV_ITA_VGEX_Datensatzbeschreibung_KVDT.pdf.md`
- `DigitaleMuster/eAU/eAU_Beispiele_V1.2.zip.extracted/EEAU0_3f6e664d-2bfc-4eb7-9dc1-29ab73259e92.xml`

Purpose:
- coded diagnoses with billing and form semantics

Fields:

```ts
export const DiagnosesFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  encounterId: Schema.optional(GenericId.GenericId("encounters")),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  icdCode: Schema.String,
  icd10gm: CodingValue,
  diagnoseklartext: Schema.optional(Schema.String),
  category: Schema.Literal("acute", "dauerdiagnose", "anamnestisch"),
  diagnosensicherheit: Schema.optional(Schema.String),
  seitenlokalisation: Schema.optional(Schema.String),
  diagnoseerlaeuterung: Schema.optional(Schema.String),
  isPrimary: Schema.optional(Schema.Boolean),
  isSecondary: Schema.optional(Schema.Boolean),
  recordStatus: Schema.Literal("active", "cancelled", "superseded"),
});
```

Indexes:
- `by_patientId_and_recordStatus`
- `by_encounterId`
- `by_icdCode`

### 6.18 `icdCatalogEntries`

Sources:
- `Stammdateien/SDICD/SDICD_V2.4.0.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDICD.pdf.md`
- `Abrechnung/KBV_ITA_VGEX_Anforderungskatalog_ICD-10.pdf.md`

Purpose:
- normalized SDICD entries

Fields:

```ts
export const IcdCatalogEntriesFields = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  code: Schema.String,
  text: Schema.String,
  isBillable: Schema.Boolean,
  notationFlag: Schema.optional(Schema.String),
  ageLower: Schema.optional(Schema.Number),
  ageUpper: Schema.optional(Schema.Number),
  ageErrorType: Schema.optional(Schema.String),
  genderConstraint: Schema.optional(Schema.String),
  genderErrorType: Schema.optional(Schema.String),
  rareDiseaseFlag: Schema.optional(Schema.Boolean),
});
```

Indexes:
- `by_code`
- `by_sourcePackageId_and_code`

### 6.19 `codingEvaluations`

Sources:
- `Abrechnung/KBV_ITA_VGEX_Anforderungskatalog_ICD-10.pdf.md`
- `Stammdateien/SDKH/SDKH_V1.01.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDKH.pdf.md`
- `Stammdateien/SDKRW/SDKRW_V1.40.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDKRW.pdf.md`

Purpose:
- persisted coding checks, hints, and rule outcomes

Fields:

```ts
export const CodingEvaluationsFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  diagnosisId: Schema.optional(GenericId.GenericId("diagnoses")),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  ruleFamily: Schema.Literal("sdicd", "sdkh", "sdkrw"),
  severity: Schema.Literal("info", "warning", "error"),
  ruleCode: Schema.String,
  message: Schema.String,
  blocking: Schema.Boolean,
  createdAt: IsoDateTime,
});
```

Indexes:
- `by_diagnosisId`
- `by_billingCaseId_and_ruleFamily`

### 6.20 `billingCases`

Sources:
- `Abrechnung/KBV_ITA_VGEX_Datensatzbeschreibung_KVDT.pdf.md`
- `Service-Informationen/Feldkatalog/KBV_ITA_SIEX_Feld_und_Regelkatalog.pdf.md`
- `TSS/3_0_0/Spezifikation 116117 Terminservice - Abrechnungsinformation_V1.0.2.pdf.md`
- `TSS/3_0_0/KBV_ITA_VGEX_Anforderungskatalog_TSS.pdf.md`

Purpose:
- root aggregate for quarterly billing/export

Fields:

```ts
export const BillingCasesFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  coverageId: Schema.optional(GenericId.GenericId("coverages")),
  organizationId: GenericId.GenericId("organizations"),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  practitionerRoleId: Schema.optional(GenericId.GenericId("practitionerRoles")),
  quarter: Schema.String,
  scheinuntergruppe: Schema.optional(Schema.String),
  einlesedatum4109: Schema.optional(IsoDate),
  vsdSnapshotId: Schema.optional(GenericId.GenericId("vsdSnapshots")),
  kostentraegerkennung4133: Schema.optional(Schema.String),
  kostentraegername4134: Schema.optional(Schema.String),
  tssRelevant: Schema.Boolean,
  tssAppointmentId: Schema.optional(GenericId.GenericId("appointments")),
  status: Schema.Literal("open", "ready-for-export", "exported", "corrected"),
});
```

Indexes:
- `by_patientId_and_quarter`
- `by_organizationId_and_quarter`
- `by_status_and_quarter`

### 6.21 `billingLineItems`

Sources:
- `Abrechnung/KBV_ITA_VGEX_Datensatzbeschreibung_KVDT.pdf.md`
- `DigitaleMuster/ERP/Q3_2026/KBV_FHIR_eRP_V1.4.1_zur_Validierung.zip.extracted/_Basis_R4/StructureDefinition-chargeitem-de-ebm.json`

Purpose:
- billable units that later map into KVDT / charge export

Fields:

```ts
export const BillingLineItemsFields = Schema.Struct({
  billingCaseId: GenericId.GenericId("billingCases"),
  chargeCodeSystem: Schema.Literal("EBM", "GOAE", "other"),
  chargeCode: Schema.String,
  serviceDate: IsoDate,
  quantity: Schema.Number,
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  modifierCodes: Schema.Array(CodingValue),
  originKind: Schema.Literal("manual", "form", "tss", "import"),
});
```

Indexes:
- `by_billingCaseId`
- `by_chargeCodeSystem_and_chargeCode`

### 6.22 `medicationCatalogRefs`

Sources:
- `Verordnungen/Arzneimittel/EXT_ITA_VGEX_Anforderungskatalog_AVWG.pdf.md`
- `DigitaleMuster/ERP/Q3_2026/eRP_Beispiele_V1.4.zip.extracted/Beispiel_10_1.xml`

Purpose:
- normalized medication/product catalog at PZN level

Fields:

```ts
export const MedicationCatalogRefsFields = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  pzn: Schema.String,
  displayName: Schema.String,
  doseForm: Schema.optional(CodeableConceptValue),
  activeIngredientText: Schema.optional(Schema.String),
  strengthText: Schema.optional(Schema.String),
  packageSizeValue: Schema.optional(Schema.Number),
  packageSizeUnit: Schema.optional(Schema.String),
  normGroesse: Schema.optional(Schema.String),
  articleStatus: Schema.optional(Schema.String),
  isPrescriptionOnly: Schema.optional(Schema.Boolean),
  isApothekenpflichtig: Schema.optional(Schema.Boolean),
  isBtm: Schema.optional(Schema.Boolean),
  isTRezept: Schema.optional(Schema.Boolean),
  manufacturer: Schema.optional(Schema.String),
  atcCode: Schema.optional(Schema.String),
  priceAvp: Schema.optional(Schema.Number),
  regionalArvFlags: Schema.Array(Schema.String),
});
```

Indexes:
- `by_pzn`
- `by_atcCode`

### 6.23 `housePharmacyItems`

Sources:
- `Verordnungen/Arzneimittel/EXT_ITA_VGEX_Anforderungskatalog_AVWG.pdf.md`
- `371-Schnittstellen/Verordnungssoftware-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_SST_VoS.pdf.md`

Purpose:
- local house-pharmacy favorites used by optional AVWG/VoS functions

Fields:

```ts
export const HousePharmacyItemsFields = Schema.Struct({
  organizationId: GenericId.GenericId("organizations"),
  pzn: Schema.String,
  rank: Schema.optional(Schema.Number),
  isPreferred: Schema.Boolean,
  note: Schema.optional(Schema.String),
});
```

Indexes:
- `by_organizationId_and_pzn`

### 6.24 `medicationOrders`

Sources:
- `Verordnungen/Arzneimittel/EXT_ITA_VGEX_Anforderungskatalog_AVWG.pdf.md`
- `371-Schnittstellen/Verordnungssoftware-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_SST_VoS.pdf.md`
- `DigitaleMuster/ERP/Q3_2026/eRP_Beispiele_V1.4.zip.extracted/Beispiel_10_1.xml`
- `DigitaleMuster/ERP/KBV_FHIR_eRP_V1.3.3.zip.extracted/KBV_PR_ERP_PracticeSupply.xml`
- `DigitaleMuster/ERP/KBV_FHIR_eRP_V1.3.3.zip.extracted/KBV_EX_ERP_Narcotic.xml`
- `DigitaleMuster/ERP/KBV_FHIR_eRP_V1.3.3.zip.extracted/KBV_EX_ERP_Teratogenic.xml`
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`

Purpose:
- canonical medication prescription order, independent of paper or electronic output

Fields:

```ts
export const MedicationOrdersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  encounterId: Schema.optional(GenericId.GenericId("encounters")),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  coverageId: GenericId.GenericId("coverages"),
  practitionerId: GenericId.GenericId("practitioners"),
  preparerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  signerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  organizationId: GenericId.GenericId("organizations"),
  orderKind: Schema.Literal("pzn", "ingredient", "compounding", "freetext"),
  prescriptionMode: Schema.Literal("paper", "electronic", "fallback-paper"),
  prescriptionContext: Schema.Literal(
    "regular",
    "practice-supply",
    "home-visit",
    "care-home",
    "technical-fallback",
  ),
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  authoredOn: IsoDateTime,
  medicationCatalogRefId: Schema.optional(GenericId.GenericId("medicationCatalogRefs")),
  freeTextMedication: Schema.optional(Schema.String),
  dosageText: Schema.optional(Schema.String),
  quantity: Schema.optional(QuantityValue),
  packageCount: Schema.optional(Schema.Number),
  packagingText: Schema.optional(Schema.String),
  substitutionAllowed: Schema.optional(Schema.Boolean),
  statusCoPaymentCode: Schema.optional(Schema.String),
  legalBasisCode: Schema.optional(Schema.String),
  serFlag: Schema.optional(Schema.Boolean),
  accidentInfo: Schema.optional(
    Schema.Struct({
      isAccident: Schema.Boolean,
      isWorkAccident: Schema.optional(Schema.Boolean),
      employerName: Schema.optional(Schema.String),
      accidentDate: Schema.optional(IsoDate),
      accidentLocation: Schema.optional(Schema.String),
    }),
  ),
  specialRecipeType: Schema.optional(Schema.Literal("btm", "t-rezept", "none")),
  vaccineFlag: Schema.optional(Schema.Boolean),
  sprechstundenbedarfFlag: Schema.optional(Schema.Boolean),
  emergencyServicesFee: Schema.optional(Schema.Boolean),
  multiplePrescription: Schema.optional(
    Schema.Struct({
      enabled: Schema.Boolean,
      numerator: Schema.optional(Schema.Number),
      denominator: Schema.optional(Schema.Number),
      redeemFrom: Schema.optional(IsoDate),
      redeemUntil: Schema.optional(IsoDate),
      seriesIdentifier: Schema.optional(Schema.String),
    }),
  ),
  artifactDocumentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
});
```

Indexes:
- `by_patientId_and_authoredOn`
- `by_orderKind_and_status`
- `by_medicationCatalogRefId`

### 6.25 `medicationPlans`

Sources:
- `371-Schnittstellen/Verordnungssoftware-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_SST_VoS.pdf.md`
- `Verordnungen/Arzneimittel/BMP/EXT_ITA_VGEX_BMP_Anlage3.pdf.md`
- `Verordnungen/Arzneimittel/BMP/KBV_ITA_AHEX_BMP_FAQs_PVS.pdf.md`

Purpose:
- current structured medication plan and BMP/eMP handoff data

Fields:

```ts
export const MedicationPlansFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  status: Schema.Literal("current", "superseded"),
  sourceKind: Schema.Literal("structured", "bmp-xml", "bmp-barcode", "vos"),
  bmpVersion: Schema.optional(Schema.String),
  documentIdentifier: Schema.optional(Schema.String),
  setIdentifier: Schema.optional(Schema.String),
  issuerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  issuingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  barcodePayload: Schema.optional(Schema.String),
  sourceArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  patientPrintArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  updatedAt: IsoDateTime,
});
```

Indexes:
- `by_patientId_and_status`

### 6.26 `medicationPlanEntries`

Sources:
- `Verordnungen/Arzneimittel/BMP/EXT_ITA_VGEX_BMP_Anlage3.pdf.md`
- `Verordnungen/Arzneimittel/BMP/KBV_ITA_AHEX_BMP_FAQs_PVS.pdf.md`

Purpose:
- structured entries of a medication plan so the plan is not only a barcode or raw XML blob

Fields:

```ts
export const MedicationPlanEntriesFields = Schema.Struct({
  planId: GenericId.GenericId("medicationPlans"),
  sortOrder: Schema.Number,
  entrySource: Schema.Literal(
    "own-prescription",
    "external-prescription",
    "self-medication",
    "imported-plan",
  ),
  basedOnMedicationOrderId: Schema.optional(GenericId.GenericId("medicationOrders")),
  productCode: Schema.optional(Schema.String),
  displayName: Schema.String,
  activeIngredientText: Schema.optional(Schema.String),
  strengthText: Schema.optional(Schema.String),
  doseFormText: Schema.optional(Schema.String),
  dosageText: Schema.optional(Schema.String),
  indicationText: Schema.optional(Schema.String),
  printOnPlan: Schema.Boolean,
  hasBoundSupplementLine: Schema.Boolean,
  supplementLineText: Schema.optional(Schema.String),
  isRecipePreparation: Schema.Boolean,
});
```

Indexes:
- `by_planId_and_sortOrder`

### 6.27 `digaCatalogRefs`

Sources:
- `Verordnungen/VDGA/KBV_ITA_VGEX_Anforderungskatalog_VDGA.pdf.md`
- `DigitaleMuster/eVDGA/Q3_2026/KBV_ITA_VGEX_Technische_Anlage_eVDGA.pdf.md`

Purpose:
- normalized DiGA product directory records

Fields:

```ts
export const DigaCatalogRefsFields = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  pzn: Schema.String,
  verordnungseinheitName: Schema.String,
  digaName: Schema.optional(Schema.String),
  digaModulName: Schema.optional(Schema.String),
  statusImVerzeichnis: Schema.optional(Schema.String),
  indikationen: Schema.Array(CodeableConceptValue),
  kontraindikationen: Schema.Array(CodeableConceptValue),
  notIndicatedGenders: Schema.Array(Schema.String),
  ageGroups: Schema.Array(Schema.String),
  usageDurationText: Schema.optional(Schema.String),
  price: Schema.optional(Schema.Number),
  additionalCoCost: Schema.optional(Schema.Number),
  manufacturerName: Schema.optional(Schema.String),
});
```

Indexes:
- `by_pzn`

### 6.28 `digaOrders`

Sources:
- `Verordnungen/VDGA/KBV_ITA_VGEX_Anforderungskatalog_VDGA.pdf.md`
- `DigitaleMuster/eVDGA/eVDGA_Beispieldaten_V1.2.zip.extracted/EVDGA_Bundle.xml`
- `DigitaleMuster/eVDGA/Q3_2026/KBV_ITA_VGEX_Technische_Anlage_eVDGA.pdf.md`

Purpose:
- canonical DiGA prescription order

Fields:

```ts
export const DigaOrdersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  coverageId: GenericId.GenericId("coverages"),
  practitionerId: GenericId.GenericId("practitioners"),
  organizationId: GenericId.GenericId("organizations"),
  digaCatalogRefId: GenericId.GenericId("digaCatalogRefs"),
  authoredOn: IsoDateTime,
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  serFlag: Schema.optional(Schema.Boolean),
  legalBasisCode: Schema.optional(Schema.String),
  artifactDocumentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
});
```

Indexes:
- `by_patientId_and_authoredOn`
- `by_digaCatalogRefId`

### 6.29 `heilmittelCatalogRefs`

Sources:
- `Verordnungen/Heilmittel/EXT_ITA_VGEX_Anforderungskatalog_Heilmittel.pdf.md`
- `Stammdateien/SDHM/SDHM_V2.10.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDHM.pdf.md`
- `Stammdateien/SDHMA/SDHMA_V1.30.zip.extracted/Dokumentation/KBV_ITA_VGEX_Schnittstelle_SDHMA.pdf.md`

Purpose:
- normalized Heilmittel catalog and BVB/LHM metadata

Fields:

```ts
export const HeilmittelCatalogRefsFields = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  heilmittelbereich: Schema.String,
  diagnosegruppe: Schema.String,
  heilmittelCode: Schema.String,
  displayName: Schema.String,
  isVorrangig: Schema.Boolean,
  isErgaenzend: Schema.Boolean,
  positionsnummern: Schema.Array(Schema.String),
  orientierendeBehandlungsmenge: Schema.optional(Schema.Number),
  blankoEligible: Schema.optional(Schema.Boolean),
  specialNeedText: Schema.optional(Schema.String),
  longTermNeedText: Schema.optional(Schema.String),
});
```

Indexes:
- `by_heilmittelbereich_and_heilmittelCode`
- `by_diagnosegruppe`

### 6.30 `heilmittelApprovals`

Sources:
- `Verordnungen/Heilmittel/EXT_ITA_VGEX_Anforderungskatalog_Heilmittel.pdf.md`

Purpose:
- patient-specific long-term approvals and similar authorization documents

Fields:

```ts
export const HeilmittelApprovalsFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  approvalType: Schema.Literal("long-term", "special-need", "other"),
  validFrom: Schema.optional(IsoDate),
  validTo: Schema.optional(IsoDate),
  icdCodes: Schema.Array(Schema.String),
  diagnosegruppen: Schema.Array(Schema.String),
  heilmittelCodes: Schema.Array(Schema.String),
  issuerDisplay: Schema.optional(Schema.String),
  artifactId: Schema.optional(GenericId.GenericId("artifacts")),
});
```

Indexes:
- `by_patientId_and_validTo`

### 6.31 `heilmittelOrders`

Sources:
- `Verordnungen/Heilmittel/EXT_ITA_VGEX_Anforderungskatalog_Heilmittel.pdf.md`
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`

Purpose:
- canonical Heilmittel prescription

Fields:

```ts
export const HeilmittelOrdersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  coverageId: GenericId.GenericId("coverages"),
  practitionerId: GenericId.GenericId("practitioners"),
  organizationId: GenericId.GenericId("organizations"),
  issueDate: IsoDate,
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  diagnosegruppe: Schema.String,
  heilmittelbereich: Schema.String,
  vorrangigeHeilmittelCodes: Schema.Array(Schema.String),
  ergaenzendeHeilmittelCodes: Schema.Array(Schema.String),
  standardisierteKombinationCode: Schema.optional(Schema.String),
  verordnungsmenge: Schema.optional(Schema.Number),
  frequenzText: Schema.optional(Schema.String),
  hausbesuch: Schema.optional(Schema.Boolean),
  therapiebericht: Schema.optional(Schema.Boolean),
  specialNeedFlag: Schema.optional(Schema.Boolean),
  longTermNeedFlag: Schema.optional(Schema.Boolean),
  blankoFlag: Schema.optional(Schema.Boolean),
  approvalId: Schema.optional(GenericId.GenericId("heilmittelApprovals")),
  stornoDate: Schema.optional(IsoDate),
  artifactDocumentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
});
```

Indexes:
- `by_patientId_and_issueDate`
- `by_diagnosegruppe`

### 6.32 `formDefinitions`

Sources:
- `Blankoformulare/KBV_ITA_VGEX_Technisches_Handbuch_BFB.pdf.md`
- `Abrechnung/KBV_ITA_VGEX_Anforderungskatalog_Formularbedruckung.pdf.md`
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_BFB.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_DiMus.pdf.md`

Purpose:
- registry of supported KBV forms and their paper / blanko / digital realization mode

Fields:

```ts
export const FormDefinitionsFields = Schema.Struct({
  formCode: Schema.String,
  displayName: Schema.String,
  theme: Schema.Literal("bfb", "dimus", "heilmittel", "billing", "other"),
  deliveryMode: Schema.Literal(
    "blanko-print",
    "digital-pdfa",
    "fhir-document",
    "mixed",
  ),
  templatePackageId: Schema.optional(GenericId.GenericId("masterDataPackages")),
  requiresBarcode: Schema.Boolean,
  requiresBfbCertification: Schema.Boolean,
  requiresDigitaleMusterCertification: Schema.Boolean,
  active: Schema.Boolean,
});
```

Indexes:
- `by_formCode`
- `by_theme_and_active`

### 6.33 `formInstances`

Sources:
- `Blankoformulare/KBV_ITA_VGEX_Technisches_Handbuch_BFB.pdf.md`
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`
- `Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_BFB.pdf.md`

Purpose:
- issued or draft form business root for BFB and digitale/paper form workflows

Fields:

```ts
export const FormInstancesFields = Schema.Struct({
  patientId: Schema.optional(GenericId.GenericId("patients")),
  encounterId: Schema.optional(GenericId.GenericId("encounters")),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  formDefinitionId: GenericId.GenericId("formDefinitions"),
  subjectKind: Schema.Literal(
    "referral",
    "heilmittel",
    "billing",
    "eau",
    "prescription-print",
    "other",
  ),
  subjectId: Schema.optional(Schema.String),
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  issueDate: IsoDate,
  issuerPractitionerRoleId: Schema.optional(
    GenericId.GenericId("practitionerRoles"),
  ),
  issuingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  renderContextArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  outputArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
});
```

Indexes:
- `by_patientId_and_issueDate`
- `by_formDefinitionId_and_status`

### 6.34 `clinicalDocuments`

Sources:
- `371-Schnittstellen/Verordnungssoftware-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_SST_VoS.pdf.md`
- `DigitaleMuster/KBV_ITA_VGEX_Technisches_Handbuch_DiMus.pdf.md`
- `Blankoformulare/KBV_ITA_VGEX_Technisches_Handbuch_BFB.pdf.md`
- `Verordnungen/Arzneimittel/BMP/EXT_ITA_VGEX_BMP_Anlage3.pdf.md`
- `371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_AW_SST.pdf.md`

Purpose:
- logical document root for any issued or imported business document

Fields:

```ts
export const ClinicalDocumentsFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  kind: Schema.Literal(
    "erp",
    "evdga",
    "eau",
    "heilmittel",
    "bfb-form",
    "bmp-plan",
    "vos",
    "tss",
    "archive-import",
    "other",
  ),
  originInterface: Schema.String,
  currentRevisionNo: Schema.Number,
  status: Schema.Literal(
    "draft",
    "final",
    "cancelled",
    "superseded",
    "imported",
  ),
});
```

Indexes:
- `by_patientId_and_kind`

### 6.35 `documentRevisions`

Sources:
- `DigitaleMuster/ERP/Q3_2026/eRP_Beispiele_V1.4.zip.extracted/Beispiel_10_1.xml`
- `DigitaleMuster/eAU/eAU_Beispiele_V1.2.zip.extracted/EEAU0_3f6e664d-2bfc-4eb7-9dc1-29ab73259e92.xml`
- `371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_AW_SST.pdf.md`

Purpose:
- immutable revisions belonging to a logical document

Fields:

```ts
export const DocumentRevisionsFields = Schema.Struct({
  documentId: GenericId.GenericId("clinicalDocuments"),
  revisionNo: Schema.Number,
  status: Schema.Literal(
    "draft",
    "final",
    "cancelled",
    "superseded",
    "imported",
  ),
  effectiveDate: IsoDateTime,
  authorPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  authorOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  replacesRevisionId: Schema.optional(GenericId.GenericId("documentRevisions")),
  summary: Schema.Struct({
    title: Schema.optional(Schema.String),
    formCode: Schema.optional(Schema.String),
    externalIdentifier: Schema.optional(Schema.String),
  }),
});
```

Indexes:
- `by_documentId_and_revisionNo`

### 6.36 `artifacts`

Sources:
- `371-Schnittstellen/Verordnungssoftware-Schnittstelle/KBV_ITA_VGEX_FAQ_SST_VoS.pdf.md`
- `371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_AW_SST.pdf.md`
- `Abrechnung/eEB/KBV_ITA_VGEX_Technische_Anlage_eEB.pdf.md`
- `TSS/3_0_0/KBV_ITA_AHEX_Pruefpaket_116117_Terminservice_Abr.pdf.md`

Purpose:
- exact immutable payloads for inbound and outbound exchange

Fields:

```ts
export const ArtifactsFields = Schema.Struct({
  ownerKind: Schema.Literal(
    "documentRevision",
    "billingCase",
    "eebInboxItem",
    "masterDataPackage",
    "integrationJob",
  ),
  ownerId: Schema.String,
  direction: Schema.Literal("inbound", "outbound", "internal"),
  artifactFamily: Schema.String,
  artifactSubtype: Schema.String,
  profileVersion: Schema.optional(Schema.String),
  transportKind: Schema.String,
  contentType: Schema.String,
  attachment: AttachmentRefValue,
  externalIdentifier: Schema.optional(Schema.String),
  validationStatus: Schema.Literal("pending", "valid", "invalid"),
  validationSummary: Schema.optional(Schema.String),
  immutableAt: IsoDateTime,
});
```

Indexes:
- `by_ownerKind_and_ownerId`
- `by_artifactFamily_and_validationStatus`
- `by_externalIdentifier`

### 6.37 `integrationJobs`

Sources:
- `371-Schnittstellen/Verordnungssoftware-Schnittstelle/KBV_ITA_VGEX_Anforderungskatalog_SST_VoS.pdf.md`
- `Abrechnung/eEB/KBV_ITA_VGEX_Technische_Anlage_eEB.pdf.md`
- `TSS/3_0_0/Spezifikation 116117 Terminservice - Abrechnungsinformation_V1.0.2.pdf.md`

Purpose:
- outbox/inbox workflow state for every integration

Fields:

```ts
export const IntegrationJobsFields = Schema.Struct({
  jobType: Schema.String,
  ownerKind: Schema.String,
  ownerId: Schema.String,
  direction: Schema.Literal("inbound", "outbound"),
  status: Schema.Literal("queued", "running", "waiting", "failed", "done"),
  idempotencyKey: Schema.String,
  selectedProfileId: Schema.optional(GenericId.GenericId("interfaceProfiles")),
  payloadArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  attemptCount: Schema.Number,
  nextAttemptAt: Schema.optional(IsoDateTime),
  counterparty: Schema.optional(Schema.String),
});
```

Indexes:
- `by_jobType_and_status`
- `by_ownerKind_and_ownerId`
- `by_idempotencyKey`

### 6.38 `integrationEvents`

Sources:
- same as `integrationJobs`

Purpose:
- immutable workflow event log

Fields:

```ts
export const IntegrationEventsFields = Schema.Struct({
  jobId: GenericId.GenericId("integrationJobs"),
  eventType: Schema.String,
  occurredAt: IsoDateTime,
  message: Schema.optional(Schema.String),
  artifactId: Schema.optional(GenericId.GenericId("artifacts")),
  externalCorrelationId: Schema.optional(Schema.String),
});
```

Indexes:
- `by_jobId_and_occurredAt`

### 6.39 `draftWorkspaces`

Sources:
- indirect from all mutable document workflows; required platform table, not a KBV wire format

Purpose:
- user-editable draft state isolated from immutable issued records

Fields:

```ts
export const DraftWorkspacesFields = Schema.Struct({
  ownerKind: Schema.String,
  ownerId: Schema.String,
  workflowKind: Schema.String,
  status: Schema.Literal("open", "abandoned", "promoted"),
  snapshot: Schema.Unknown,
  schemaVersion: Schema.Number,
  lastTouchedAt: IsoDateTime,
  lastTouchedBy: Schema.String,
});
```

Indexes:
- `by_ownerKind_and_ownerId`
- `by_workflowKind_and_status`

### 6.40 `confect/schema.ts` assembly rule

The final DB assembly must look structurally like this:

```ts
import { DatabaseSchema } from "@confect/server";

export default DatabaseSchema.make()
  .addTable(InterfaceProfiles)
  .addTable(MasterDataPackages)
  .addTable(Organizations)
  .addTable(PracticeLocations)
  .addTable(Practitioners)
  .addTable(PractitionerRoles)
  .addTable(TiIdentities)
  .addTable(KimMailboxes)
  .addTable(Patients)
  .addTable(PatientIdentifiers)
  .addTable(Coverages)
  .addTable(VsdSnapshots)
  .addTable(EebInboxItems)
  .addTable(Appointments)
  .addTable(Encounters)
  .addTable(Referrals)
  .addTable(Diagnoses)
  .addTable(IcdCatalogEntries)
  .addTable(CodingEvaluations)
  .addTable(BillingCases)
  .addTable(BillingLineItems)
  .addTable(MedicationCatalogRefs)
  .addTable(HousePharmacyItems)
  .addTable(MedicationOrders)
  .addTable(MedicationPlans)
  .addTable(MedicationPlanEntries)
  .addTable(DigaCatalogRefs)
  .addTable(DigaOrders)
  .addTable(HeilmittelCatalogRefs)
  .addTable(HeilmittelApprovals)
  .addTable(HeilmittelOrders)
  .addTable(FormDefinitions)
  .addTable(FormInstances)
  .addTable(ClinicalDocuments)
  .addTable(DocumentRevisions)
  .addTable(Artifacts)
  .addTable(IntegrationJobs)
  .addTable(IntegrationEvents)
  .addTable(DraftWorkspaces);
```

## 7. Confect Function and Ref Layout

Public Confect modules:

- `patients.*`
- `coverages.*`
- `vsd.*`
- `billing.*`
- `coding.*`
- `appointments.*`
- `referrals.*`
- `prescriptions.*`
- `heilmittel.*`
- `documents.*`
- `drafts.*`
- `catalog.*`
- `integration.*`

Internal Confect modules:

- `integration.profileRegistry.*`
- `integration.fhir.*`
- `integration.kvdt.*`
- `integration.kim.*`
- `integration.tss.*`
- `integration.validation.*`
- `views.*`

Rules:

- All public/internal functions are Confect functions with `Effect Schema` args and returns.
- Refs from generated Confect refs are the only calling surface.
- There is no parallel validator system for function args and returns.
- The same schema values drive DB, functions, and adapters.
- Transport-standard-shaped APIs remain internal. The app boundary stays domain-shaped.

## 8. Interface Implementation Plan

### 8.1 VSD / eGK / eEB

Build first.

Implementation:

1. Read `eGK` or `KVK`, persist immutable `vsdSnapshots`, then update or create `patients`, `patientIdentifiers`, and `coverages`.
2. Preserve all KVDT-relevant insured fields even if the UI does not show them.
3. For `eEB`, poll KIM, verify sender, store inbound artifact, attempt patient match, and only then offer adoption into canonical state.
4. Record whether the quarter already has a card read because `eEB` adoption depends on it.

### 8.2 ICD coding

Build before billing export.

Implementation:

1. Import `SDICD`, `SDKH`, and `SDKRW` via `masterDataPackages`.
2. Persist normalized `icdCatalogEntries`.
3. On every diagnosis mutation, run SDICD plausibility checks and store outcomes in `codingEvaluations`.
4. For case-level or quarterly rules, run SDKRW and store findings separately.
5. UI must support:
   - acute vs dauerdiagnose vs anamnestisch
   - diagnosensicherheit
   - additional hints and cross-links
   - transfer of selected code into billing documentation

### 8.3 KVDT

Build in the first certifiable path.

Implementation:

1. Use `billingCases` and `billingLineItems` as the canonical precursors of `con0`, `adt0`, `sad0`, `sad1`, `sad2`, `sad3`.
2. Keep the original insured data link via `vsdSnapshotId`.
3. Generate immutable export artifacts and validate them headlessly first with the `KVDT` XPM console wrapper.
4. Use `KBV-Pruefassistent` and `XKM` as the packaging and encryption acceptance layer for `.con.xkm` and handoff-ready outputs.
5. Store the exact `.con` or `.con.xkm` file in `artifacts`.
5. Never compute KVDT field values only at export time if the business meaning is known earlier; store them in canonical form.

### 8.4 VoS

Implementation later than the first certifiable path, but keep the schema ready.

Implementation:

1. PVS creates an `Aufruf-Bundle` from canonical patient/practice/coverage/prescription data.
2. Store that bundle as an artifact and serve it via internal FHIR endpoint for the `kID`.
3. Keep the bundle addressable only for the VoS time window.
4. Support `read` and `search` interactions with canonically projected resources.
5. Accept `Speicher-Bundle`, validate it, store raw artifact, and then map its contents into `clinicalDocuments`, `documentRevisions`, `artifacts`, and canonical medication/plan tables.

### 8.5 eRezept / AMV

Implementation:

1. Promote a finalized `medicationOrder` into a `clinicalDocument` revision.
2. Generate `Composition`, `MedicationRequest`, `Medication`, `Patient`, `Practitioner`, `Organization`, and `Coverage` using the version registry and custom Effect-native FHIR schemas.
3. Validate against KBV profile constraints and repo-backed fixtures/oracles.
4. Store XML artifact, token metadata, optional patient print artifact, and any later signed-return artifact.
5. Multiple prescriptions become multiple linked document revisions and artifacts, not one mutable record.

### 8.6 eAU

Implementation:

1. Create eAU document revisions from encounter, diagnoses, practitioner, organization, and coverage data.
2. Support multiple ICD conditions plus AU-specific condition.
3. Store attester / legal signer references separately from prescriber if needed.
4. Emit patient/employer/insurer views as artifacts when required.
5. Preserve storno as new revisions and artifacts.

### 8.7 Blankoformularbedruckung

Implementation:

1. Build `formDefinitions` from the repo-backed Muster catalog and keep certification relevance per form explicit.
2. Keep print rendering separate from business semantics:
   - business facts in canonical tables
   - render context in typed DTOs and `formInstances`
   - exact PDF / print / barcode output in `artifacts`
3. For BFB-capable forms, render exactly according to the BFB template and barcode rules and preserve the issued output artifact immutably.
4. Do not infer BFB render data only from the final PDF; all printed semantics must remain available in canonical tables.

### 8.8 eVDGA

Implementation later than the first certifiable path, but keep the schema ready.

Implementation:

1. Import DiGA directory data into `digaCatalogRefs`.
2. Preserve price, indication, contraindication, and product metadata required for search and statistics.
3. Generate `DeviceRequest`-based bundle for finalized `digaOrders`.
4. Generate patient print artifacts and token artifacts after successful TI placement.

### 8.9 Heilmittel

Implementation:

1. Import `SDHM`, `SDHMA`, and blanko/master data through `masterDataPackages`.
2. Keep patient-specific long-term approvals in `heilmittelApprovals`.
3. During order creation, evaluate diagnosis group, special need, long-term need, and blanko eligibility.
4. Persist the full order semantics in `heilmittelOrders`, not only print text.
5. Build statistics from canonical orders and stored price associations.

### 8.10 TSS

Implementation later than the first certifiable path, but keep the billing seam ready.

Implementation:

1. Model appointment retrieval and booking in `appointments`.
2. Support the UI behaviors expected by the KBV Prüfpaket: listing, filtering, selecting appointments.
3. Map TSS-relevant encounters into `billingCases`.
4. Ensure TSS-related Abrechnungsdateien can be produced from the same KVDT engine.

### 8.11 AW-SST

Implementation later, but design now for it.

Rules:

- Imported archive bundles are authoritative historical artifacts.
- Imported resources may populate canonical tables, but the original artifacts remain primary evidence.
- Do not collapse imported historical revisions into one mutable latest state.

## 9. Confect-Native File and Module Layout

- `confect/schema.ts`
- `confect/tables/primitives.ts`
- `confect/tables/core.ts`
- `confect/tables/billing.ts`
- `confect/tables/prescribing.ts`
- `confect/tables/forms.ts`
- `confect/tables/integration.ts`
- `convex/**` only for runtime-exposed modules used by Confect, not as the source of schema truth
- `src/domain/*`
- `src/fhir-r4-effect/base/*`
- `src/fhir-r4-effect/resources/*`
- `src/fhir-r4-effect/kbv/*`
- `src/codecs/xml/*`
- `src/codecs/xdt/*`
- `src/codecs/print/*`
- `tools/oracles/*`
- `test/TestConfect.ts`
- `test/property/*`
- `test/oracles/*`

## 10. Delivery Phases

### Phase 0: schema foundation

- implement `confect/schema.ts`
- implement shared primitive schemas
- implement generated refs
- implement `interfaceProfiles`
- implement `masterDataPackages`
- implement artifact storage conventions
- implement `test/TestConfect.ts`
- implement oracle harness skeleton

### Phase 1: certifiable core patient and billing path

- `organizations`
- `practiceLocations`
- `practitioners`
- `practitionerRoles`
- `patients`
- `patientIdentifiers`
- `coverages`
- `vsdSnapshots`
- `billingCases`
- `billingLineItems`
- `diagnoses`
- `icdCatalogEntries`
- `codingEvaluations`
- `formDefinitions`
- KVDT export + validation

### Phase 2: prescribing, BFB forms, and eAU

- `medicationCatalogRefs`
- `medicationOrders`
- `medicationPlans`
- `medicationPlanEntries`
- `heilmittelCatalogRefs`
- `heilmittelApprovals`
- `heilmittelOrders`
- `formInstances`
- `clinicalDocuments`
- `documentRevisions`
- `artifacts`
- `draftWorkspaces`
- BFB renderer and barcode engine
- eAU / eRezept emitters

### Phase 3: optional but prepared exchange and transport tracks

- `kimMailboxes`
- `tiIdentities`
- `eebInboxItems`
- `integrationJobs`
- `integrationEvents`
- `digaCatalogRefs`
- `digaOrders`
- VoS endpoints
- eVDGA emitter
- TSS adapter

### Phase 4: archive and adjacent mandatory interfaces

- AW-SST
- LDT
- eArztbrief
- 1-Click KIM / eDok KIM

## 11. Validation, Testing, and Oracle System

### 11.1 Schema and domain tests

- patient creation from manual input, eGK, and eEB
- immutable `vsdSnapshots`
- billing case creation with and without card read
- diagnosis lifecycle and coding-rule persistence
- BFB form issuance immutability and barcode reproducibility
- revision immutability after issuance

### 11.2 Confect test harness

- use `@confect/test`
- create `test/TestConfect.ts`
- test only through generated refs unless low-level setup requires `DatabaseWriter`
- seed data with Confect services, not ad hoc JSON

### 11.3 Property tests with `fast-check`

Required layers:

- schema encode/decode laws
- canonical domain invariants
- family-specific codec properties
- oracle-backed output properties

Examples:

- use `@effect/schema/Arbitrary` as the default generator source for canonical schemas and reversible DTO schemas
- `Effect Schema` round-trip laws for primitives and canonical DTOs
- medication-order generators constrained to the certifiable eRezept subspace
- KVDT export generators constrained to valid billing cases
- BMP plan generators constrained to supported plan semantics
- shrunk failing seeds persisted as fixtures

Generator rules:

- every schema in `confect/tables/*.ts` should either expose an arbitrary derived via `@effect/schema/Arbitrary` or explicitly document why it does not
- every reversible DTO schema in `src/fhir-r4-effect/*`, `src/codecs/xml/*`, `src/codecs/xdt/*`, and `src/codecs/print/*` should do the same
- prefer schema-derived arbitraries first, then add family-specific combinators for KBV-valid subspaces
- avoid heavy post-generation filtering where possible, because it weakens shrinking and slows long-running oracle tests
- persist shrunk failing cases as fixtures and replay them in CI

### 11.4 Fixture sources

Use repo examples as golden fixtures:

- `DigitaleMuster/ERP/Q3_2026/eRP_Beispiele_V1.4.zip.extracted/*`
- `DigitaleMuster/eVDGA/eVDGA_Beispieldaten_V1.2.zip.extracted/*`
- `DigitaleMuster/eAU/eAU_Beispiele_V1.2.zip.extracted/*`
- `TSS/3_0_0/Daten_Terminservicestelle_V7.2.zip.extracted/*`
- `TSS/3_0_0/VSD_Testfaelle_TSS_ABR_V2.0.zip.extracted/*`
- `Abrechnung/xpm-kvdt-praxis-2026.2.0.zip.extracted/*`
- `Verordnungen/Arzneimittel/BMP/BMP_2.8_Q3_2026/BMP_Beispieldateien_V2.8.zip.extracted/*`
- `Blankoformulare/*`

### 11.5 Entire oracle stack

The oracle stack is not a single validator. It is a layered test system and every layer is required.

Layer 1: local schema laws

- `Effect Schema` decode/encode laws for primitives, canonical DTOs, and reversible transport DTOs
- table field schemas are the input for arbitraries and shrinkers

Layer 2: domain invariants

- revision immutability
- artifact immutability
- patient merge rules
- coverage/vsd adoption rules
- billing-quarter consistency

Layer 3: official example and regression fixtures

- use the extracted example directories in this repo as golden fixtures
- persist shrunk `fast-check` counterexamples as new regression fixtures

Layer 4: official schemas and static package checks

- `BMP` XSDs
- EHD/XSD families
- imported master-data package integrity checks

Layer 5: executable-backed local validators

- shared FHIR `validator_cli`
- `KVDT` XPM
- `KBV-Pruefassistent`
- `XKM`
- later `LDT` XPM and `AW-SST` validator CLI

Layer 6: updater inventory and release pinning

- the official updater inventory determines which archive/version is the current oracle input set
- do not silently float to a newer validator or profile package in CI
- pin every oracle by archive name and effective quarter

`fast-check` should primarily target layers 1, 2, 4, and 5. Layer 6 controls which oracle versions are mounted for a given test run.

### 11.6 Oracle plugin framework

The repo contains not only text documentation, but also validator assets, examples, wrappers, and package structures that should be treated as an oracle layer.

Each family plugin must define:

- `family`
- `inputKind`
- `fixtureRoot`
- `command or wrapper`
- `workingDirectory`
- `expected outputs`
- `report parser`
- `normalization rules`
- `pass/fail rule`

Oracle plugins come in three kinds:

- `executable-backed`
  - a repo-backed shell wrapper, batch file, jar, or validator CLI exists
- `xsd-backed`
  - an official schema exists but no dedicated validator executable was found in the repo
- `fixture-backed`
  - the oracle is built from official examples, deterministic render rules, barcode rules, and regression comparisons

First-wave oracle plugins:

- `KVDT`
  - executable-backed via XPM and Prüfassistent/XKM
- `eAU`
  - executable-backed via the shared FHIR validator CLI and family validation directories
- `eRezept`
  - executable-backed via the shared FHIR validator CLI and family validation directories
- `BFB`
  - fixture-backed using template, barcode, print-position, and render-context checks
- `BMP`
  - xsd-backed plus fixture-backed using official `BMP` schemas and examples
- `Heilmittel`
  - fixture-backed using master-data/rule evaluation and document/print regression tests

Second-wave oracle plugins:

- `VoS`
- `eVDGA`
- `TSS`
- `AW-SST`
- later `LDT`, `eArztbrief`, XML documentation families

### 11.7 Concrete executable links

Use these local wrappers and readmes as the concrete starting points for `tools/oracles/*`.

Shared FHIR validation:

- [Service_zur_Validierung_2.2.0 ReadMe.TXT](/Users/johannes/Code/kbv-mirror/371-Schnittstellen/Verordnungssoftware-Schnittstelle/Service_zur_Validierung_2.2.0.zip.extracted/Service_zur_Validierung_2.2.0/ReadMe.TXT)
  - contains the current `validator_cli_6.7.8.jar` invocation with `-version 4.0.1`
- updater inventory reference: [KBV_ITA_SIEX_Inhalt_Update.pdf.md](/Users/johannes/Code/kbv-mirror/Allgemein/KBV_ITA_SIEX_Inhalt_Update.pdf.md)
  - lists `Service_zur_Validierung_2.2.0.zip`
  - lists `KBV_FHIR_eAU_V1.2.1_zur_Validierung`
  - lists `KBV_FHIR_eRP_V1.4.1_zur_Validierung.zip`
  - lists `KBV_FHIR_eVDGA_V1.2.2_zur_Validierung`

`KVDT` XPM headless validation:

- [StartPruefung.sh](/Users/johannes/Code/kbv-mirror/Abrechnung/xpm-kvdt-praxis-2026.2.0.zip.extracted/XPM_KVDT.Praxis/StartPruefung.sh)
- [TesteAusgaben.sh](/Users/johannes/Code/kbv-mirror/Abrechnung/xpm-kvdt-praxis-2026.2.0.zip.extracted/XPM_KVDT.Praxis/TesteAusgaben.sh)
- [SetVariablen.sh](/Users/johannes/Code/kbv-mirror/Abrechnung/xpm-kvdt-praxis-2026.2.0.zip.extracted/XPM_KVDT.Praxis/SetVariablen.sh)
- updater inventory reference: [KBV_ITA_SIEX_Inhalt_Update.pdf.md](/Users/johannes/Code/kbv-mirror/Allgemein/KBV_ITA_SIEX_Inhalt_Update.pdf.md)
  - lists `xpm-kvdt-praxis-2026.2.0.zip`

`KVDT` packaging and encryption acceptance:

- [Lies_mich_Pruefassistent.txt](/Users/johannes/Code/kbv-mirror/KBV-Software/Pruefassistent/Lies_mich_Pruefassistent.txt)
  - documents `KBV-Pruefassistent_V2026.2.0.jar` and `./StartAssistenten.sh`
- [StartKryptomodul.sh](/Users/johannes/Code/kbv-mirror/KBV-Software/Kryptomodul/xkm-1.44.0.zip.extracted/XKM/StartKryptomodul.sh)
  - wraps `de.kbv.xkm.Main`
- updater inventory reference: [KBV_ITA_SIEX_Inhalt_Update.pdf.md](/Users/johannes/Code/kbv-mirror/Allgemein/KBV_ITA_SIEX_Inhalt_Update.pdf.md)
  - lists `KBV-Pruefassistent_V2026.2.0.jar`
  - lists `xkm-1.44.0.zip`

`AW-SST` local validation:

- [AWS Service README.txt](/Users/johannes/Code/kbv-mirror/371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/AWS_Service_zur_Validierung.zip.extracted/README.txt)
  - contains the `validator_cli_5.2.12.jar` example for `FHIR 4.0.1`
- [Überblick_Validierung.pdf.md](/Users/johannes/Code/kbv-mirror/371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/Beispiele.zip.extracted/Überblick_Validierung.pdf.md)
  - shows the example validator usage pattern and observed warning classes

`LDT` later-track validation:

- [StartPruefung.sh](/Users/johannes/Code/kbv-mirror/Labor/Labordatenkommunikation/XPM-LDK.praxis-2.19.1.zip.extracted/XPM-LDK.praxis/StartPruefung.sh)
- [StartPruefungDigitaleMuster.sh](/Users/johannes/Code/kbv-mirror/Labor/Labordatenkommunikation/XPM-LDK.praxis-2.19.1.zip.extracted/XPM-LDK.praxis/StartPruefungDigitaleMuster.sh)
- [StartPruefungDigitaleMusterVsLDT.sh](/Users/johannes/Code/kbv-mirror/Labor/Labordatenkommunikation/XPM-LDK.praxis-2.19.1.zip.extracted/XPM-LDK.praxis/StartPruefungDigitaleMusterVsLDT.sh)

`BMP` schemas:

- [bmp_V2.7.xsd](/Users/johannes/Code/kbv-mirror/Verordnungen/Arzneimittel/BMP/BMP_V2.7.zip.extracted/bmp_V2.7.xsd)
- updater inventory reference: [KBV_ITA_SIEX_Inhalt_Update.pdf.md](/Users/johannes/Code/kbv-mirror/Allgemein/KBV_ITA_SIEX_Inhalt_Update.pdf.md)
  - lists `BMP_V2.8.zip`

### 11.8 Required validator chain

- FHIR artifacts: custom Effect-native FHIR schemas plus the repo-backed `validator_cli` service, profile fixtures, and family-specific validation directories
- KVDT artifacts:
  - headless structural validation with `xpm-kvdt-praxis`
  - packaging/encryption acceptance with `KBV-Pruefassistent` and `XKM`
- BFB artifacts: golden output comparison against template- and barcode-level expectations
- BMP artifacts: XSD validation plus fixture parity
- Heilmittel and coding master data: package import validation and regression fixtures
- TSS: simulated XML responses plus Prüfpaket flows
- AW-SST: local validator CLI plus fixture parity in the later track

### 11.9 XML strategy

- Use `Effect Schema` for typed XML DTOs.
- Do not rely on a generic tree-to-XML encoder alone for KBV XML.
- Family-specific renderers are mandatory for:
  - namespaces
  - attributes
  - ordering
  - encoding
  - wrapper/archive conventions
- This is mandatory for families such as:
  - `BMP`
  - `Begleitdatei`
  - EHD-based Stammdateien
  - future DMP/QS XML submissions

## 12. Final Design Summary

The system to build is:

- a typed Confect canonical model
- with immutable artifacts
- explicit revision handling
- explicit insured-data snapshots
- explicit billing roots
- explicit coding support
- explicit TI/KIM identity state
- explicit BFB/digital form handling
- explicit prescribing families for Arzneimittel and Heilmittel in the core path
- optional but prepared prescribing family for DiGA
- a custom Effect-native FHIR layer
- typed XML/xDT/print codecs
- a repo-backed oracle and property-testing workflow

This is the shape most likely to stay compatible with the repo’s KBV obligations while fitting a modern Confect, Effect Schema, and TypeScript implementation style.

