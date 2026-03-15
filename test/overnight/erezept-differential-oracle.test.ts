import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import fc from "fast-check";

import type { OracleExecutionResult } from "../../tools/oracles/types";

import {
  runExecutableFhirOracleEffect,
  runFhirOracle,
} from "../../tools/oracles/fhir/run";
import { resolveOracleTestCache } from "../oracle-test-cache";
import { ORACLE_PROPERTY_NUM_RUNS, ORACLE_TEST_TIMEOUT } from "../timeouts";
import {
  emittedMismatchMutations,
  emittedParityMutations,
  type ErpDifferentialMutation,
  type ErpEmitterCase,
  erpFreetextCaseArbitrary,
  erpPznCaseArbitrary,
  loadOfficialErpExampleXmlEffect,
  officialMismatchMutations,
  officialParityMutations,
  persistErpOracleReplayCaseEffect,
  renderGeneratedErpXmlEffect,
} from "./erezept-oracle-helpers";

const representativePznCase: ErpEmitterCase = {
  authoredOn: "2026-03-10T09:05:00.000Z",
  dosageText: "1-0-1",
  medicationDisplay: "Diclofenac Test",
  orderKind: "pzn",
  patientFamily: "Keller",
  patientGiven: "Lina",
  pzn: "99999993",
};

const representativeFreetextCase: ErpEmitterCase = {
  authoredOn: "2026-03-10T09:05:00.000Z",
  dosageText: "1 Tablette morgens",
  medicationDisplay: "Rezeptur Salbe 2%",
  orderKind: "freetext",
  patientFamily: "Meyer",
  patientGiven: "Eva",
};

describe("overnight eRezept differential oracle", () => {
  it.effect(
    "keeps the declared official ERP differential mutation catalog classified as expected",
    () =>
      Effect.gen(function* () {
        const { cacheDir } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-overnight-erp-diff-official-catalog-",
        });

        const baseXml = yield* loadOfficialErpExampleXmlEffect(cacheDir);
        yield* Effect.forEach(
          [...officialParityMutations, ...officialMismatchMutations],
          (mutation) =>
            assertDifferentialClassificationEffect({
              baseXml,
              cacheDir,
              lanePayload: {
                mutation,
                sourceKind: "official" as const,
              },
              scenario: "official-catalog-case",
            }),
          { concurrency: 1 },
        );
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "keeps the declared emitted ERP differential mutation catalog classified as expected for representative PZN and freetext bundles",
    () =>
      Effect.gen(function* () {
        const { cacheDir } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-overnight-erp-diff-emitted-catalog-",
        });

        const emittedCases = [
          representativePznCase,
          representativeFreetextCase,
        ] as const;
        const mutations = [
          ...emittedParityMutations,
          ...emittedMismatchMutations,
        ] as const;

        yield* Effect.forEach(
          emittedCases,
          (input) =>
            Effect.gen(function* () {
              const baseXml = (yield* renderGeneratedErpXmlEffect(input)).xml;
              yield* Effect.forEach(
                mutations,
                (mutation) =>
                  assertDifferentialClassificationEffect({
                    baseXml,
                    cacheDir,
                    lanePayload: {
                      input,
                      mutation,
                      sourceKind: "emitted" as const,
                    },
                    scenario: "emitted-catalog-case",
                  }),
                { concurrency: 1 },
              );
            }),
          { concurrency: 1 },
        );
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "keeps local and executable ERP rejection in sync for shared structural failures",
    () =>
      Effect.gen(function* () {
        const { cacheDir } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-overnight-erp-diff-parity-",
        });

        yield* Effect.tryPromise(() =>
          fc.assert(
            fc.asyncProperty(
              fc.oneof(
                fc.record({
                  mutation: fc.constantFrom(...officialParityMutations),
                  sourceKind: fc.constant<"official">("official"),
                }),
                fc.record({
                  input: fc.oneof(
                    erpPznCaseArbitrary,
                    erpFreetextCaseArbitrary,
                  ),
                  mutation: fc.constantFrom(...emittedParityMutations),
                  sourceKind: fc.constant<"emitted">("emitted"),
                }),
              ),
              (testCase) =>
                Effect.runPromise(
                  Effect.gen(function* () {
                    const baseXml =
                      testCase.sourceKind === "official"
                        ? yield* loadOfficialErpExampleXmlEffect(cacheDir)
                        : (yield* renderGeneratedErpXmlEffect(testCase.input))
                            .xml;
                    const mutatedXml = testCase.mutation.mutate(baseXml);
                    const localResult = runFhirOracle({
                      family: "eRezept",
                      xml: mutatedXml,
                    });
                    const executableResult =
                      yield* runExecutableFhirOracleEffect({
                        cacheDir,
                        family: "eRezept",
                        xml: mutatedXml,
                      });

                    yield* assertExpectedComparisonEffect({
                      executableResult,
                      lanePayload: testCase,
                      localResult,
                      mutation: testCase.mutation,
                      scenario: "last-parity-case",
                    });
                  }),
                ),
            ),
            { numRuns: ORACLE_PROPERTY_NUM_RUNS },
          ),
        );
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "tracks known executable-only ERP rejections without failing on intentional local gaps",
    () =>
      Effect.gen(function* () {
        const { cacheDir } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-overnight-erp-diff-mismatch-",
        });

        yield* Effect.tryPromise(() =>
          fc.assert(
            fc.asyncProperty(
              fc.oneof(
                fc.record({
                  mutation: fc.constantFrom(...officialMismatchMutations),
                  sourceKind: fc.constant<"official">("official"),
                }),
                fc.record({
                  input: fc.oneof(
                    erpPznCaseArbitrary,
                    erpFreetextCaseArbitrary,
                  ),
                  mutation: fc.constantFrom(...emittedMismatchMutations),
                  sourceKind: fc.constant<"emitted">("emitted"),
                }),
              ),
              (testCase) =>
                Effect.runPromise(
                  Effect.gen(function* () {
                    const baseXml =
                      testCase.sourceKind === "official"
                        ? yield* loadOfficialErpExampleXmlEffect(cacheDir)
                        : (yield* renderGeneratedErpXmlEffect(testCase.input))
                            .xml;
                    const mutatedXml = testCase.mutation.mutate(baseXml);
                    const localResult = runFhirOracle({
                      family: "eRezept",
                      xml: mutatedXml,
                    });
                    const executableResult =
                      yield* runExecutableFhirOracleEffect({
                        cacheDir,
                        family: "eRezept",
                        xml: mutatedXml,
                      });

                    yield* assertExpectedComparisonEffect({
                      executableResult,
                      lanePayload: testCase,
                      localResult,
                      mutation: testCase.mutation,
                      scenario: "last-mismatch-case",
                    });
                  }),
                ),
            ),
            { numRuns: ORACLE_PROPERTY_NUM_RUNS },
          ),
        );
      }),
    ORACLE_TEST_TIMEOUT,
  );
});

