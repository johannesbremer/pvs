import { readFile } from "node:fs/promises";
import { join } from "node:path";

const inventoryPath = join(
  process.cwd(),
  "tools",
  "oracles",
  "coverage-inventory.json",
);

const contents = await readFile(inventoryPath, "utf8");
process.stdout.write(contents);
