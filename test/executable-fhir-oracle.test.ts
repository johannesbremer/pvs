import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { ensureExtractedAsset, kbvOracleAssets } from "../tools/oracles/assets";
import {
  reconcileBatchValidationSummarySourcePaths,
  runExecutableFhirOracleEffect,
  toBatchValidationSourcePathKey,
} from "../tools/oracles/fhir/run";
import { fileSystem, path, runEffect } from "../tools/oracles/platform";
import { resolveOracleTestCache } from "./oracle-test-cache";
import { ORACLE_TEST_TIMEOUT } from "./timeouts";

const tempDirs: string[] = [];

afterEach(() =>
  runEffect(
    Effect.forEach(tempDirs.splice(0), (tempDir) =>
      fileSystem.remove(tempDir, { force: true, recursive: true }),
    ),
  ),
);

describe("executable FHIR oracle", () => {
  it.effect(
    "normalizes batch validation source paths so accented filenames match across platforms",
    () =>
      Effect.sync(() => {
        const macStyle = "/tmp/Beispiel_69_Kombipra\u0308parat.xml";
        const linuxStyle = "/tmp/Beispiel_69_Kombipr\u00E4parat.xml";

        expect(macStyle).not.toBe(linuxStyle);
        expect(toBatchValidationSourcePathKey(macStyle)).toBe(
          toBatchValidationSourcePathKey(linuxStyle),
        );
      }),
  );

  it.effect(
    "reconciles batch validation summary paths against the original input order",
    () =>
      Effect.sync(() => {
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
      }),
  );

  it.effect(
    "validates an official KBV eAU example with reusable validator assets",
    () =>
      Effect.gen(function* () {
        const { cacheDir, usesSharedCache } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvEauExamples_1_2",
            "kbvFhirEau_1_2_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-fhir-exec-test-",
        });
        if (!usesSharedCache) {
          tempDirs.push(cacheDir);
        }

        const examplesDir = yield* ensureExtractedAsset(
          kbvOracleAssets.kbvEauExamples_1_2,
          cacheDir,
        );
        const exampleXml = yield* fileSystem.readFileString(
          path.join(
            examplesDir,
            "EEAU0_3f6e664d-2bfc-4eb7-9dc1-29ab73259e92.xml",
          ),
        );

        const result = yield* runExecutableFhirOracleEffect({
          cacheDir,
          family: "eAU",
          xml: exampleXml,
        });

        expect(
          result.passed,
          `Executable eRezept validation should pass.\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
        expect(
          result.findings.filter((finding) => finding.severity === "error"),
        ).toHaveLength(0);
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "validates an official KBV eRezept rendered-dosage example with reusable validator assets",
    () =>
      Effect.gen(function* () {
        const { cacheDir, usesSharedCache } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-fhir-erp-test-",
        });
        if (!usesSharedCache) {
          tempDirs.push(cacheDir);
        }

        const examplesDir = yield* ensureExtractedAsset(
          kbvOracleAssets.kbvErpExamples_1_4,
          cacheDir,
        );
        const exampleXml = yield* fileSystem.readFileString(
          path.join(examplesDir, "Beispiel_19.xml"),
        );

        const result = yield* runExecutableFhirOracleEffect({
          cacheDir,
          family: "eRezept",
          xml: exampleXml,
        });

        expect(result.passed).toBe(true);
        expect(
          result.findings.filter((finding) => finding.severity === "error"),
        ).toHaveLength(0);
      }),
    ORACLE_TEST_TIMEOUT,
  );
});
