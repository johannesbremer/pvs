import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { fileSystem, path, runEffect } from "../tools/oracles/platform";

interface CoverageInventory {
  readonly asOf: string;
  readonly families: readonly {
    readonly canonicalModel: boolean | string;
    readonly currentNote: string;
    readonly family: string;
    readonly oracleStatus: string;
    readonly runtimeWorkflow: boolean | string;
    readonly sourceQuarterOrVersion: string;
    readonly testStatus: string;
  }[];
  readonly inventoryVersion: number;
}

describe("validation coverage inventory", () => {
  it.effect("tracks the validated KBV families in machine-readable form", () =>
    Effect.promise(async () => {
      const inventoryPath = path.join(
        process.cwd(),
        "tools",
        "oracles",
        "coverage-inventory.json",
      );
      const markdownPath = path.join(process.cwd(), "VALIDATION_COVERAGE.md");

      const inventory = JSON.parse(
        await runEffect(fileSystem.readFileString(inventoryPath)),
      ) as CoverageInventory;
      const markdown = await runEffect(fileSystem.readFileString(markdownPath));

      expect(inventory.asOf).toBe("2026-03-11");
      expect(inventory.inventoryVersion).toBe(1);
      expect(inventory.families.length).toBeGreaterThanOrEqual(12);

      const eRezept = inventory.families.find(
        (entry) => entry.family === "eRezept",
      );
      const eAU = inventory.families.find((entry) => entry.family === "eAU");
      const kvdt = inventory.families.find((entry) => entry.family === "KVDT");
      const bmp = inventory.families.find((entry) => entry.family === "BMP");
      const heilmittel = inventory.families.find(
        (entry) => entry.family === "Heilmittel",
      );
      const bfb = inventory.families.find((entry) => entry.family === "BFB");
      const tss = inventory.families.find((entry) => entry.family === "TSS");
      const evdga = inventory.families.find(
        (entry) => entry.family === "eVDGA",
      );
      const vos = inventory.families.find((entry) => entry.family === "VoS");

      expect(eRezept?.oracleStatus).toBe("executable-fhir");
      expect(eRezept?.testStatus).toBe("covered");
      expect(eAU?.testStatus).toBe("covered");
      expect(kvdt?.oracleStatus).toBe("executable-xpm-xkm");
      expect(bmp?.oracleStatus).toBe("executable-xsd");
      expect(heilmittel?.oracleStatus).toBe("official-fixture-backed");
      expect(bfb?.testStatus).toBe("covered");
      expect(tss?.oracleStatus).toBe("fixture-backed-local");
      expect(tss?.testStatus).toBe("covered");
      expect(evdga?.oracleStatus).toBe("executable-fhir");
      expect(evdga?.runtimeWorkflow).toBe(true);
      expect(evdga?.testStatus).toBe("covered");
      expect(vos?.runtimeWorkflow).toBe(true);
      expect(vos?.testStatus).toBe("covered");

      for (const family of [
        "eRezept",
        "eAU",
        "KVDT",
        "BMP",
        "Heilmittel",
        "BFB",
        "TSS",
        "eVDGA",
        "VoS",
      ]) {
        expect(markdown.includes(family)).toBe(true);
      }
    }),
  );
});
