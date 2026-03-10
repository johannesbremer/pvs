import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ensureKvdtAssets } from "../tools/oracles/assets";
import { runExecutableKvdtOracle } from "../tools/oracles/kvdt/run";

describe("executable KVDT oracle", () => {
  it(
    "downloads KVDT assets and validates an official KBV .con example from an empty cache",
    async () => {
      const cacheDir = await mkdtemp(join(tmpdir(), "kbv-kvdt-cache-"));
      let shouldCleanup = true;

      try {
        const assets = await ensureKvdtAssets({ cacheDir });
        const officialConPath = join(
          assets.xpmDir,
          "XPM_KVDT.Praxis",
          "Daten",
          "Z30123456699_27.04.2026_12.00.con",
        );
        const officialCon = await readFile(officialConPath);

        const result = await runExecutableKvdtOracle({
          payloadBytes: officialCon,
          payloadFileName: "Z30123456699_27.04.2026_12.00.con",
          cacheDir,
        });

        expect(
          result.passed,
          `Cold-start KVDT validation should pass.\ncacheDir=${cacheDir}\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
        expect(
          result.findings.some(
            (finding) => finding.code === "KVDT_VALIDATION_OK",
          ),
          `Cold-start KVDT validation should report a structured success finding.\ncacheDir=${cacheDir}\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
        expect(
          result.findings.some(
            (finding) => finding.code === "KVDT_PRUEFASSISTENT_INSTALLER_READY",
          ),
          `Cold-start KVDT validation should report the cached KBV-Pruefassistent installer.\ncacheDir=${cacheDir}\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
      } catch (error) {
        shouldCleanup = false;
        throw error;
      } finally {
        if (shouldCleanup) {
          await rm(cacheDir, { recursive: true, force: true });
        }
      }
    },
    420_000,
  );
});
