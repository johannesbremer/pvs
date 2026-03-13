import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  downloadManagedAsset,
  getAssetCacheEntry,
  getFhirRuntimeHomeRoot,
  getKbvOracleCacheManifestPath,
  kbvOracleAssets,
} from "../tools/oracles/assets";
import { fileSystem, runEffect } from "../tools/oracles/platform";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const tempDir of tempDirs.splice(0)) {
    await runEffect(
      fileSystem.remove(tempDir, { force: true, recursive: true }),
    );
  }
});

describe("oracle asset downloader", () => {
  it("pins sha256 digests for the core downloaded KBV assets used in the suite", () => {
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
  });

  it("downloads an asset into the cache and verifies its SHA-256", async () => {
    const payload = Buffer.from("kbv-test-payload");
    const sha256 = createHash("sha256").update(payload).digest("hex");
    const tempDir = await runEffect(
      fileSystem.makeTempDirectory({ prefix: "kbv-asset-test-" }),
    );
    tempDirs.push(tempDir);
    const downloadedPath = await downloadManagedAsset(
      {
        assetId: "test-asset",
        fileName: "asset.bin",
        sha256,
        url: `data:application/octet-stream;base64,${payload.toString("base64")}`,
      },
      tempDir,
    );

    const downloaded = await runEffect(fileSystem.readFile(downloadedPath));
    expect(Buffer.from(downloaded).equals(payload)).toBe(true);

    const manifestContent = await runEffect(
      fileSystem.readFileString(getKbvOracleCacheManifestPath(tempDir)),
    );
    expect(manifestContent).toContain("test-asset");

    const cacheEntry = await getAssetCacheEntry({
      assetId: "test-asset",
      cacheDir: tempDir,
    });
    expect(cacheEntry?.downloadPath).toBe(downloadedPath);
  });

  it("re-downloads a cached asset automatically when the cached hash no longer matches", async () => {
    const payload = Buffer.from("kbv-test-payload");
    const sha256 = createHash("sha256").update(payload).digest("hex");
    const tempDir = await runEffect(
      fileSystem.makeTempDirectory({ prefix: "kbv-asset-test-" }),
    );
    tempDirs.push(tempDir);

    const downloadedPath = await downloadManagedAsset(
      {
        assetId: "test-asset-corruption",
        fileName: "asset.bin",
        sha256,
        url: `data:application/octet-stream;base64,${payload.toString("base64")}`,
      },
      tempDir,
    );

    await runEffect(
      fileSystem.writeFileString(downloadedPath, "corrupted-cache"),
    );

    const redownloadedPath = await downloadManagedAsset(
      {
        assetId: "test-asset-corruption",
        fileName: "asset.bin",
        sha256,
        url: `data:application/octet-stream;base64,${payload.toString("base64")}`,
      },
      tempDir,
    );

    const redownloaded = await runEffect(fileSystem.readFile(redownloadedPath));
    expect(Buffer.from(redownloaded).equals(payload)).toBe(true);
  });

  it("recovers from a malformed asset-cache manifest by rewriting it on the next update", async () => {
    const payload = Buffer.from("kbv-test-payload");
    const sha256 = createHash("sha256").update(payload).digest("hex");
    const tempDir = await runEffect(
      fileSystem.makeTempDirectory({ prefix: "kbv-asset-test-" }),
    );
    tempDirs.push(tempDir);

    await runEffect(
      fileSystem.writeFileString(
        getKbvOracleCacheManifestPath(tempDir),
        '{"broken": true}\n}',
      ),
    );

    const downloadedPath = await downloadManagedAsset(
      {
        assetId: "test-asset-broken-manifest",
        fileName: "asset.bin",
        sha256,
        url: `data:application/octet-stream;base64,${payload.toString("base64")}`,
      },
      tempDir,
    );

    const downloaded = await runEffect(fileSystem.readFile(downloadedPath));
    expect(Buffer.from(downloaded).equals(payload)).toBe(true);

    const cacheEntry = await getAssetCacheEntry({
      assetId: "test-asset-broken-manifest",
      cacheDir: tempDir,
    });
    expect(cacheEntry?.downloadPath).toBe(downloadedPath);
  });

  it("builds a sanitized runtime-home path for isolated FHIR validator workers", () => {
    const runtimeHomeRoot = getFhirRuntimeHomeRoot({
      cacheDir: "/tmp/kbv-cache",
      runtimeKey: "exec/worker:1#eRezept",
    });

    expect(runtimeHomeRoot).toBe(
      "/tmp/kbv-cache/fhir-home-runtimes/exec_worker_1_eRezept",
    );
  });
});
