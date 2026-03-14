import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { ensureBmpAssets, findFileRecursive } from "../tools/oracles/assets";
import { runExecutableBmpOracle } from "../tools/oracles/bmp/run";
import { fileSystem, runEffect } from "../tools/oracles/platform";
import { resolveOracleTestCache } from "./oracle-test-cache";

describe("executable BMP oracle", () => {
  it.effect(
    "validates an official KBV BMP XML example with reusable BMP assets",
    () =>
      Effect.promise(async () => {
        const { cacheDir, usesSharedCache } = await resolveOracleTestCache({
          assetIds: ["bmp_2_8_q3_2026", "bmpExamples_2_8_q3_2026"],
          tempPrefix: "kbv-bmp-cache-",
        });

        try {
          const assets = await ensureBmpAssets({ cacheDir });
          const officialBmpExample = await findFileRecursive(
            assets.bmpExamplesDir,
            (entryPath) => entryPath.endsWith(".xml"),
          );

          expect(officialBmpExample).toBeDefined();

          const xmlBytes = await runEffect(
            fileSystem.readFile(officialBmpExample!),
          );
          const result = await runExecutableBmpOracle({
            cacheDir,
            xmlBytes,
          });

          expect(
            result.passed,
            `BMP validation should pass.\ncacheDir=${cacheDir}\nexample=${officialBmpExample}\n${JSON.stringify(result, null, 2)}`,
          ).toBe(true);
        } finally {
          if (!usesSharedCache) {
            await runEffect(
              fileSystem.remove(cacheDir, { force: true, recursive: true }),
            );
          }
        }
      }),
    420_000,
  );
});
