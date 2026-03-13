import { describe, expect, it } from "vitest";

import { runCodingOracle } from "../tools/oracles/coding/run";
import { fileSystem, path, runEffect } from "../tools/oracles/platform";

interface CodingPackageFixture {
  readonly caseId: string;
  readonly expectedErrorCodes?: readonly string[];
  readonly expectedPassed: boolean;
}

describe("official coding package fixture sweeps", () => {
  it("validates SDICD/SDKH/SDKRW package integrity fixtures", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "test",
      "oracles",
      "coding",
      "package-integrity-fixtures.json",
    );
    const fixtures = JSON.parse(
      await runEffect(fileSystem.readFileString(fixturePath)),
    ) as readonly CodingPackageFixture[];

    expect(fixtures.length).toBeGreaterThanOrEqual(4);

    for (const fixture of fixtures) {
      const result = runCodingOracle({
        payloadPreview: JSON.stringify(fixture),
      });

      expect(
        result.passed,
        `Coding package fixture ${fixture.caseId} produced an unexpected pass/fail result.\n${JSON.stringify(result, null, 2)}`,
      ).toBe(fixture.expectedPassed);

      for (const errorCode of fixture.expectedErrorCodes ?? []) {
        expect(
          result.findings.some((finding) => finding.code === errorCode),
          `Coding package fixture ${fixture.caseId} should include ${errorCode}.\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
      }
    }
  });
});
