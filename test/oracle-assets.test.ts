import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  downloadManagedAsset,
  getAssetCacheEntry,
  getKbvOracleCacheManifestPath,
} from "../tools/oracles/assets";

const tempDirs: Array<string> = [];

afterEach(async () => {
  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe("oracle asset downloader", () => {
  it("downloads an asset into the cache and verifies its SHA-256", async () => {
    const payload = Buffer.from("kbv-test-payload");
    const sha256 = createHash("sha256").update(payload).digest("hex");
    const tempDir = await mkdtemp(join(tmpdir(), "kbv-asset-test-"));
    tempDirs.push(tempDir);
    const downloadedPath = await downloadManagedAsset(
      {
        assetId: "test-asset",
        url: `data:application/octet-stream;base64,${payload.toString("base64")}`,
        fileName: "asset.bin",
        sha256,
      },
      tempDir,
    );

    const downloaded = await readFile(downloadedPath);
    expect(downloaded.equals(payload)).toBe(true);

    const manifestContent = await readFile(
      getKbvOracleCacheManifestPath(tempDir),
      "utf8",
    );
    expect(manifestContent).toContain("test-asset");

    const cacheEntry = await getAssetCacheEntry({
      assetId: "test-asset",
      cacheDir: tempDir,
    });
    expect(cacheEntry?.downloadPath).toBe(downloadedPath);
  });
});
