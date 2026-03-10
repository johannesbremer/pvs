import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensureExtractedAsset,
  kbvOracleAssets,
} from "../tools/oracles/assets";
import { runExecutableFhirOracle } from "../tools/oracles/fhir/run";

const tempDirs: Array<string> = [];

afterEach(async () => {
  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe("executable FHIR oracle", () => {
  it(
    "downloads validator assets and validates an official KBV eAU example from an empty cache",
    async () => {
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
        family: "eAU",
        xml: exampleXml,
        cacheDir,
      });

      expect(result.passed).toBe(true);
      expect(
        result.findings.filter((finding) => finding.severity === "error"),
      ).toHaveLength(0);
    },
    180_000,
  );
});
