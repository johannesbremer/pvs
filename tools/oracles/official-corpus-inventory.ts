import { kbvOracleAssets } from "./assets";

export type KbvOracleAssetId = keyof typeof kbvOracleAssets;

export interface OfficialKbvAssetInventoryEntry {
  readonly assetId: KbvOracleAssetId;
  readonly containsOfficialXmlExamples: boolean;
  readonly family: OfficialKbvFamily;
  readonly referenceProgramAssetIds: readonly KbvOracleAssetId[];
  readonly requiredAssetIds: readonly KbvOracleAssetId[];
  readonly safetyContract: {
    readonly isolatedExtraction: boolean;
    readonly sha256Pinned: boolean;
    readonly sourceHost: "update.kbv.de";
  };
  readonly sweepScope: OfficialKbvSweepScope;
  readonly usageKinds: readonly OfficialKbvAssetUsageKind[];
  readonly validationMode: OfficialKbvValidationMode;
  readonly validationNote: string;
}

export type OfficialKbvAssetUsageKind =
  | "cryptographic-material"
  | "documentation"
  | "example-corpus"
  | "reference-program"
  | "validator-package";

export type OfficialKbvFamily = "BFB" | "BMP" | "FHIR" | "KVDT" | "TSS";

export type OfficialKbvSweepScope =
  | "full-archive"
  | "not-a-corpus"
  | "reference-only"
  | "selected-fixtures"
  | "supporting-fixtures-only";

export type OfficialKbvValidationMode =
  | "executable-fhir"
  | "executable-xpm-xkm"
  | "executable-xsd"
  | "fixture-backed-local"
  | "manual-reference"
  | "not-applicable";

