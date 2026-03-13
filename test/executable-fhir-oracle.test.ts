import { afterEach, describe, expect, it } from "vitest";

import { ensureExtractedAsset, kbvOracleAssets } from "../tools/oracles/assets";
import {
  reconcileBatchValidationSummarySourcePaths,
  runExecutableFhirOracle,
  toBatchValidationSourcePathKey,
} from "../tools/oracles/fhir/run";
import { fileSystem, path, runEffect } from "../tools/oracles/platform";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const tempDir of tempDirs.splice(0)) {
    await runEffect(
      fileSystem.remove(tempDir, { force: true, recursive: true }),
    );
  }
});

describe("executable FHIR oracle", () => {
  it("normalizes batch validation source paths so accented filenames match across platforms", () => {
    const macStyle = "/tmp/Beispiel_69_Kombipra\u0308parat.xml";
    const linuxStyle = "/tmp/Beispiel_69_Kombipr\u00E4parat.xml";

    expect(macStyle).not.toBe(linuxStyle);
    expect(toBatchValidationSourcePathKey(macStyle)).toBe(
      toBatchValidationSourcePathKey(linuxStyle),
    );
  });

  it("reconciles batch validation summary paths against the original input order", () => {
    const xmlPaths = ["/tmp/Beispiel_69_Kombipr\u00E4parat.xml"];

    const summaries = reconcileBatchValidationSummarySourcePaths({
      summaries: [
        {
          errorCount: 0,
          noteCount: 5,
          passed: true,
          rawSection: "Success: 0 errors, 9 warnings, 5 notes",
          sourcePath: "/tmp/Beispiel_69_Kombipr\uFFC3\uFFA4parat.xml",
          summaryLine: "Success: 0 errors, 9 warnings, 5 notes",
          warningCount: 9,
        },
      ],
      xmlPaths,
    });

    expect(summaries[0]?.sourcePath).toBe(
      toBatchValidationSourcePathKey(xmlPaths[0]),
    );
  });

  it("downloads validator assets and validates an official KBV eAU example from an empty cache", async () => {
    const cacheDir = await runEffect(
      fileSystem.makeTempDirectory({ prefix: "kbv-fhir-exec-test-" }),
    );
    tempDirs.push(cacheDir);

    const examplesDir = await ensureExtractedAsset(
      kbvOracleAssets.kbvEauExamples_1_2,
      cacheDir,
    );
    const exampleXml = await runEffect(
      fileSystem.readFileString(
        path.join(
          examplesDir,
          "EEAU0_3f6e664d-2bfc-4eb7-9dc1-29ab73259e92.xml",
        ),
      ),
    );

    const result = await runExecutableFhirOracle({
      cacheDir,
      family: "eAU",
      xml: exampleXml,
    });

    expect(result.passed).toBe(true);
    expect(
      result.findings.filter((finding) => finding.severity === "error"),
    ).toHaveLength(0);
  }, 420_000);

  it("validates an official KBV eRezept rendered-dosage example with the warmed validator cache", async () => {
    const cacheDir = path.join(process.cwd(), ".cache", "kbv-oracles");

    const examplesDir = await ensureExtractedAsset(
      kbvOracleAssets.kbvErpExamples_1_4,
      cacheDir,
    );
    const exampleXml = await runEffect(
      fileSystem.readFileString(path.join(examplesDir, "Beispiel_19.xml")),
    );

    const result = await runExecutableFhirOracle({
      cacheDir,
      family: "eRezept",
      xml: exampleXml,
    });

    expect(result.passed).toBe(true);
    expect(
      result.findings.filter((finding) => finding.severity === "error"),
    ).toHaveLength(0);
  }, 120_000);
});
