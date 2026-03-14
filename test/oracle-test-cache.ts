import { Effect } from "effect";

import {
  getFhirPackageCacheRoot,
  getKbvOracleCacheDir,
  kbvOracleAssets,
} from "../tools/oracles/assets";
import { fileSystem, path } from "../tools/oracles/platform";

export const resolveOracleTestCache = Effect.fn("tests.resolveOracleTestCache")(
  function* ({
    assetIds,
    needsFhirDependencies = false,
    tempPrefix,
  }: {
    assetIds: readonly (keyof typeof kbvOracleAssets)[];
    needsFhirDependencies?: boolean;
    tempPrefix: string;
  }) {
    const sharedCacheDir = getKbvOracleCacheDir();
    const sharedDownloadsReady = yield* Effect.forEach(assetIds, (assetId) => {
      const asset = kbvOracleAssets[assetId];
      return Effect.gen(function* () {
        const hasDownload = yield* fileSystem.exists(
          path.join(sharedCacheDir, "downloads", asset.fileName),
        );

        if (hasDownload || !("extract" in asset) || asset.extract !== true) {
          return hasDownload;
        }

        return yield* fileSystem.exists(
          path.join(sharedCacheDir, "extracted", asset.assetId, ".ok"),
        );
      });
    });
    const sharedFhirDependenciesReady = needsFhirDependencies
      ? yield* fileSystem.exists(getFhirPackageCacheRoot(sharedCacheDir))
      : true;

    if (sharedDownloadsReady.every(Boolean) && sharedFhirDependenciesReady) {
      return {
        cacheDir: sharedCacheDir,
        usesSharedCache: true,
      } as const;
    }

    return {
      cacheDir: yield* fileSystem.makeTempDirectory({ prefix: tempPrefix }),
      usesSharedCache: false,
    } as const;
  },
);
