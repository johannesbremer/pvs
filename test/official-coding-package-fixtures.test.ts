import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import fc from "fast-check";

import {
  encodeCodingPackagePreviewSync,
  runCodingOracle,
} from "../tools/oracles/coding/run";
import { path } from "../tools/oracles/platform";
import { CodingPackageFixtureFields } from "./oracle-fixture-schemas";
import { decodeJsonFile, formatOracleExecutionResult } from "./schema-json";
import { ORACLE_PROPERTY_NUM_RUNS } from "./timeouts";

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

  it.effect(
    "rejects common corruptions of a passing coding package fixture",
    () =>
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
        const positiveFixture = fixtures.find(
          (fixture) => fixture.caseId === "ICD-PACKAGE-POSITIVE",
        );

        expect(positiveFixture).toBeDefined();
        if (!positiveFixture) {
          throw new Error(
            "expected positive coding package fixture ICD-PACKAGE-POSITIVE",
          );
        }

        yield* Effect.tryPromise(() =>
          fc.assert(
            fc.asyncProperty(
              fc.constantFrom<CodingPackageMutation>(...codingPackageMutations),
              async (mutation) => {
                // Arrange
                const corruptedFixture = mutation.mutate(positiveFixture);

                // Act
                const result = runCodingOracle({
                  payloadPreview:
                    encodeCodingPackagePreviewSync(corruptedFixture),
                });

                // Assert
                expect(
                  result.passed,
                  `Coding package oracle unexpectedly accepted ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
                ).toBe(false);
                expect(
                  result.findings.some(
                    (finding) => finding.code === mutation.expectedErrorCode,
                  ),
                  `Coding package oracle should report ${mutation.expectedErrorCode} for ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
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

type CodingPackageFixture = Schema.Schema.Type<
  typeof CodingPackageFixtureFields
>;

type CodingPackageMutation = {
  readonly expectedErrorCode:
    | "ICD_PACKAGE_ARTIFACT_SHA256_INVALID"
    | "ICD_PACKAGE_AUTHENTICITY_MISSING"
    | "ICD_PACKAGE_EMPTY"
    | "ICD_PACKAGE_FAMILY_INVALID";
  readonly id: string;
  readonly mutate: (fixture: CodingPackageFixture) => CodingPackageFixture;
};

const codingPackageMutations: readonly CodingPackageMutation[] = [
  {
    expectedErrorCode: "ICD_PACKAGE_FAMILY_INVALID",
    id: "swap-to-unsupported-family",
    mutate: (fixture) => ({
      ...fixture,
      package: {
        ...fixture.package,
        family: "AMDB",
      },
    }),
  },
  {
    expectedErrorCode: "ICD_PACKAGE_ARTIFACT_SHA256_INVALID",
    id: "use-invalid-artifact-sha256",
    mutate: (fixture) => ({
      ...fixture,
      package: {
        ...fixture.package,
        artifact: fixture.package.artifact
          ? {
              ...fixture.package.artifact,
              sha256: "not-a-sha256",
            }
          : fixture.package.artifact,
      },
    }),
  },
  {
    expectedErrorCode: "ICD_PACKAGE_AUTHENTICITY_MISSING",
    id: "remove-authenticity-metadata",
    mutate: (fixture) => ({
      ...fixture,
      package: {
        ...fixture.package,
        authenticity: undefined,
      },
    }),
  },
  {
    expectedErrorCode: "ICD_PACKAGE_EMPTY",
    id: "remove-all-package-entries",
    mutate: (fixture) => ({
      ...fixture,
      entries: [],
    }),
  },
];
