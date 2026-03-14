import { createJiti } from "jiti";
import { Effect } from "effect";

const jiti = createJiti(import.meta.url);

void Effect.runPromise(
  Effect.gen(function* () {
    const {
      collectOfficialKbvInventoryFindings,
      officialKbvCorpusInventory,
      officialKbvXmlCorpusEntries,
    } = yield* Effect.promise(() =>
      jiti.import("./official-corpus-inventory.ts"),
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          findings: collectOfficialKbvInventoryFindings(),
          inventoryVersion: 1,
          totalAssets: officialKbvCorpusInventory.length,
          xmlCorpusAssets: officialKbvXmlCorpusEntries.length,
          entries: officialKbvCorpusInventory,
        },
        null,
        2,
      )}\n`,
    );
  }),
);
