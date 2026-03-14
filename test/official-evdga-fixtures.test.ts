import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  runExecutableFhirOracleEffect,
  runExecutableFhirValidationBatchEffect,
  toBatchValidationSourcePathKey,
} from "../tools/oracles/fhir/run";
import { fileSystem, path } from "../tools/oracles/platform";
import { OracleExecutionResultFields } from "../tools/oracles/types";
import { ORACLE_TEST_TIMEOUT } from "./timeouts";

const cacheDir = path.join(process.cwd(), ".cache", "kbv-oracles");
const evdgaExamplesDir = path.join(
  "/Users/johannes/Code/kbv-mirror",
  "DigitaleMuster",
  "eVDGA",
  "eVDGA_Beispieldaten_V1.2.zip.extracted",
);

describe("official eVDGA fixture sweeps", () => {
  it.effect(
    "validates the official non-negative eVDGA XML examples with the executable oracle",
    () =>
      Effect.gen(function* () {
        // Arrange
        const entries = yield* fileSystem
          .readDirectory(evdgaExamplesDir)
          .pipe(Effect.catchAll(() => Effect.succeed([])));
        if (entries.length === 0) {
          return;
        }

        const xmlExamples = entries
          .filter((entry) => entry.endsWith(".xml"))
          .filter((entry) => !entry.includes("negativer_Testfall"))
          .sort();

        expect(xmlExamples.length).toBeGreaterThan(5);
        const xmlPaths = xmlExamples.map((exampleName) =>
          path.join(evdgaExamplesDir, exampleName),
        );

        // Act
        const result = yield* runExecutableFhirValidationBatchEffect({
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
            path.join(evdgaExamplesDir, exampleName),
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
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "fails the official negative eVDGA XML example with the executable oracle",
    () =>
      Effect.gen(function* () {
        // Arrange
        const xml = yield* fileSystem
          .readFileString(
            path.join(
              evdgaExamplesDir,
              "EVDGA_Bundle_PKV_negativer_Testfall.xml",
            ),
          )
          .pipe(Effect.catchAll(() => Effect.succeed(undefined)));
        if (!xml) {
          return;
        }

        // Act
        const result = Schema.decodeUnknownSync(OracleExecutionResultFields)(
          yield* runExecutableFhirOracleEffect({
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
      }),
    ORACLE_TEST_TIMEOUT,
  );
});
