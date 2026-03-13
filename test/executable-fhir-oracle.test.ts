import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureExtractedAsset, kbvOracleAssets } from "../tools/oracles/assets";
import {
  runExecutableFhirOracle,
  toBatchValidationSourcePathKey,
} from "../tools/oracles/fhir/run";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { force: true, recursive: true });
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

  it("downloads validator assets and validates an official KBV eAU example from an empty cache", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "kbv-fhir-exec-test-"));
    tempDirs.push(cacheDir);

    const examplesDir = await ensureExtractedAsset(
      kbvOracleAssets.kbvEauExamples_1_2,
      cacheDir,
    );
    const exampleXml = await readFile(
      join(examplesDir, "EEAU0_3f6e664d-2bfc-4eb7-9dc1-29ab73259e92.xml"),
      "utf8",
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
    const cacheDir = join(process.cwd(), ".cache", "kbv-oracles");

    const examplesDir = await ensureExtractedAsset(
      kbvOracleAssets.kbvErpExamples_1_4,
      cacheDir,
    );
    const exampleXml = await readFile(
      join(examplesDir, "Beispiel_19.xml"),
      "utf8",
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
