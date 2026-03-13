import { Schema } from "effect";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  runExecutableFhirOracle,
  runExecutableFhirValidationBatch,
  toBatchValidationSourcePathKey,
} from "../tools/oracles/fhir/run";
import { OracleExecutionResultFields } from "../tools/oracles/types";

const cacheDir = join(process.cwd(), ".cache", "kbv-oracles");
const evdgaExamplesDir = join(
  "/Users/johannes/Code/kbv-mirror",
  "DigitaleMuster",
  "eVDGA",
  "eVDGA_Beispieldaten_V1.2.zip.extracted",
);

describe("official eVDGA fixture sweeps", () => {
  it("validates the official non-negative eVDGA XML examples with the executable oracle", async () => {
    // Arrange
    const entries = await readdir(evdgaExamplesDir).catch(() => []);
    if (entries.length === 0) {
      return;
    }

    const xmlExamples = entries
      .filter((entry) => entry.endsWith(".xml"))
      .filter((entry) => !entry.includes("negativer_Testfall"))
      .sort();

    expect(xmlExamples.length).toBeGreaterThan(5);
    const xmlPaths = xmlExamples.map((exampleName) =>
      join(evdgaExamplesDir, exampleName),
    );

    // Act
    const result = await runExecutableFhirValidationBatch({
      cacheDir,
      family: "eVDGA",
      xmlPaths,
    });
    const summaries = new Map(
      result.summaries.map((summary) => [
        toBatchValidationSourcePathKey(summary.sourcePath),
        summary,
      ]),
    );

    for (const exampleName of xmlExamples) {
      const xmlPath = toBatchValidationSourcePathKey(
        join(evdgaExamplesDir, exampleName),
      );
      const summary = summaries.get(xmlPath);

      // Assert
      expect(
        summary,
        `eVDGA example ${exampleName} should appear in the batch validator output.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      ).toBeDefined();
      expect(
        summary?.errorCount,
        `eVDGA example ${exampleName} should validate without error findings.\nSECTION:\n${summary?.rawSection ?? "<missing>"}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      ).toBe(0);
      expect(
        summary?.passed,
        `eVDGA example ${exampleName} should pass executable validation.\nSECTION:\n${summary?.rawSection ?? "<missing>"}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      ).toBe(true);
    }
  }, 1_200_000);

  it("fails the official negative eVDGA XML example with the executable oracle", async () => {
    // Arrange
    const xml = await readFile(
      join(evdgaExamplesDir, "EVDGA_Bundle_PKV_negativer_Testfall.xml"),
      "utf8",
    ).catch(() => undefined);
    if (!xml) {
      return;
    }

    // Act
    const result = Schema.decodeUnknownSync(OracleExecutionResultFields)(
      await runExecutableFhirOracle({
        cacheDir,
        family: "eVDGA",
        xml,
      }),
    );

    // Assert
    expect(result.passed).toBe(false);
    expect(
      result.findings.filter((finding) => finding.severity === "error"),
    ).not.toHaveLength(0);
  }, 300_000);
});
