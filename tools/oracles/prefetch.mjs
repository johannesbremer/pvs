import { Effect } from "effect";

void Effect.runPromise(
  Effect.gen(function* () {
    const { kbvOracleAssets, prefetchKbvOracleAssets } = yield* Effect.promise(
      () => import("./assets.ts"),
    );

    const requestedAssetIds = process.argv.slice(2);
    const assetIds =
      requestedAssetIds.length > 0
        ? requestedAssetIds
        : Object.keys(kbvOracleAssets);

    const results = yield* prefetchKbvOracleAssets({
      assetIds,
    });

    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  }),
);
