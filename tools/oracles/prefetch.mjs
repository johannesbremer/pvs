import { createJiti } from "jiti";
import { Effect } from "effect";

const jiti = createJiti(import.meta.url);
const timestamp = () => new Date().toISOString();
const log = (message) =>
  process.stderr.write(`[prefetch ${timestamp()}] ${message}\n`);

void Effect.runPromise(
  Effect.gen(function* () {
    const {
      ensureFhirValidatorDependencyCache,
      kbvOracleAssets,
      prefetchKbvOracleAssets,
    } = yield* Effect.promise(() => jiti.import("./assets.ts"));

    const args = process.argv.slice(2);
    const shouldPrefetchFhirDependencies = args.includes("--fhir-dependencies");
    const requestedAssetIds = args.filter(
      (arg) => arg !== "--fhir-dependencies",
    );
    const assetIds =
      requestedAssetIds.length > 0
        ? requestedAssetIds
        : Object.keys(kbvOracleAssets);

    if (shouldPrefetchFhirDependencies) {
      log("warming shared FHIR dependency cache");
      yield* ensureFhirValidatorDependencyCache({});
      log("shared FHIR dependency cache ready");
    }

    const results = [];

    for (const assetId of assetIds) {
      const asset = kbvOracleAssets[assetId];
      log(`prefetching asset ${assetId} (${asset.fileName})`);
      const [result] = yield* prefetchKbvOracleAssets({
        assetIds: [assetId],
      });
      results.push(result);
      log(`asset ready ${assetId}`);
    }

    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  }),
);
