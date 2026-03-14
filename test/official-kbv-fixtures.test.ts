import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  ensureExtractedAsset,
  ensureFhirValidatorDependencyCache,
  kbvOracleAssets,
} from "../tools/oracles/assets";
import {
  runExecutableFhirValidationBatch,
  toBatchValidationSourcePathKey,
} from "../tools/oracles/fhir/run";
import { fileSystem, path, runEffect } from "../tools/oracles/platform";

const cacheDir = path.join(process.cwd(), ".cache", "kbv-oracles");

describe("official KBV fixture sweeps", () => {
  it.effect(
    "validates all official non-error eAU XML examples with the executable oracle",
    () =>
      Effect.promise(async () => {
        const eauExamplesDir = await ensureExtractedAsset(
          kbvOracleAssets.kbvEauExamples_1_2,
          cacheDir,
        );
        const entries = await runEffect(
          fileSystem.readDirectory(eauExamplesDir),
        );
        const xmlExamples = entries
          .filter((entry) => entry.endsWith(".xml"))
          .filter((entry) => !entry.includes("_Fehler_"))
          .sort();

        expect(xmlExamples.length).toBeGreaterThan(5);
        const xmlPaths = xmlExamples.map((exampleName) =>
          path.join(eauExamplesDir, exampleName),
        );
        const result = await runExecutableFhirValidationBatch({
          cacheDir,
          family: "eAU",
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
            path.join(eauExamplesDir, exampleName),
          );
          const summary = summaries.get(xmlPath);

          expect(
            summary,
            `eAU example ${exampleName} should appear in the batch validator output.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
          ).toBeDefined();
          expect(
            summary?.errorCount,
            `eAU example ${exampleName} should validate without errors.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
          ).toBe(0);
          expect(
            summary?.passed,
            `eAU example ${exampleName} should pass.\nSECTION:\n${summary?.rawSection ?? "<missing>"}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
          ).toBe(true);
        }
      }),
    1_200_000,
  );

  it.effect(
    "validates all official eRezept XML examples in the archive with the executable oracle",
    () =>
      Effect.promise(async () => {
        const erpExamplesDir = await ensureExtractedAsset(
          kbvOracleAssets.kbvErpExamples_1_4,
          cacheDir,
        );
        await ensureExtractedAsset(
          kbvOracleAssets.fhirValidatorService_2_2_0,
          cacheDir,
        );
        await ensureExtractedAsset(kbvOracleAssets.kbvFhirErp_1_4_1, cacheDir);
        await ensureFhirValidatorDependencyCache({ cacheDir });

        const entries = await runEffect(
          fileSystem.readDirectory(erpExamplesDir),
        );
        const xmlExamples = entries
          .filter((entry) => entry.endsWith(".xml"))
          .sort();

        expect(xmlExamples.length).toBeGreaterThan(50);

        const xmlPaths = xmlExamples.map((exampleName) =>
          path.join(erpExamplesDir, exampleName),
        );
        const result = await runExecutableFhirValidationBatch({
          cacheDir,
          family: "eRezept",
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
            path.join(erpExamplesDir, exampleName),
          );
          const summary = summaries.get(xmlPath);

          expect(
            summary,
            `eRezept example ${exampleName} should appear in the batch validator output.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
          ).toBeDefined();
          expect(
            summary?.errorCount,
            `eRezept example ${exampleName} should validate without error findings.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
          ).toBe(0);
          expect(
            summary?.passed,
            `eRezept example ${exampleName} should complete with Success: 0 errors.\nSECTION:\n${summary?.rawSection ?? "<missing>"}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
          ).toBe(true);
        }
      }),
    2_400_000,
  );
});
