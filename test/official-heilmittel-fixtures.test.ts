import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import fc from "fast-check";

import {
  encodeHeilmittelOraclePreviewSync,
  runHeilmittelOracle,
} from "../tools/oracles/heilmittel/run";
import { path } from "../tools/oracles/platform";
import { HeilmittelFixtureFields } from "./oracle-fixture-schemas";
import { decodeJsonFile, formatOracleExecutionResult } from "./schema-json";
import { ORACLE_PROPERTY_NUM_RUNS } from "./timeouts";

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

  it.effect(
    "rejects common corruptions of a passing official Heilmittel prueffall",
    () =>
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
        const positiveFixture = fixtures.find(
          (fixture) => fixture.caseId === "PF01-A1",
        );

        expect(positiveFixture).toBeDefined();
        if (!positiveFixture) {
          throw new Error("expected positive Heilmittel fixture PF01-A1");
        }

        yield* Effect.tryPromise(() =>
          fc.assert(
            fc.asyncProperty(
              fc.constantFrom<HeilmittelMutation>(...heilmittelMutations),
              async (mutation) => {
                // Arrange
                const corruptedFixture = mutation.mutate(positiveFixture);

                // Act
                const result = runHeilmittelOracle({
                  payloadPreview:
                    encodeHeilmittelOraclePreviewSync(corruptedFixture),
                });

                // Assert
                expect(
                  result.passed,
                  `Heilmittel oracle unexpectedly accepted ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
                ).toBe(false);
                expect(
                  result.findings.some(
                    (finding) => finding.code === mutation.expectedErrorCode,
                  ),
                  `Heilmittel oracle should report ${mutation.expectedErrorCode} for ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
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

type HeilmittelFixture = Schema.Schema.Type<typeof HeilmittelFixtureFields>;

type HeilmittelMutation = {
  readonly expectedErrorCode:
    | "HEILMITTEL_APPROVAL_REQUIRED"
    | "HEILMITTEL_CATALOG_ENTRY_MISSING"
    | "HEILMITTEL_CODE_REQUIRED"
    | "HEILMITTEL_DIAGNOSIS_REQUIRED";
  readonly id: string;
  readonly mutate: (fixture: HeilmittelFixture) => HeilmittelFixture;
};

const heilmittelMutations: readonly HeilmittelMutation[] = [
  {
    expectedErrorCode: "HEILMITTEL_DIAGNOSIS_REQUIRED",
    id: "remove-diagnosis-codes",
    mutate: (fixture) => ({
      ...fixture,
      diagnosisCodes: [],
    }),
  },
  {
    expectedErrorCode: "HEILMITTEL_CODE_REQUIRED",
    id: "remove-selected-heilmittel",
    mutate: (fixture) => ({
      ...fixture,
      blankoFlag: false,
      items: [],
    }),
  },
  {
    expectedErrorCode: "HEILMITTEL_CATALOG_ENTRY_MISSING",
    id: "swap-to-unknown-heilmittel-code",
    mutate: (fixture) => ({
      ...fixture,
      items: fixture.items.map((item, index) =>
        index === 0 ? { ...item, code: "X9999" } : item,
      ),
    }),
  },
  {
    expectedErrorCode: "HEILMITTEL_APPROVAL_REQUIRED",
    id: "require-missing-long-term-approval",
    mutate: (fixture) => ({
      ...fixture,
      approval: undefined,
      requiresLongTermApproval: true,
    }),
  },
];
