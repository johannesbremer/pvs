import { describe, expect, it } from "vitest";

import { ensureBmpAssets } from "../tools/oracles/assets";
import { runExecutableBmpOracle } from "../tools/oracles/bmp/run";
import { fileSystem, path, runEffect } from "../tools/oracles/platform";

const cacheDir = path.join(process.cwd(), ".cache", "kbv-oracles");

describe("official BMP fixture sweeps", () => {
  it("validates all official BMP XML examples shipped with the KBV example archive", async () => {
    const assets = await ensureBmpAssets({ cacheDir });
    const entries = await runEffect(
      fileSystem.readDirectory(assets.bmpExamplesDir),
    );
    const xmlFixtures = entries
      .filter((entry) => entry.endsWith(".xml"))
      .sort();

    expect(xmlFixtures.length).toBeGreaterThan(0);

    for (const fixtureName of xmlFixtures) {
      const xmlBytes = await runEffect(
        fileSystem.readFile(path.join(assets.bmpExamplesDir, fixtureName)),
      );
      const result = await runExecutableBmpOracle({
        cacheDir,
        xmlBytes,
      });

      expect(
        result.passed,
        `BMP fixture ${fixtureName} should validate successfully.\n${JSON.stringify(result, null, 2)}`,
      ).toBe(true);
    }
  }, 420_000);
});
