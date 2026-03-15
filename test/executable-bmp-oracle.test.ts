import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { ensureBmpAssets, findFileRecursive } from "../tools/oracles/assets";
import { runExecutableBmpOracleEffect } from "../tools/oracles/bmp/run";
import { fileSystem } from "../tools/oracles/platform";
import { resolveOracleTestCache } from "./oracle-test-cache";
import { formatOracleExecutionResult } from "./schema-json";
import { ORACLE_TEST_TIMEOUT } from "./timeouts";

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
            `BMP validation should pass.\ncacheDir=${cacheDir}\nexample=${officialBmpExample}\n${formatOracleExecutionResult(result)}`,
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
});
