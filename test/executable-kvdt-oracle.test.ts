import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import fc from "fast-check";

import { ensureKvdtAssets } from "../tools/oracles/assets";
import { runExecutableKvdtOracleEffect } from "../tools/oracles/kvdt/run";
import { fileSystem, path } from "../tools/oracles/platform";
import { resolveOracleTestCache } from "./oracle-test-cache";
import { ORACLE_PROPERTY_NUM_RUNS, ORACLE_TEST_TIMEOUT } from "./timeouts";

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
        let shouldCleanup = !usesSharedCache;

        try {
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
            `KVDT validation should pass.\ncacheDir=${cacheDir}\n${JSON.stringify(result, null, 2)}`,
          ).toBe(true);
          expect(
            result.findings.some(
              (finding) => finding.code === "KVDT_VALIDATION_OK",
            ),
            `KVDT validation should report a structured success finding.\ncacheDir=${cacheDir}\n${JSON.stringify(result, null, 2)}`,
          ).toBe(true);
          expect(
            result.findings.some(
              (finding) =>
                finding.code === "KVDT_PRUEFASSISTENT_INSTALLER_READY",
            ),
            `KVDT validation should report the cached KBV-Pruefassistent installer.\ncacheDir=${cacheDir}\n${JSON.stringify(result, null, 2)}`,
          ).toBe(true);
        } catch (error) {
          shouldCleanup = false;
          throw error;
        } finally {
          if (shouldCleanup) {
            yield* fileSystem.remove(cacheDir, {
              force: true,
              recursive: true,
            });
          }
        }
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "rejects common corruptions of an official KVDT .con example",
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
          tempPrefix: "kbv-kvdt-prop-cache-",
        });
        let shouldCleanup = !usesSharedCache;

        try {
          const assets = yield* ensureKvdtAssets({ cacheDir });
          const officialConPath = path.join(
            assets.xpmDir,
            "XPM_KVDT.Praxis",
            "Daten",
            "Z30123456699_27.04.2026_12.00.con",
          );
          const officialCon = yield* fileSystem.readFile(officialConPath);

          yield* Effect.tryPromise(() =>
            fc.assert(
              fc.asyncProperty(
                fc.constantFrom<KvdtExecutableMutation>(
                  ...kvdtExecutableMutations,
                ),
                (mutation) =>
                  Effect.runPromise(
                    Effect.gen(function* () {
                      // Arrange
                      const mutatedPayload = mutation.mutate(officialCon);

                      // Act
                      const result = yield* runExecutableKvdtOracleEffect({
                        cacheDir,
                        payloadBytes: mutatedPayload,
                        payloadFileName: "Z30123456699_27.04.2026_12.00.con",
                      });

                      // Assert
                      expect(
                        result.passed,
                        `KVDT validator unexpectedly accepted ${mutation.id}.\n${JSON.stringify(result, null, 2)}`,
                      ).toBe(false);
                    }),
                  ),
              ),
              { numRuns: ORACLE_PROPERTY_NUM_RUNS },
            ),
          );
        } catch (error) {
          shouldCleanup = false;
          throw error;
        } finally {
          if (shouldCleanup) {
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

// Helpers

type KvdtExecutableMutation = {
  readonly id: string;
  readonly mutate: (payload: Uint8Array) => Uint8Array;
};

const kvdtExecutableMutations: readonly KvdtExecutableMutation[] = [
  {
    id: "truncated-to-64-bytes",
    mutate: (payload) => payload.slice(0, 64),
  },
  {
    id: "truncated-to-256-bytes",
    mutate: (payload) => payload.slice(0, 256),
  },
  {
    id: "invalid-leading-record",
    mutate: (payload) =>
      replaceRequiredBytes(payload, 0, Buffer.from("9999999", "ascii")),
  },
  {
    id: "invalid-header-token",
    mutate: (payload) => replaceRequiredAscii(payload, "hdrg0", "xxxxx"),
  },
  {
    id: "invalid-crlf-record-separator",
    mutate: (payload) => replaceRequiredBytes(payload, 12, new Uint8Array([0])),
  },
];

const replaceRequiredAscii = (
  payload: Uint8Array,
  expected: string,
  replacement: string,
) =>
  replaceRequiredBytes(
    payload,
    findRequiredAscii(payload, expected),
    Buffer.from(replacement, "ascii"),
  );

const findRequiredAscii = (payload: Uint8Array, expected: string) => {
  const haystack = Buffer.from(payload).toString("latin1");
  const index = haystack.indexOf(expected);

  if (index < 0) {
    throw new Error(`expected KVDT payload to contain ${expected}`);
  }

  return index;
};

const replaceRequiredBytes = (
  payload: Uint8Array,
  offset: number,
  replacement: Uint8Array,
) => {
  const result = new Uint8Array(payload);
  result.set(replacement, offset);
  return result;
};
