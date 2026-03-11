import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ensureKvdtAssets } from "../tools/oracles/assets";
import { runExecutableKvdtOracle } from "../tools/oracles/kvdt/run";

const cacheDir = join(process.cwd(), ".cache", "kbv-oracles");

describe("official KVDT fixture sweeps", () => {
  it("validates the official positive fixture and rejects the official negative fixtures shipped with the KVDT XPM package", async () => {
    const assets = await ensureKvdtAssets({ cacheDir });
    const fixtureDir = join(assets.xpmDir, "XPM_KVDT.Praxis", "Daten");
    const entries = await readdir(fixtureDir);
    const conFixtures = entries
      .filter((entry) => entry.endsWith(".con"))
      .sort();

    expect(conFixtures.length).toBeGreaterThanOrEqual(3);

    for (const fixtureName of conFixtures) {
      const payloadBytes = await readFile(join(fixtureDir, fixtureName));
      const result = await runExecutableKvdtOracle({
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
        result.findings.some((finding) => finding.code === expectedFindingCode),
      ).toBe(true);
    }
  }, 420_000);
});
