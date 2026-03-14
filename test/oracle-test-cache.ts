import {
  getFhirPackageCacheRoot,
  getKbvOracleCacheDir,
  kbvOracleAssets,
} from "../tools/oracles/assets";
import { fileSystem, path, runEffect } from "../tools/oracles/platform";

export const resolveOracleTestCache = async ({
  assetIds,
  needsFhirDependencies = false,
  tempPrefix,
}: {
  assetIds: readonly (keyof typeof kbvOracleAssets)[];
  needsFhirDependencies?: boolean;
  tempPrefix: string;
}) => {
  const sharedCacheDir = getKbvOracleCacheDir();
  const sharedDownloadsReady = await Promise.all(
    assetIds.map(async (assetId) => {
      const asset = kbvOracleAssets[assetId];
      const hasDownload = await runEffect(
        fileSystem.exists(
          path.join(sharedCacheDir, "downloads", asset.fileName),
        ),
      );

      if (hasDownload || !("extract" in asset) || asset.extract !== true) {
        return hasDownload;
      }

      return runEffect(
        fileSystem.exists(
          path.join(sharedCacheDir, "extracted", asset.assetId, ".ok"),
        ),
      );
    }),
  );
  const sharedFhirDependenciesReady = needsFhirDependencies
    ? await runEffect(
        fileSystem.exists(getFhirPackageCacheRoot(sharedCacheDir)),
      )
    : true;

  if (sharedDownloadsReady.every(Boolean) && sharedFhirDependenciesReady) {
    return {
      cacheDir: sharedCacheDir,
      usesSharedCache: true,
    } as const;
  }

  return {
    cacheDir: await runEffect(
      fileSystem.makeTempDirectory({ prefix: tempPrefix }),
    ),
    usesSharedCache: false,
  } as const;
};
