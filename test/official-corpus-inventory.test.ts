import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

import { kbvOracleAssets } from "../tools/oracles/assets";
import {
  collectOfficialKbvInventoryFindings,
  officialKbvCorpusInventory,
  officialKbvCorpusInventoryByAssetId,
  officialKbvXmlCorpusEntries,
} from "../tools/oracles/official-corpus-inventory";

const KBV_MIRROR_ROOT = "/Users/johannes/Code/kbv-mirror";

describe("official KBV corpus inventory", () => {
  it("should inventory every pinned update.kbv.de asset exactly once and keep the safety contract intact", () => {
    // Arrange
    const findings = collectOfficialKbvInventoryFindings();

    // Act
    const assetCount = Object.keys(kbvOracleAssets).length;

    // Assert
    expect(officialKbvCorpusInventory).toHaveLength(assetCount);
    expect(findings.duplicateAssetIds).toHaveLength(0);
    expect(findings.missingAssetIds).toHaveLength(0);
    expect(findings.unknownAssetIds).toHaveLength(0);
    expect(findings.unsafeSourceAssetIds).toHaveLength(0);
    expect(findings.unpinnedAssetIds).toHaveLength(0);
    expect(findings.invalidRequiredAssetReferences).toHaveLength(0);
    expect(findings.invalidReferenceProgramAssetReferences).toHaveLength(0);
  });

  it("should require every official XML corpus to declare a non-manual validation path", () => {
    // Arrange
    const findings = collectOfficialKbvInventoryFindings();

    // Act
    const xmlCorpusAssetIds = officialKbvXmlCorpusEntries.map(
      (entry) => entry.assetId,
    );

    // Assert
    expect(xmlCorpusAssetIds).toEqual([
      "bmpExamples_2_8_q3_2026",
      "kbvEauExamples_1_2",
      "kbvErpExamples_1_4",
      "tssResponseExamples_7_2",
      "tssTestpatientXml_2025_07_14",
      "tssVsdTestfaelle_2_0",
    ]);
    expect(findings.xmlCorpusWithoutValidation).toHaveLength(0);
    expect(findings.executableCorpusWithoutReferencePrograms).toHaveLength(0);
  });

  it("should keep the key corpus-to-validator bindings aligned with the current oracle setup", () => {
    // Arrange
    const eauExamples = officialKbvCorpusInventoryByAssetId.kbvEauExamples_1_2;
    const erpExamples = officialKbvCorpusInventoryByAssetId.kbvErpExamples_1_4;
    const bmpExamples =
      officialKbvCorpusInventoryByAssetId.bmpExamples_2_8_q3_2026;
    const kvdtPackage =
      officialKbvCorpusInventoryByAssetId.xpmKvdtPraxis_2026_2_1;
    const tssResponses =
      officialKbvCorpusInventoryByAssetId.tssResponseExamples_7_2;

    // Act
    const keyBindings = {
      bmp: bmpExamples.validationMode,
      eau: eauExamples.validationMode,
      erp: erpExamples.validationMode,
      kvdt: kvdtPackage.validationMode,
      tss: tssResponses.validationMode,
    };

    // Assert
    expect(keyBindings).toEqual({
      bmp: "executable-xsd",
      eau: "executable-fhir",
      erp: "executable-fhir",
      kvdt: "executable-xpm-xkm",
      tss: "fixture-backed-local",
    });
    expect(eauExamples.referenceProgramAssetIds).toEqual([
      "fhirValidatorService_2_2_0",
    ]);
    expect(erpExamples.referenceProgramAssetIds).toEqual([
      "fhirValidatorService_2_2_0",
    ]);
    expect(bmpExamples.requiredAssetIds).toEqual(["bmp_2_8_q3_2026"]);
    expect(kvdtPackage.referenceProgramAssetIds).toEqual([
      "kbvPruefassistent_2026_2_1",
      "xkm_1_44_0",
    ]);
    expect(tssResponses.requiredAssetIds).toEqual([
      "tssTestpatientXml_2025_07_14",
      "tssVsdTestfaelle_2_0",
    ]);
  });

  it("should keep the current high-value executable backlog from the local KBV mirror explicit", () => {
    // Arrange
    if (!existsSync(KBV_MIRROR_ROOT)) {
      return;
    }

    const trackedExecutableFamilyKeys = new Set(
      Object.values(kbvOracleAssets)
        .map((asset) => toExecutableFamilyKey(asset.fileName))
        .filter(
          (familyKey): familyKey is ExecutableFamilyKey => familyKey !== null,
        ),
    );
    const mirrorCandidateExists = highValueMirrorExecutableCandidates.map(
      (candidate) => existsSync(join(KBV_MIRROR_ROOT, candidate.relativePath)),
    );

    // Act
    const missingExecutableCandidates =
      highValueMirrorExecutableCandidates.filter(
        (candidate) => !trackedExecutableFamilyKeys.has(candidate.familyKey),
      );

    // Assert
    expect(mirrorCandidateExists).toEqual(
      highValueMirrorExecutableCandidates.map(() => true),
    );
    expect(missingExecutableCandidates).toEqual(
      highValueMirrorExecutableCandidates,
    );
  });
});

// Helpers