export const officialKbvCorpusInventory: readonly OfficialKbvAssetInventoryEntry[] =
  [
    {
      assetId: "bfbDirectory_2026_03_10",
      containsOfficialXmlExamples: false,
      family: "BFB",
      referenceProgramAssetIds: [],
      requiredAssetIds: [],
      safetyContract: {
        isolatedExtraction: false,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "reference-only",
      usageKinds: ["documentation"],
      validationMode: "manual-reference",
      validationNote:
        "Pinned BFB directory PDF kept as authoritative publication metadata.",
    },
    {
      assetId: "bfbMuster_2025_11_14",
      containsOfficialXmlExamples: false,
      family: "BFB",
      referenceProgramAssetIds: [],
      requiredAssetIds: [],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "selected-fixtures",
      usageKinds: ["example-corpus"],
      validationMode: "fixture-backed-local",
      validationNote:
        "Published BFB Muster corpus anchors local golden layout and barcode checks.",
    },
    {
      assetId: "bfbPruefpaket_2024_10_04",
      containsOfficialXmlExamples: false,
      family: "BFB",
      referenceProgramAssetIds: [],
      requiredAssetIds: ["bfbMuster_2025_11_14"],
      safetyContract: {
        isolatedExtraction: false,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "reference-only",
      usageKinds: ["documentation"],
      validationMode: "manual-reference",
      validationNote:
        "BFB pruefpaket remains a pinned manual reference for fixture interpretation.",
    },
    {
      assetId: "bfbTechnicalHandbook_2025_11_14",
      containsOfficialXmlExamples: false,
      family: "BFB",
      referenceProgramAssetIds: [],
      requiredAssetIds: ["bfbMuster_2025_11_14"],
      safetyContract: {
        isolatedExtraction: false,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "reference-only",
      usageKinds: ["documentation"],
      validationMode: "manual-reference",
      validationNote:
        "BFB technical handbook is pinned as a manual reference for renderer behavior.",
    },
    {
      assetId: "bmp_2_8_q3_2026",
      containsOfficialXmlExamples: false,
      family: "BMP",
      referenceProgramAssetIds: [],
      requiredAssetIds: [],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "supporting-fixtures-only",
      usageKinds: ["validator-package"],
      validationMode: "executable-xsd",
      validationNote:
        "Official BMP XSD package is the authoritative schema input for XML validation.",
    },
    {
      assetId: "bmpExamples_2_8_q3_2026",
      containsOfficialXmlExamples: true,
      family: "BMP",
      referenceProgramAssetIds: [],
      requiredAssetIds: ["bmp_2_8_q3_2026"],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "full-archive",
      usageKinds: ["example-corpus"],
      validationMode: "executable-xsd",
      validationNote:
        "All official BMP XML examples are validated against the pinned BMP XSD package.",
    },
    {
      assetId: "fhirValidatorService_2_2_0",
      containsOfficialXmlExamples: false,
      family: "FHIR",
      referenceProgramAssetIds: [],
      requiredAssetIds: [],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "reference-only",
      usageKinds: ["reference-program"],
      validationMode: "not-applicable",
      validationNote:
        "KBV FHIR validator service provides the official validator_cli runtime used by FHIR corpus sweeps.",
    },
    {
      assetId: "kbvEauExamples_1_2",
      containsOfficialXmlExamples: true,
      family: "FHIR",
      referenceProgramAssetIds: ["fhirValidatorService_2_2_0"],
      requiredAssetIds: ["kbvFhirEau_1_2_1"],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "full-archive",
      usageKinds: ["example-corpus"],
      validationMode: "executable-fhir",
      validationNote:
        "Official eAU example archive is swept through the KBV validator service with the pinned eAU package.",
    },
    {
      assetId: "kbvErpExamples_1_4",
      containsOfficialXmlExamples: true,
      family: "FHIR",
      referenceProgramAssetIds: ["fhirValidatorService_2_2_0"],
      requiredAssetIds: ["kbvFhirErp_1_4_1"],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "full-archive",
      usageKinds: ["example-corpus"],
      validationMode: "executable-fhir",
      validationNote:
        "Official eRezept example archive is swept through the KBV validator service with the pinned eRP package.",
    },
    {
      assetId: "kbvFhirEau_1_2_1",
      containsOfficialXmlExamples: false,
      family: "FHIR",
      referenceProgramAssetIds: ["fhirValidatorService_2_2_0"],
      requiredAssetIds: [],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "supporting-fixtures-only",
      usageKinds: ["validator-package"],
      validationMode: "not-applicable",
      validationNote:
        "Pinned eAU validator package feeds the executable FHIR validation chain.",
    },
    {
      assetId: "kbvFhirErp_1_4_1",
      containsOfficialXmlExamples: false,
      family: "FHIR",
      referenceProgramAssetIds: ["fhirValidatorService_2_2_0"],
      requiredAssetIds: [],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "supporting-fixtures-only",
      usageKinds: ["validator-package"],
      validationMode: "not-applicable",
      validationNote:
        "Pinned eRP validator package feeds the executable FHIR validation chain.",
    },
    {
      assetId: "kbvPruefassistent_2026_2_1",
      containsOfficialXmlExamples: false,
      family: "KVDT",
      referenceProgramAssetIds: [],
      requiredAssetIds: ["xpmKvdtPraxis_2026_2_1"],
      safetyContract: {
        isolatedExtraction: false,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "reference-only",
      usageKinds: ["reference-program"],
      validationMode: "not-applicable",
      validationNote:
        "Pinned Pruefassistent jar is part of the official KVDT validator toolchain.",
    },
    {
      assetId: "tssResponseExamples_7_2",
      containsOfficialXmlExamples: true,
      family: "TSS",
      referenceProgramAssetIds: [],
      requiredAssetIds: [
        "tssTestpatientXml_2025_07_14",
        "tssVsdTestfaelle_2_0",
      ],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "selected-fixtures",
      usageKinds: ["example-corpus"],
      validationMode: "fixture-backed-local",
      validationNote:
        "Official TSS response XML is parsed and checked through the local TSS oracle with pinned companion XML fixtures.",
    },
    {
      assetId: "tssTestpatientXml_2025_07_14",
      containsOfficialXmlExamples: true,
      family: "TSS",
      referenceProgramAssetIds: [],
      requiredAssetIds: ["tssResponseExamples_7_2"],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "supporting-fixtures-only",
      usageKinds: ["example-corpus"],
      validationMode: "fixture-backed-local",
      validationNote:
        "Pinned official TSS patient XML remains reachable as support data for TSS parser and workflow tests.",
    },
    {
      assetId: "tssVsdTestfaelle_2_0",
      containsOfficialXmlExamples: true,
      family: "TSS",
      referenceProgramAssetIds: [],
      requiredAssetIds: ["tssResponseExamples_7_2"],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "supporting-fixtures-only",
      usageKinds: ["example-corpus"],
      validationMode: "fixture-backed-local",
      validationNote:
        "Pinned official TSS VSD XML remains reachable as support data for TSS parser and workflow tests.",
    },
    {
      assetId: "xkm_1_44_0",
      containsOfficialXmlExamples: false,
      family: "KVDT",
      referenceProgramAssetIds: [],
      requiredAssetIds: [
        "xkmPublicKeys_2026_02",
        "xkmTestKeys_2026_02",
        "xpmKvdtPraxis_2026_2_1",
      ],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "reference-only",
      usageKinds: ["reference-program"],
      validationMode: "not-applicable",
      validationNote:
        "Pinned XKM package provides the official encryption step for KVDT packaging.",
    },
    {
      assetId: "xkmPublicKeys_2026_02",
      containsOfficialXmlExamples: false,
      family: "KVDT",
      referenceProgramAssetIds: ["xkm_1_44_0"],
      requiredAssetIds: [],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "reference-only",
      usageKinds: ["cryptographic-material"],
      validationMode: "not-applicable",
      validationNote:
        "Pinned public keys are required inputs for official XKM packaging.",
    },
    {
      assetId: "xkmTestKeys_2026_02",
      containsOfficialXmlExamples: false,
      family: "KVDT",
      referenceProgramAssetIds: ["xkm_1_44_0"],
      requiredAssetIds: [],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "reference-only",
      usageKinds: ["cryptographic-material"],
      validationMode: "not-applicable",
      validationNote:
        "Pinned test keys are required inputs for repeatable KVDT packaging tests.",
    },
    {
      assetId: "xpmKvdtPraxis_2026_2_1",
      containsOfficialXmlExamples: false,
      family: "KVDT",
      referenceProgramAssetIds: ["kbvPruefassistent_2026_2_1", "xkm_1_44_0"],
      requiredAssetIds: ["xkmPublicKeys_2026_02", "xkmTestKeys_2026_02"],
      safetyContract: {
        isolatedExtraction: true,
        sha256Pinned: true,
        sourceHost: "update.kbv.de",
      },
      sweepScope: "full-archive",
      usageKinds: ["example-corpus", "reference-program"],
      validationMode: "executable-xpm-xkm",
      validationNote:
        "Official XPM package ships the validator workflow plus canonical .con fixtures used in KVDT executable sweeps.",
    },
  ] as const;

export const officialKbvCorpusInventoryByAssetId =
  officialKbvCorpusInventory.reduce<
    Partial<Record<KbvOracleAssetId, OfficialKbvAssetInventoryEntry>>
  >((inventory, entry) => {
    inventory[entry.assetId] = entry;
    return inventory;
  }, {}) as Record<KbvOracleAssetId, OfficialKbvAssetInventoryEntry>;

export interface OfficialKbvInventoryFindings {
  readonly duplicateAssetIds: readonly KbvOracleAssetId[];
  readonly executableCorpusWithoutReferencePrograms: readonly KbvOracleAssetId[];
  readonly invalidReferenceProgramAssetReferences: readonly string[];
  readonly invalidRequiredAssetReferences: readonly string[];
  readonly missingAssetIds: readonly KbvOracleAssetId[];
  readonly unknownAssetIds: readonly string[];
  readonly unpinnedAssetIds: readonly KbvOracleAssetId[];
  readonly unsafeSourceAssetIds: readonly KbvOracleAssetId[];
  readonly xmlCorpusWithoutValidation: readonly KbvOracleAssetId[];
}

export const collectOfficialKbvInventoryFindings =
  (): OfficialKbvInventoryFindings => {
    const assetIds = Object.keys(kbvOracleAssets) as KbvOracleAssetId[];
    const inventoryAssetIds = officialKbvCorpusInventory.map(
      (entry) => entry.assetId,
    );
    const inventoryIdSet = new Set(inventoryAssetIds);
    const duplicateAssetIds = inventoryAssetIds.filter(
      (assetId, index) => inventoryAssetIds.indexOf(assetId) !== index,
    );
    const missingAssetIds = assetIds.filter(
      (assetId) => !inventoryIdSet.has(assetId),
    );
    const unknownAssetIds = inventoryAssetIds.filter(
      (assetId) => !(assetId in kbvOracleAssets),
    );
    const unsafeSourceAssetIds = officialKbvCorpusInventory
      .filter(
        (entry) =>
          !kbvOracleAssets[entry.assetId].url.startsWith(
            "https://update.kbv.de/ita-update/",
          ),
      )
      .map((entry) => entry.assetId);
    const unpinnedAssetIds = officialKbvCorpusInventory
      .filter((entry) => kbvOracleAssets[entry.assetId].sha256 === undefined)
      .map((entry) => entry.assetId);
    const invalidRequiredAssetReferences = officialKbvCorpusInventory.flatMap(
      (entry) =>
        entry.requiredAssetIds
          .filter((assetId) => !(assetId in kbvOracleAssets))
          .map((assetId) => `${entry.assetId}:${assetId}`),
    );
    const invalidReferenceProgramAssetReferences =
      officialKbvCorpusInventory.flatMap((entry) =>
        entry.referenceProgramAssetIds
          .filter((assetId) => !(assetId in kbvOracleAssets))
          .map((assetId) => `${entry.assetId}:${assetId}`),
      );
    const xmlCorpusWithoutValidation: KbvOracleAssetId[] = [];
    const executableCorpusWithoutReferencePrograms: KbvOracleAssetId[] = [];

    for (const entry of officialKbvCorpusInventory) {
      if (!entry.containsOfficialXmlExamples) {
        continue;
      }

      if (
        entry.validationMode === "manual-reference" ||
        entry.validationMode === "not-applicable"
      ) {
        xmlCorpusWithoutValidation.push(entry.assetId);
      }

      if (
        (entry.validationMode === "executable-fhir" ||
          entry.validationMode === "executable-xpm-xkm") &&
        entry.referenceProgramAssetIds.length === 0
      ) {
        executableCorpusWithoutReferencePrograms.push(entry.assetId);
      }
    }

    return {
      duplicateAssetIds,
      executableCorpusWithoutReferencePrograms,
      invalidReferenceProgramAssetReferences,
      invalidRequiredAssetReferences,
      missingAssetIds,
      unknownAssetIds,
      unpinnedAssetIds,
      unsafeSourceAssetIds,
      xmlCorpusWithoutValidation,
    };
  };

export const officialKbvXmlCorpusEntries = officialKbvCorpusInventory.filter(
  (entry) => entry.containsOfficialXmlExamples,
);
