import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createHash } from "node:crypto";

import {
  downloadManagedAsset,
  getAssetCacheEntry,
  getFhirRuntimeHomeRoot,
  getKbvOracleCacheManifestPath,
  kbvOracleAssets,
} from "../tools/oracles/assets";
import { fileSystem, runEffect } from "../tools/oracles/platform";

const tempDirs: string[] = [];

afterEach(() =>
  runEffect(
    Effect.forEach(tempDirs.splice(0), (tempDir) =>
      fileSystem.remove(tempDir, { force: true, recursive: true }),
    ),
  ),
);

describe("oracle asset downloader", () => {
  it.effect(
    "pins sha256 digests for the core downloaded KBV assets used in the suite",
    () =>
      Effect.sync(() => {
        const pinnedAssetIds = [
          "fhirValidatorService_2_2_0",
          "kbvFhirEau_1_2_1",
          "kbvEauExamples_1_2",
          "kbvFhirErp_1_4_1",
          "kbvErpExamples_1_4",
          "xpmKvdtPraxis_2026_2_1",
          "kbvPruefassistent_2026_2_1",
          "xkm_1_44_0",
          "xkmPublicKeys_2026_02",
          "xkmTestKeys_2026_02",
          "bmp_2_8_q3_2026",
          "bmpExamples_2_8_q3_2026",
          "bfbMuster_2025_11_14",
          "bfbTechnicalHandbook_2025_11_14",
          "bfbPruefpaket_2024_10_04",
          "bfbDirectory_2026_03_10",
        ] as const;

        for (const assetId of pinnedAssetIds) {
          expect(kbvOracleAssets[assetId].sha256).toMatch(/^[a-f0-9]{64}$/);
        }
      }),
  );

  it.effect("downloads an asset into the cache and verifies its SHA-256", () =>
    Effect.gen(function* () {
      const payload = Buffer.from("kbv-test-payload");
      const sha256 = createHash("sha256").update(payload).digest("hex");
      const tempDir = yield* fileSystem.makeTempDirectory({
        prefix: "kbv-asset-test-",
      });
      tempDirs.push(tempDir);
      const downloadedPath = yield* downloadManagedAsset(
        {
          assetId: "test-asset",
          fileName: "asset.bin",
          sha256,
          url: `data:application/octet-stream;base64,${payload.toString("base64")}`,
        },
        tempDir,
      );

      const downloaded = yield* fileSystem.readFile(downloadedPath);
      expect(Buffer.from(downloaded).equals(payload)).toBe(true);

      const manifestContent = yield* fileSystem.readFileString(
        getKbvOracleCacheManifestPath(tempDir),
      );
      expect(manifestContent).toContain("test-asset");

      const cacheEntry = yield* getAssetCacheEntry({
        assetId: "test-asset",
        cacheDir: tempDir,
      });
      expect(cacheEntry?.downloadPath).toBe(downloadedPath);
    }),
  );

  it.effect(
    "re-downloads a cached asset automatically when the cached hash no longer matches",
    () =>
      Effect.gen(function* () {
        const payload = Buffer.from("kbv-test-payload");
        const sha256 = createHash("sha256").update(payload).digest("hex");
        const tempDir = yield* fileSystem.makeTempDirectory({
          prefix: "kbv-asset-test-",
        });
        tempDirs.push(tempDir);

        const downloadedPath = yield* downloadManagedAsset(
          {
            assetId: "test-asset-corruption",
            fileName: "asset.bin",
            sha256,
            url: `data:application/octet-stream;base64,${payload.toString("base64")}`,
          },
          tempDir,
        );

        yield* fileSystem.writeFileString(downloadedPath, "corrupted-cache");

        const redownloadedPath = yield* downloadManagedAsset(
          {
            assetId: "test-asset-corruption",
            fileName: "asset.bin",
            sha256,
            url: `data:application/octet-stream;base64,${payload.toString("base64")}`,
          },
          tempDir,
        );

        const redownloaded = yield* fileSystem.readFile(redownloadedPath);
        expect(Buffer.from(redownloaded).equals(payload)).toBe(true);
      }),
  );

  it.effect(
    "recovers from a malformed asset-cache manifest by rewriting it on the next update",
    () =>
      Effect.gen(function* () {
        const payload = Buffer.from("kbv-test-payload");
        const sha256 = createHash("sha256").update(payload).digest("hex");
        const tempDir = yield* fileSystem.makeTempDirectory({
          prefix: "kbv-asset-test-",
        });
        tempDirs.push(tempDir);

        yield* fileSystem.writeFileString(
          getKbvOracleCacheManifestPath(tempDir),
          '{"broken": true}\n}',
        );

        const downloadedPath = yield* downloadManagedAsset(
          {
            assetId: "test-asset-broken-manifest",
            fileName: "asset.bin",
            sha256,
            url: `data:application/octet-stream;base64,${payload.toString("base64")}`,
          },
          tempDir,
        );

        const downloaded = yield* fileSystem.readFile(downloadedPath);
        expect(Buffer.from(downloaded).equals(payload)).toBe(true);

        const cacheEntry = yield* getAssetCacheEntry({
          assetId: "test-asset-broken-manifest",
          cacheDir: tempDir,
        });
        expect(cacheEntry?.downloadPath).toBe(downloadedPath);
      }),
  );

  it.effect(
    "builds a sanitized runtime-home path for isolated FHIR validator workers",
    () =>
      Effect.sync(() => {
        const runtimeHomeRoot = getFhirRuntimeHomeRoot({
          cacheDir: "/tmp/kbv-cache",
          runtimeKey: "exec/worker:1#eRezept",
        });

        expect(runtimeHomeRoot).toBe(
          "/tmp/kbv-cache/fhir-home-runtimes/exec_worker_1_eRezept",
        );
      }),
  );
});
