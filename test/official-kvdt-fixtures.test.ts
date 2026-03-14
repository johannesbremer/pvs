import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { ensureKvdtAssets } from "../tools/oracles/assets";
import { runExecutableKvdtOracleEffect } from "../tools/oracles/kvdt/run";
import { fileSystem, path } from "../tools/oracles/platform";

const cacheDir = path.join(process.cwd(), ".cache", "kbv-oracles");

describe("official KVDT fixture sweeps", () => {
  it.effect(
    "validates the official positive fixture and rejects the official negative fixtures shipped with the KVDT XPM package",
    () =>
      Effect.gen(function* () {
        const assets = yield* ensureKvdtAssets({ cacheDir });
        const fixtureDir = path.join(assets.xpmDir, "XPM_KVDT.Praxis", "Daten");
        const entries = yield* fileSystem.readDirectory(fixtureDir);
        const conFixtures = entries
          .filter((entry) => entry.endsWith(".con"))
          .sort();

        expect(conFixtures.length).toBeGreaterThanOrEqual(3);

        for (const fixtureName of conFixtures) {
          const payloadBytes = yield* fileSystem.readFile(
            path.join(fixtureDir, fixtureName),
          );
          const result = yield* runExecutableKvdtOracleEffect({
            cacheDir,
            payloadBytes,
            payloadFileName: fixtureName,
          });
          const shouldPass = fixtureName.startsWith("Z30");
          const expectedFindingCode = shouldPass
            ? "KVDT_VALIDATION_OK"
            : "KVDT_VALIDATION_FAILED";

          expect(result.passed).toBe(shouldPass);
          expect(
            result.findings.some(
              (finding) => finding.code === expectedFindingCode,
            ),
          ).toBe(true);
        }
      }),
    420_000,
  );
});
