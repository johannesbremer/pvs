import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  encodeHeilmittelOraclePreviewSync,
  runHeilmittelOracle,
} from "../tools/oracles/heilmittel/run";
import { path } from "../tools/oracles/platform";
import { HeilmittelFixtureFields } from "./oracle-fixture-schemas";
import { decodeJsonFile, formatOracleExecutionResult } from "./schema-json";

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
      const fixtures = yield* decodeJsonFile(
        fixturePath,
        Schema.Array(HeilmittelFixtureFields),
      );

      expect(fixtures.length).toBeGreaterThanOrEqual(6);

      for (const fixture of fixtures) {
        const result = runHeilmittelOracle({
          payloadPreview: encodeHeilmittelOraclePreviewSync(fixture),
        });

        expect(
          result.passed,
          `Heilmittel fixture ${fixture.caseId} produced an unexpected pass/fail result.\n${formatOracleExecutionResult(result)}`,
        ).toBe(fixture.expectedPassed);

        for (const errorCode of fixture.expectedErrorCodes ?? []) {
          expect(
            result.findings.some((finding) => finding.code === errorCode),
            `Heilmittel fixture ${fixture.caseId} should include ${errorCode}.\n${formatOracleExecutionResult(result)}`,
          ).toBe(true);
        }
      }
    }),
  );
});
