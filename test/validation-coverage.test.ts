import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type CoverageInventory = {
  readonly asOf: string;
  readonly inventoryVersion: number;
  readonly families: ReadonlyArray<{
    readonly family: string;
    readonly sourceQuarterOrVersion: string;
    readonly canonicalModel: boolean | string;
    readonly runtimeWorkflow: boolean | string;
    readonly oracleStatus: string;
    readonly testStatus: string;
    readonly currentNote: string;
  }>;
};

describe("validation coverage inventory", () => {
  it("tracks the validated KBV families in machine-readable form", async () => {
    const inventoryPath = join(
      process.cwd(),
      "tools",
      "oracles",
      "coverage-inventory.json",
    );
    const markdownPath = join(process.cwd(), "VALIDATION_COVERAGE.md");

    const inventory = JSON.parse(
      await readFile(inventoryPath, "utf8"),
    ) as CoverageInventory;
    const markdown = await readFile(markdownPath, "utf8");

    expect(inventory.asOf).toBe("2026-03-11");
    expect(inventory.inventoryVersion).toBe(1);
    expect(inventory.families.length).toBeGreaterThanOrEqual(12);

    const eRezept = inventory.families.find((entry) => entry.family === "eRezept");
    const eAU = inventory.families.find((entry) => entry.family === "eAU");
    const kvdt = inventory.families.find((entry) => entry.family === "KVDT");
    const bmp = inventory.families.find((entry) => entry.family === "BMP");
    const heilmittel = inventory.families.find(
      (entry) => entry.family === "Heilmittel",
    );
    const bfb = inventory.families.find((entry) => entry.family === "BFB");

    expect(eRezept?.oracleStatus).toBe("executable-fhir");
    expect(eRezept?.testStatus).toBe("covered");
    expect(eAU?.testStatus).toBe("covered");
    expect(kvdt?.oracleStatus).toBe("executable-xpm-xkm");
    expect(bmp?.oracleStatus).toBe("executable-xsd");
    expect(heilmittel?.oracleStatus).toBe("official-fixture-backed");
    expect(bfb?.testStatus).toBe("minimal");

    for (const family of ["eRezept", "eAU", "KVDT", "BMP", "Heilmittel", "BFB"]) {
      expect(markdown.includes(family)).toBe(true);
    }
  });
});
