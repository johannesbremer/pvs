import { describe, expect, it } from "vitest";

import { kbvOracleAssets } from "../tools/oracles/assets";
import {
  collectOfficialKbvInventoryFindings,
  officialKbvCorpusInventory,
  officialKbvCorpusInventoryByAssetId,
  officialKbvXmlCorpusEntries,
} from "../tools/oracles/official-corpus-inventory";

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
});
