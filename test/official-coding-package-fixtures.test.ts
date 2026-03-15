import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  encodeCodingPackagePreviewSync,
  runCodingOracle,
} from "../tools/oracles/coding/run";
import { path } from "../tools/oracles/platform";
import { CodingPackageFixtureFields } from "./oracle-fixture-schemas";
import { decodeJsonFile, formatOracleExecutionResult } from "./schema-json";

describe("official coding package fixture sweeps", () => {
  it.effect("validates SDICD/SDKH/SDKRW package integrity fixtures", () =>
    Effect.gen(function* () {
      const fixturePath = path.join(
        process.cwd(),
        "test",
        "oracles",
        "coding",
        "package-integrity-fixtures.json",
      );
      const fixtures = yield* decodeJsonFile(
        fixturePath,
        Schema.Array(CodingPackageFixtureFields),
      );

      expect(fixtures.length).toBeGreaterThanOrEqual(4);

      for (const fixture of fixtures) {
        const result = runCodingOracle({
          payloadPreview: encodeCodingPackagePreviewSync(fixture),
        });

        expect(
          result.passed,
          `Coding package fixture ${fixture.caseId} produced an unexpected pass/fail result.\n${formatOracleExecutionResult(result)}`,
        ).toBe(fixture.expectedPassed);

        for (const errorCode of fixture.expectedErrorCodes ?? []) {
          expect(
            result.findings.some((finding) => finding.code === errorCode),
            `Coding package fixture ${fixture.caseId} should include ${errorCode}.\n${formatOracleExecutionResult(result)}`,
          ).toBe(true);
        }
      }
    }),
  );
});
