import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { runHeilmittelOracle } from "../tools/oracles/heilmittel/run";
import { fileSystem, path } from "../tools/oracles/platform";

interface HeilmittelFixture {
  readonly caseId: string;
  readonly expectedErrorCodes?: readonly string[];
  readonly expectedPassed: boolean;
}

describe("official Heilmittel fixture sweeps", () => {
  it.effect("validates official KBV Heilmittel prueffall fixtures", () =>
    Effect.gen(function* () {
      const fixturePath = path.join(
        process.cwd(),
        "test",
        "oracles",
        "heilmittel",
        "pruefpaket-v2.4.json",
      );
      const fixtures = JSON.parse(
        yield* fileSystem.readFileString(fixturePath),
      ) as readonly HeilmittelFixture[];

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
    }),
  );
});
