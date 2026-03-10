const { kbvOracleAssets, prefetchKbvOracleAssets } = await import("./assets.ts");

const requestedAssetIds = process.argv.slice(2);
const assetIds =
  requestedAssetIds.length > 0
    ? requestedAssetIds
    : Object.keys(kbvOracleAssets);

const results = await prefetchKbvOracleAssets({
  assetIds,
});

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
