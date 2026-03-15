import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { ensureKvdtAssets } from "../tools/oracles/assets";
import { runExecutableKvdtOracleEffect } from "../tools/oracles/kvdt/run";
import { fileSystem, path } from "../tools/oracles/platform";
import { resolveOracleTestCache } from "./oracle-test-cache";
import { formatOracleExecutionResult } from "./schema-json";
import { ORACLE_TEST_TIMEOUT } from "./timeouts";

describe("executable KVDT oracle", () => {
  it.effect(
    "validates an official KBV .con example with reusable KVDT assets",
    () =>
      Effect.gen(function* () {
        const { cacheDir, usesSharedCache } = yield* resolveOracleTestCache({
          assetIds: [
            "xpmKvdtPraxis_2026_2_1",
            "xkm_1_44_0",
            "xkmPublicKeys_2026_02",
            "xkmTestKeys_2026_02",
            "kbvPruefassistent_2026_2_1",
          ],
          tempPrefix: "kbv-kvdt-cache-",
        });
        const validationExit = yield* Effect.exit(
          Effect.gen(function* () {
            const assets = yield* ensureKvdtAssets({ cacheDir });
            const officialConPath = path.join(
              assets.xpmDir,
              "XPM_KVDT.Praxis",
              "Daten",
              "Z30123456699_27.04.2026_12.00.con",
            );
            const officialCon = yield* fileSystem.readFile(officialConPath);

            const result = yield* runExecutableKvdtOracleEffect({
              cacheDir,
              payloadBytes: officialCon,
              payloadFileName: "Z30123456699_27.04.2026_12.00.con",
            });

            expect(
              result.passed,
              `KVDT validation should pass.\ncacheDir=${cacheDir}\n${formatOracleExecutionResult(result)}`,
            ).toBe(true);
            expect(
              result.findings.some(
                (finding) => finding.code === "KVDT_VALIDATION_OK",
              ),
              `KVDT validation should report a structured success finding.\ncacheDir=${cacheDir}\n${formatOracleExecutionResult(result)}`,
            ).toBe(true);
            expect(
              result.findings.some(
                (finding) =>
                  finding.code === "KVDT_PRUEFASSISTENT_INSTALLER_READY",
              ),
              `KVDT validation should report the cached KBV-Pruefassistent installer.\ncacheDir=${cacheDir}\n${formatOracleExecutionResult(result)}`,
            ).toBe(true);
          }),
        );

        if (!usesSharedCache && validationExit._tag === "Success") {
          yield* fileSystem.remove(cacheDir, {
            force: true,
            recursive: true,
          });
        }

        return yield* validationExit;
      }),
    ORACLE_TEST_TIMEOUT,
  );
});
