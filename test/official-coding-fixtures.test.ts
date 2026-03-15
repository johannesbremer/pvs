import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  encodeCodingOraclePreviewSync,
  runCodingOracle,
} from "../tools/oracles/coding/run";
import { path } from "../tools/oracles/platform";
import { CodingFixtureFields } from "./oracle-fixture-schemas";
import { decodeJsonFile, formatOracleExecutionResult } from "./schema-json";

describe("official coding fixture sweeps", () => {
  it.effect("validates SDICD/SDKH/SDKRW rule fixtures", () =>
    Effect.gen(function* () {
      const fixturePath = path.join(
        process.cwd(),
        "test",
        "oracles",
        "coding",
        "sdicd-sdkh-sdkrw-fixtures.json",
      );
      const fixtures = yield* decodeJsonFile(
        fixturePath,
        Schema.Array(CodingFixtureFields),
      );

      expect(fixtures.length).toBeGreaterThanOrEqual(6);

      for (const fixture of fixtures) {
        const result = runCodingOracle({
          payloadPreview: encodeCodingOraclePreviewSync(fixture),
        });

        expect(
          result.passed,
          `Coding fixture ${fixture.caseId} produced an unexpected pass/fail result.\n${formatOracleExecutionResult(result)}`,
        ).toBe(fixture.expectedPassed);

        for (const errorCode of fixture.expectedErrorCodes ?? []) {
          expect(
            result.findings.some((finding) => finding.code === errorCode),
            `Coding fixture ${fixture.caseId} should include ${errorCode}.\n${formatOracleExecutionResult(result)}`,
          ).toBe(true);
        }

        for (const warningCode of fixture.expectedWarningCodes ?? []) {
          expect(
            result.findings.some((finding) => finding.code === warningCode),
            `Coding fixture ${fixture.caseId} should include ${warningCode}.\n${formatOracleExecutionResult(result)}`,
          ).toBe(true);
        }
      }
    }),
  );
});
