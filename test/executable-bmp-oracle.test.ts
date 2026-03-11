import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ensureBmpAssets, findFileRecursive } from "../tools/oracles/assets";
import { runExecutableBmpOracle } from "../tools/oracles/bmp/run";

describe("executable BMP oracle", () => {
  it("downloads BMP assets and validates an official KBV BMP XML example from an empty cache", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "kbv-bmp-cache-"));

    try {
      const assets = await ensureBmpAssets({ cacheDir });
      const officialBmpExample = await findFileRecursive(
        assets.bmpExamplesDir,
        (entryPath) => entryPath.endsWith(".xml"),
      );

      expect(officialBmpExample).toBeDefined();

      const xmlBytes = await readFile(officialBmpExample!);
      const result = await runExecutableBmpOracle({
        cacheDir,
        xmlBytes,
      });

      expect(
        result.passed,
        `Cold-start BMP validation should pass.\ncacheDir=${cacheDir}\nexample=${officialBmpExample}\n${JSON.stringify(result, null, 2)}`,
      ).toBe(true);
    } finally {
      await rm(cacheDir, { force: true, recursive: true });
    }
  }, 420_000);
});
