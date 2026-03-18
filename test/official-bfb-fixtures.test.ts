import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import fc from "fast-check";

import {
  encodeBfbRenderContextPreviewSync,
  runBfbOracle,
} from "../tools/oracles/bfb/run";
import { path } from "../tools/oracles/platform";
import { BfbFixtureFields } from "./oracle-fixture-schemas";
import { decodeJsonFile, formatOracleExecutionResult } from "./schema-json";
import { ORACLE_PROPERTY_NUM_RUNS } from "./timeouts";

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

  it.effect(
    "rejects common corruptions of a passing BFB render-context fixture",
    () =>
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
        const positiveFixture = fixtures.find(
          (fixture) => fixture.caseId === "BFB-M16-POSITIVE",
        );

        expect(positiveFixture).toBeDefined();
        if (!positiveFixture) {
          throw new Error("expected positive BFB fixture BFB-M16-POSITIVE");
        }

        yield* Effect.tryPromise(() =>
          fc.assert(
            fc.asyncProperty(
              fc.constantFrom<BfbMutation>(...bfbMutations),
              async (mutation) => {
                // Arrange
                const corruptedFixture = mutation.mutate(positiveFixture);

                // Act
                const result = runBfbOracle({
                  payloadPreview:
                    encodeBfbRenderContextPreviewSync(corruptedFixture),
                });

                // Assert
                expect(
                  result.passed,
                  `BFB oracle unexpectedly accepted ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
                ).toBe(false);
                expect(
                  result.findings.some(
                    (finding) => finding.code === mutation.expectedErrorCode,
                  ),
                  `BFB oracle should report ${mutation.expectedErrorCode} for ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
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

type BfbFixture = Schema.Schema.Type<typeof BfbFixtureFields>;

type BfbMutation = {
  readonly expectedErrorCode:
    | "BFB_BARCODE_TYPE_INVALID"
    | "BFB_FIELDS_EMPTY"
    | "BFB_PAGE_COUNT_INVALID"
    | "BFB_TEMPLATE_MISSING";
  readonly id: string;
  readonly mutate: (fixture: BfbFixture) => BfbFixture;
};

const bfbMutations: readonly BfbMutation[] = [
  {
    expectedErrorCode: "BFB_TEMPLATE_MISSING",
    id: "remove-template-id",
    mutate: (fixture) => ({
      ...fixture,
      templateId: "",
    }),
  },
  {
    expectedErrorCode: "BFB_PAGE_COUNT_INVALID",
    id: "set-invalid-page-count",
    mutate: (fixture) => ({
      ...fixture,
      pageCount: 0,
    }),
  },
  {
    expectedErrorCode: "BFB_FIELDS_EMPTY",
    id: "remove-positioned-fields",
    mutate: (fixture) => ({
      ...fixture,
      fields: [],
    }),
  },
  {
    expectedErrorCode: "BFB_BARCODE_TYPE_INVALID",
    id: "use-unsupported-barcode-type",
    mutate: (fixture) => ({
      ...fixture,
      barcodes: (fixture.barcodes ?? []).map((barcode, index) =>
        index === 0 ? { ...barcode, barcodeType: "pdf417" } : barcode,
      ),
    }),
  },
];
