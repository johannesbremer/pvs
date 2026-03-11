import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runHeilmittelOracle } from "../tools/oracles/heilmittel/run";

type HeilmittelFixture = {
  readonly caseId: string;
  readonly expectedPassed: boolean;
  readonly expectedErrorCodes?: ReadonlyArray<string>;
};

describe("official Heilmittel fixture sweeps", () => {
  it("validates official KBV Heilmittel prueffall fixtures", async () => {
    const fixturePath = join(
      process.cwd(),
      "test",
      "oracles",
      "heilmittel",
      "pruefpaket-v2.4.json",
    );
    const fixtures = JSON.parse(
      await readFile(fixturePath, "utf8"),
    ) as ReadonlyArray<HeilmittelFixture>;

    expect(fixtures.length).toBeGreaterThanOrEqual(6);

    for (const fixture of fixtures) {
      const result = runHeilmittelOracle({
        payloadPreview: JSON.stringify(fixture),
      });

      expect(
        result.passed,
        `Heilmittel fixture ${fixture.caseId} produced an unexpected pass/fail result.\n${JSON.stringify(result, null, 2)}`,
      ).toBe(fixture.expectedPassed);

      for (const errorCode of fixture.expectedErrorCodes ?? []) {
        expect(
          result.findings.some((finding) => finding.code === errorCode),
          `Heilmittel fixture ${fixture.caseId} should include ${errorCode}.\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
      }
    }
  });
});
