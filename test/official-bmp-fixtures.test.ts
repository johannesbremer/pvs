import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { ensureBmpAssets } from "../tools/oracles/assets";
import { runExecutableBmpOracleEffect } from "../tools/oracles/bmp/run";
import { fileSystem, path } from "../tools/oracles/platform";

const cacheDir = path.join(process.cwd(), ".cache", "kbv-oracles");

describe("official BMP fixture sweeps", () => {
  it.effect(
    "validates all official BMP XML examples shipped with the KBV example archive",
    () =>
      Effect.gen(function* () {
        const assets = yield* ensureBmpAssets({ cacheDir });
        const entries = yield* fileSystem.readDirectory(assets.bmpExamplesDir);
        const xmlFixtures = entries
          .filter((entry) => entry.endsWith(".xml"))
          .sort();

        expect(xmlFixtures.length).toBeGreaterThan(0);

        for (const fixtureName of xmlFixtures) {
          const xmlBytes = yield* fileSystem.readFile(
            path.join(assets.bmpExamplesDir, fixtureName),
          );
          const result = yield* runExecutableBmpOracleEffect({
            cacheDir,
            xmlBytes,
          });

          expect(
            result.passed,
            `BMP fixture ${fixtureName} should validate successfully.\n${JSON.stringify(result, null, 2)}`,
          ).toBe(true);
        }
      }),
    420_000,
  );
});
