import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import fc from "fast-check";

import {
  encodeCodingOraclePreviewSync,
  runCodingOracle,
} from "../tools/oracles/coding/run";
import { path } from "../tools/oracles/platform";
import { CodingFixtureFields } from "./oracle-fixture-schemas";
import { decodeJsonFile, formatOracleExecutionResult } from "./schema-json";
import { ORACLE_PROPERTY_NUM_RUNS } from "./timeouts";

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

  it.effect("rejects common corruptions of a passing SDICD rule fixture", () =>
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
      const positiveFixture = fixtures.find(
        (fixture) => fixture.caseId === "SDICD-A00-BILLABLE",
      );

      expect(positiveFixture).toBeDefined();
      if (!positiveFixture) {
        throw new Error("expected positive coding fixture SDICD-A00-BILLABLE");
      }

      yield* Effect.tryPromise(() =>
        fc.assert(
          fc.asyncProperty(
            fc.constantFrom<CodingMutation>(...codingMutations),
            async (mutation) => {
              // Arrange
              const corruptedFixture = mutation.mutate(positiveFixture);

              // Act
              const result = runCodingOracle({
                payloadPreview: encodeCodingOraclePreviewSync(corruptedFixture),
              });

              // Assert
              expect(
                result.passed,
                `Coding oracle unexpectedly accepted ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
              ).toBe(false);
              expect(
                result.findings.some(
                  (finding) => finding.code === mutation.expectedErrorCode,
                ),
                `Coding oracle should report ${mutation.expectedErrorCode} for ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
              ).toBe(true);
            },
          ),
          { numRuns: ORACLE_PROPERTY_NUM_RUNS },
        ),
      );
    }),
  );
});

// Helpers

type CodingFixture = Schema.Schema.Type<typeof CodingFixtureFields>;

type CodingMutation = {
  readonly expectedErrorCode:
    | "SDICD_AGE_TOO_LOW"
    | "SDICD_CODE_UNKNOWN"
    | "SDICD_GENDER_MISMATCH";
  readonly id: string;
  readonly mutate: (fixture: CodingFixture) => CodingFixture;
};

const codingMutations: readonly CodingMutation[] = [
  {
    expectedErrorCode: "SDICD_CODE_UNKNOWN",
    id: "remove-catalog-entry",
    mutate: (fixture) => ({
      ...fixture,
      catalogEntry: undefined,
    }),
  },
  {
    expectedErrorCode: "SDICD_GENDER_MISMATCH",
    id: "introduce-gender-conflict",
    mutate: (fixture) => ({
      ...fixture,
      catalogEntry: fixture.catalogEntry
        ? {
            ...fixture.catalogEntry,
            genderConstraint: "male",
            genderErrorType: "error",
          }
        : fixture.catalogEntry,
    }),
  },
  {
    expectedErrorCode: "SDICD_AGE_TOO_LOW",
    id: "set-age-lower-bound-above-patient-age",
    mutate: (fixture) => ({
      ...fixture,
      catalogEntry: fixture.catalogEntry
        ? {
            ...fixture.catalogEntry,
            ageErrorType: "error",
            ageLower: 80,
          }
        : fixture.catalogEntry,
    }),
  },
];