type ExecutableFamilyKey =
  | "aw-sst-validator"
  | "dmp-asthma-xpm"
  | "dmp-brustkrebs-xpm"
  | "dmp-copd-xpm"
  | "dmp-depression-xpm"
  | "dmp-diabetes1-xpm"
  | "dmp-diabetes2-xpm"
  | "dmp-herzinsuffizienz-xpm"
  | "dmp-khk-xpm"
  | "dmp-osteoporose-xpm"
  | "dmp-rheuma-xpm"
  | "dmp-rueckenschmerz-xpm"
  | "ehks-xpm"
  | "fhir-evdga-validator"
  | "fhir-validator-service"
  | "kvdt-xpm"
  | "ldt-kv-xpm"
  | "ldt-praxis-xpm"
  | "xkm";

interface MirrorExecutableCandidate {
  readonly familyKey: ExecutableFamilyKey;
  readonly relativePath: string;
}

const highValueMirrorExecutableCandidates: readonly MirrorExecutableCandidate[] =
  [
    {
      familyKey: "fhir-evdga-validator",
      relativePath:
        "DigitaleMuster/eVDGA/KBV_FHIR_eVDGA_V1.2.2_zur_Validierung.zip.extracted",
    },
    {
      familyKey: "aw-sst-validator",
      relativePath:
        "371-Schnittstellen/PVS-Archivierungs-Wechsel-Schnittstelle/AWS_Service_zur_Validierung.zip.extracted",
    },
    {
      familyKey: "ldt-praxis-xpm",
      relativePath:
        "Labor/Labordatenkommunikation/XPM-LDK.praxis-2.19.1.zip.extracted",
    },
    {
      familyKey: "ldt-kv-xpm",
      relativePath:
        "Labor/Labordatenkommunikation/XPM-LDK.KV-2.19.1.zip.extracted",
    },
    {
      familyKey: "dmp-asthma-xpm",
      relativePath:
        "Medizinische-Dokumentationen/Asthma/xpm-dmp-asthma-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-brustkrebs-xpm",
      relativePath:
        "Medizinische-Dokumentationen/Brustkrebs/xpm-dmp-bkr-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-copd-xpm",
      relativePath:
        "Medizinische-Dokumentationen/COPD/xpm-dmp-copd-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-depression-xpm",
      relativePath:
        "Medizinische-Dokumentationen/Depression/xpm-dmp-depression-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-diabetes1-xpm",
      relativePath:
        "Medizinische-Dokumentationen/Diabetes_m1_m2/xpm-dmp-dm1-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-diabetes2-xpm",
      relativePath:
        "Medizinische-Dokumentationen/Diabetes_m1_m2/xpm-dmp-dm2-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-herzinsuffizienz-xpm",
      relativePath:
        "Medizinische-Dokumentationen/Herzinsuffizienz/xpm-dmp-his-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-khk-xpm",
      relativePath:
        "Medizinische-Dokumentationen/KHK/xpm-dmp-khk-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-osteoporose-xpm",
      relativePath:
        "Medizinische-Dokumentationen/Osteoporose/xpm-dmp-osteoporose-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-rheuma-xpm",
      relativePath:
        "Medizinische-Dokumentationen/Rheumatoide-Arthritis/xpm-dmp-rheuma-2026.2.0.zip.extracted",
    },
    {
      familyKey: "dmp-rueckenschmerz-xpm",
      relativePath:
        "Medizinische-Dokumentationen/Rueckenschmerz/xpm-dmp-ruecken-2026.2.0.zip.extracted",
    },
    {
      familyKey: "ehks-xpm",
      relativePath:
        "Medizinische-Dokumentationen/eHKS/xpm-hks-2026.2.0.zip.extracted",
    },
  ] as const;

const toExecutableFamilyKey = (
  fileName: string,
): ExecutableFamilyKey | null => {
  const normalizedFileName = basename(fileName).replace(/\.extracted$/, "");

  if (/^AWS_Service_zur_Validierung\.zip$/u.test(normalizedFileName)) {
    return "aw-sst-validator";
  }

  if (
    /^KBV_FHIR_eVDGA_V[\d.]+_zur_Validierung\.zip$/u.test(normalizedFileName)
  ) {
    return "fhir-evdga-validator";
  }

  if (/^Service_zur_Validierung_[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "fhir-validator-service";
  }

  if (/^xpm-kvdt-praxis-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "kvdt-xpm";
  }

  if (/^XPM-LDK\.praxis-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "ldt-praxis-xpm";
  }

  if (/^XPM-LDK\.KV-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "ldt-kv-xpm";
  }

  if (/^xkm-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "xkm";
  }

  if (/^xpm-hks-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "ehks-xpm";
  }

  if (/^xpm-dmp-asthma-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-asthma-xpm";
  }

  if (/^xpm-dmp-bkr-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-brustkrebs-xpm";
  }

  if (/^xpm-dmp-copd-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-copd-xpm";
  }

  if (/^xpm-dmp-depression-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-depression-xpm";
  }

  if (/^xpm-dmp-dm1-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-diabetes1-xpm";
  }

  if (/^xpm-dmp-dm2-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-diabetes2-xpm";
  }

  if (/^xpm-dmp-his-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-herzinsuffizienz-xpm";
  }

  if (/^xpm-dmp-khk-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-khk-xpm";
  }

  if (/^xpm-dmp-osteoporose-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-osteoporose-xpm";
  }

  if (/^xpm-dmp-rheuma-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-rheuma-xpm";
  }

  if (/^xpm-dmp-ruecken-[\d.]+\.zip$/u.test(normalizedFileName)) {
    return "dmp-rueckenschmerz-xpm";
  }

  return null;
};
