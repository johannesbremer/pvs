import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  encodeBfbRenderContextPreviewSync,
  runBfbOracle,
} from "../tools/oracles/bfb/run";
import { path } from "../tools/oracles/platform";
import { BfbFixtureFields } from "./oracle-fixture-schemas";
import { decodeJsonFile, formatOracleExecutionResult } from "./schema-json";

describe("official BFB fixture sweeps", () => {
  it.effect("validates local BFB golden render-context fixtures", () =>
    Effect.gen(function* () {
      const fixturePath = path.join(
        process.cwd(),
        "test",
        "oracles",
        "bfb",
        "render-context-fixtures.json",
      );
      const fixtures = yield* decodeJsonFile(
        fixturePath,
        Schema.Array(BfbFixtureFields),
      );

      expect(fixtures.length).toBeGreaterThanOrEqual(4);

      for (const fixture of fixtures) {
        const result = runBfbOracle({
          payloadPreview: encodeBfbRenderContextPreviewSync(fixture),
        });

        expect(
          result.passed,
          `BFB fixture ${fixture.caseId} produced an unexpected pass/fail result.\n${formatOracleExecutionResult(result)}`,
        ).toBe(fixture.expectedPassed);

        for (const errorCode of fixture.expectedErrorCodes ?? []) {
          expect(
            result.findings.some((finding) => finding.code === errorCode),
            `BFB fixture ${fixture.caseId} should include ${errorCode}.\n${formatOracleExecutionResult(result)}`,
          ).toBe(true);
        }
      }
    }),
  );
});
