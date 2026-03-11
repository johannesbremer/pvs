import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runTssOracle } from "../tools/oracles/tss/run";

type TssFixture = {
  readonly caseId: string;
};

describe("official TSS fixture sweeps", () => {
  it("validates local TSS listing and selection fixtures", async () => {
    const fixturePath = join(
      process.cwd(),
      "test",
      "oracles",
      "tss",
      "selection-fixtures.json",
    );
    const fixtures = JSON.parse(
      await readFile(fixturePath, "utf8"),
    ) as ReadonlyArray<TssFixture>;

    expect(fixtures.length).toBeGreaterThanOrEqual(2);

    for (const fixture of fixtures) {
      const result = runTssOracle({
        payloadPreview: JSON.stringify(fixture),
      });

      expect(
        result.passed,
        `TSS fixture ${fixture.caseId} produced an unexpected pass/fail result.\n${JSON.stringify(result, null, 2)}`,
      ).toBe(true);
    }
  });
});