const assertDifferentialClassificationEffect = ({
  baseXml,
  cacheDir,
  lanePayload,
  scenario,
}: {
  baseXml: string;
  cacheDir: string;
  lanePayload:
    | {
        input: ErpEmitterCase;
        mutation: ErpDifferentialMutation;
        sourceKind: "emitted";
      }
    | {
        mutation: ErpDifferentialMutation;
        sourceKind: "official";
      };
  scenario: string;
}) =>
  Effect.gen(function* () {
    const mutatedXml = lanePayload.mutation.mutate(baseXml);
    const localResult = runFhirOracle({
      family: "eRezept",
      xml: mutatedXml,
    });
    const executableResult = yield* runExecutableFhirOracleEffect({
      cacheDir,
      family: "eRezept",
      xml: mutatedXml,
    });

    yield* assertExpectedComparisonEffect({
      executableResult,
      lanePayload,
      localResult,
      mutation: lanePayload.mutation,
      scenario,
    });
  });

const assertExpectedComparisonEffect = ({
  executableResult,
  lanePayload,
  localResult,
  mutation,
  scenario,
}: {
  executableResult: OracleExecutionResult;
  lanePayload:
    | {
        input: ErpEmitterCase;
        mutation: ErpDifferentialMutation;
        sourceKind: "emitted";
      }
    | {
        mutation: ErpDifferentialMutation;
        sourceKind: "official";
      };
  localResult: ReturnType<typeof runFhirOracle>;
  mutation: ErpDifferentialMutation;
  scenario: string;
}) =>
  Effect.gen(function* () {
    const matchesExpectation =
      mutation.expectedComparison === "same-reject"
        ? !localResult.passed && !executableResult.passed
        : localResult.passed && !executableResult.passed;

    if (matchesExpectation) {
      return;
    }

    const replayPath = yield* persistErpOracleReplayCaseEffect({
      lane: "differential",
      payload: lanePayload,
      scenario,
    });

    throw new Error(
      [
        `ERP differential mutation changed classification from ${mutation.expectedComparison}.`,
        `replay=${replayPath}`,
        `testCase=${JSON.stringify({
          input: "input" in lanePayload ? lanePayload.input : undefined,
          mutationId: mutation.id,
          sourceKind: lanePayload.sourceKind,
        })}`,
        `localPassed=${JSON.stringify(localResult.passed)}`,
        `execSummary=${JSON.stringify({
          firstFindings: executableResult.findings.slice(0, 5),
          passed: executableResult.passed,
        })}`,
      ].join("\n"),
    );
  });
