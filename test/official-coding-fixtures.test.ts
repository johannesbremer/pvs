import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runCodingOracle } from "../tools/oracles/coding/run";

interface CodingFixture {
  readonly caseId: string;
  readonly expectedErrorCodes?: readonly string[];
  readonly expectedPassed: boolean;
  readonly expectedWarningCodes?: readonly string[];
}

describe("official coding fixture sweeps", () => {
  it("validates SDICD/SDKH/SDKRW rule fixtures", async () => {
    const fixturePath = join(
      process.cwd(),
      "test",
      "oracles",
      "coding",
      "sdicd-sdkh-sdkrw-fixtures.json",
    );
    const fixtures = JSON.parse(
      await readFile(fixturePath, "utf8"),
    ) as readonly CodingFixture[];

    expect(fixtures.length).toBeGreaterThanOrEqual(6);

    for (const fixture of fixtures) {
      const result = runCodingOracle({
        payloadPreview: JSON.stringify(fixture),
      });

      expect(
        result.passed,
        `Coding fixture ${fixture.caseId} produced an unexpected pass/fail result.\n${JSON.stringify(result, null, 2)}`,
      ).toBe(fixture.expectedPassed);

      for (const errorCode of fixture.expectedErrorCodes ?? []) {
        expect(
          result.findings.some((finding) => finding.code === errorCode),
          `Coding fixture ${fixture.caseId} should include ${errorCode}.\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
      }

      for (const warningCode of fixture.expectedWarningCodes ?? []) {
        expect(
          result.findings.some((finding) => finding.code === warningCode),
          `Coding fixture ${fixture.caseId} should include ${warningCode}.\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
      }
    }
  });
});
