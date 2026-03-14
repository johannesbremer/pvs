import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";

const inventoryPath = join(
  process.cwd(),
  "tools",
  "oracles",
  "coverage-inventory.json",
);

void Effect.runPromise(
  Effect.gen(function* () {
    const contents = yield* Effect.promise(() =>
      readFile(inventoryPath, "utf8"),
    );
    process.stdout.write(contents);
  }),
);
