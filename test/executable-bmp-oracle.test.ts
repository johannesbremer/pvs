import { describe, expect, it } from "vitest";

import { ensureBmpAssets, findFileRecursive } from "../tools/oracles/assets";
import { runExecutableBmpOracle } from "../tools/oracles/bmp/run";
import { fileSystem, runEffect } from "../tools/oracles/platform";

describe("executable BMP oracle", () => {
  it("downloads BMP assets and validates an official KBV BMP XML example from an empty cache", async () => {
    const cacheDir = await runEffect(
      fileSystem.makeTempDirectory({ prefix: "kbv-bmp-cache-" }),
    );

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
        `Cold-start BMP validation should pass.\ncacheDir=${cacheDir}\nexample=${officialBmpExample}\n${JSON.stringify(result, null, 2)}`,
      ).toBe(true);
    } finally {
      await runEffect(
        fileSystem.remove(cacheDir, { force: true, recursive: true }),
      );
    }
  }, 420_000);
});
