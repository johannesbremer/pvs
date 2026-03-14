import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import fc from "fast-check";

import { ensureBmpAssets, findFileRecursive } from "../tools/oracles/assets";
import { runExecutableBmpOracleEffect } from "../tools/oracles/bmp/run";
import { fileSystem } from "../tools/oracles/platform";
import { resolveOracleTestCache } from "./oracle-test-cache";
import { ORACLE_PROPERTY_NUM_RUNS, ORACLE_TEST_TIMEOUT } from "./timeouts";

describe("executable BMP oracle", () => {
  it.effect(
    "validates an official KBV BMP XML example with reusable BMP assets",
    () =>
      Effect.gen(function* () {
        const { cacheDir, usesSharedCache } = yield* resolveOracleTestCache({
          assetIds: ["bmp_2_8_q3_2026", "bmpExamples_2_8_q3_2026"],
          tempPrefix: "kbv-bmp-cache-",
        });

        try {
          const assets = yield* ensureBmpAssets({ cacheDir });
          const officialBmpExample = yield* findFileRecursive(
            assets.bmpExamplesDir,
            (entryPath: string) => entryPath.endsWith(".xml"),
          );

          expect(officialBmpExample).toBeDefined();
          if (!officialBmpExample) {
            throw new Error("expected official BMP example");
          }

          const xmlBytes = yield* fileSystem.readFile(officialBmpExample);
          const result = yield* runExecutableBmpOracleEffect({
            cacheDir,
            xmlBytes,
          });

          expect(
            result.passed,
            `BMP validation should pass.\ncacheDir=${cacheDir}\nexample=${officialBmpExample}\n${JSON.stringify(result, null, 2)}`,
          ).toBe(true);
        } finally {
          if (!usesSharedCache) {
            yield* fileSystem.remove(cacheDir, {
              force: true,
              recursive: true,
            });
          }
        }
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "rejects common structural corruptions of an official BMP example",
    () =>
      Effect.gen(function* () {
        const { cacheDir, usesSharedCache } = yield* resolveOracleTestCache({
          assetIds: ["bmp_2_8_q3_2026", "bmpExamples_2_8_q3_2026"],
          tempPrefix: "kbv-bmp-prop-cache-",
        });

        try {
          const assets = yield* ensureBmpAssets({ cacheDir });
          const officialBmpExample = yield* findFileRecursive(
            assets.bmpExamplesDir,
            (entryPath: string) => entryPath.endsWith(".xml"),
          );

          expect(officialBmpExample).toBeDefined();
          if (!officialBmpExample) {
            throw new Error("expected official BMP example");
          }

          const exampleXml =
            yield* fileSystem.readFileString(officialBmpExample);

          yield* Effect.tryPromise(() =>
            fc.assert(
              fc.asyncProperty(
                fc.constantFrom<BmpExecutableMutation>(
                  ...bmpExecutableMutations,
                ),
                (mutation) =>
                  Effect.runPromise(
                    Effect.gen(function* () {
                      // Arrange
                      const mutatedXml = mutation.mutate(exampleXml);

                      // Act
                      const result = yield* runExecutableBmpOracleEffect({
                        cacheDir,
                        xml: mutatedXml,
                      });

                      // Assert
                      expect(
                        result.passed,
                        `BMP validator unexpectedly accepted ${mutation.id}.\n${JSON.stringify(result, null, 2)}`,
                      ).toBe(false);
                    }),
                  ),
              ),
              { numRuns: ORACLE_PROPERTY_NUM_RUNS },
            ),
          );
        } finally {
          if (!usesSharedCache) {
            yield* fileSystem.remove(cacheDir, {
              force: true,
              recursive: true,
            });
          }
        }
      }),
    ORACLE_TEST_TIMEOUT,
  );
});

// Helpers

type BmpExecutableMutation = {
  readonly id: string;
  readonly mutate: (xml: string) => string;
};

const bmpExecutableMutations: readonly BmpExecutableMutation[] = [
  {
    id: "invalid-root-version",
    mutate: (xml) =>
      replaceRequiredSubstring(xml, '<MP v="028"', '<MP v="999"'),
  },
  {
    id: "missing-patient-egk",
    mutate: (xml) => removeRequiredSubstring(xml, ' egk="B987563276"'),
  },
  {
    id: "invalid-patient-birthdate",
    mutate: (xml) =>
      replaceRequiredSubstring(xml, ' b="19361213"', ' b="1936-12-13"'),
  },
  {
    id: "missing-practice-lanr",
    mutate: (xml) => removeRequiredSubstring(xml, ' lanr="123456667"'),
  },
  {
    id: "invalid-practice-timestamp",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        ' t="2026-07-01T12:00:00"',
        ' t="not-a-timestamp"',
      ),
  },
  {
    id: "missing-medication-form",
    mutate: (xml) => removeRequiredSubstring(xml, ' f="Tabl"'),
  },
  {
    id: "invalid-medication-dose-unit",
    mutate: (xml) => replaceRequiredSubstring(xml, ' du="1"', ' du="invalid"'),
  },
];

const replaceRequiredSubstring = (
  xml: string,
  expected: string,
  replacement: string,
) => {
  if (!xml.includes(expected)) {
    throw new Error(`expected BMP XML to contain ${expected}`);
  }

  return xml.replace(expected, replacement);
};

const removeRequiredSubstring = (xml: string, expected: string) =>
  replaceRequiredSubstring(xml, expected, "");
