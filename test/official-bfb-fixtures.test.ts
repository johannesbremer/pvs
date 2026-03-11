import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runBfbOracle } from "../tools/oracles/bfb/run";

type BfbFixture = {
  readonly caseId: string;
  readonly expectedPassed: boolean;
  readonly expectedErrorCodes?: ReadonlyArray<string>;
};

describe("official BFB fixture sweeps", () => {
  it("validates local BFB render-context fixtures", async () => {
    const fixturePath = join(
      process.cwd(),
      "test",
      "oracles",
      "bfb",
      "render-context-fixtures.json",
    );
    const fixtures = JSON.parse(
      await readFile(fixturePath, "utf8"),
    ) as ReadonlyArray<BfbFixture>;

    expect(fixtures.length).toBeGreaterThanOrEqual(3);

    for (const fixture of fixtures) {
      const result = runBfbOracle({
        payloadPreview: JSON.stringify(fixture),
      });

      expect(
        result.passed,
        `BFB fixture ${fixture.caseId} produced an unexpected pass/fail result.\n${JSON.stringify(result, null, 2)}`,
      ).toBe(fixture.expectedPassed);

      for (const errorCode of fixture.expectedErrorCodes ?? []) {
        expect(
          result.findings.some((finding) => finding.code === errorCode),
          `BFB fixture ${fixture.caseId} should include ${errorCode}.\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
      }
    }
  });
});
