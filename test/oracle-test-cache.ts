import { Effect } from "effect";

import { getKbvOracleCacheDir, kbvOracleAssets } from "../tools/oracles/assets";

export const resolveOracleTestCache = ({
  assetIds: _assetIds,
  needsFhirDependencies: _needsFhirDependencies = false,
  tempPrefix: _tempPrefix,
}: {
  assetIds: readonly (keyof typeof kbvOracleAssets)[];
  needsFhirDependencies?: boolean;
  tempPrefix: string;
}) =>
  Effect.succeed({
    cacheDir: getKbvOracleCacheDir(),
    usesSharedCache: true,
  } as const);
