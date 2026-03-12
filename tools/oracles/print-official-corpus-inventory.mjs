import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  collectOfficialKbvInventoryFindings,
  officialKbvCorpusInventory,
  officialKbvXmlCorpusEntries,
} = await jiti.import("./official-corpus-inventory.ts");

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
