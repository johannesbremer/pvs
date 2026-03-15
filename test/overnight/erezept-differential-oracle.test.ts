import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import fc from "fast-check";

import {
  runExecutableFhirOracleEffect,
  runFhirOracle,
} from "../../tools/oracles/fhir/run";
import { resolveOracleTestCache } from "../oracle-test-cache";
import { ORACLE_PROPERTY_NUM_RUNS, ORACLE_TEST_TIMEOUT } from "../timeouts";
import {
  emittedMismatchMutations,
  emittedParityMutations,
  erpFreetextCaseArbitrary,
  erpPznCaseArbitrary,
  loadOfficialErpExampleXmlEffect,
  officialMismatchMutations,
  officialParityMutations,
  persistErpOracleReplayCaseEffect,
  renderGeneratedErpXmlEffect,
} from "./erezept-oracle-helpers";

describe("overnight eRezept differential oracle", () => {
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

                    if (localResult.passed || executableResult.passed) {
                      const replayPath =
                        yield* persistErpOracleReplayCaseEffect({
                          lane: "differential",
                          payload: testCase,
                          scenario: "last-parity-case",
                        });
                      throw new Error(
                        [
                          "ERP parity mutation no longer rejects in both oracles.",
                          `replay=${replayPath}`,
                          `testCase=${JSON.stringify({
                            input:
                              "input" in testCase ? testCase.input : undefined,
                            mutationId: testCase.mutation.id,
                            sourceKind: testCase.sourceKind,
                          })}`,
                          `localPassed=${JSON.stringify(localResult.passed)}`,
                          `execSummary=${JSON.stringify({
                            firstFindings: executableResult.findings.slice(
                              0,
                              5,
                            ),
                            passed: executableResult.passed,
                          })}`,
                        ].join("\n"),
                      );
                    }
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

                    if (!localResult.passed || executableResult.passed) {
                      const replayPath =
                        yield* persistErpOracleReplayCaseEffect({
                          lane: "differential",
                          payload: testCase,
                          scenario: "last-mismatch-case",
                        });
                      throw new Error(
                        [
                          "ERP mismatch mutation changed its local-vs-executable classification.",
                          `replay=${replayPath}`,
                          `testCase=${JSON.stringify({
                            input:
                              "input" in testCase ? testCase.input : undefined,
                            mutationId: testCase.mutation.id,
                            sourceKind: testCase.sourceKind,
                          })}`,
                          `localPassed=${JSON.stringify(localResult.passed)}`,
                          `execSummary=${JSON.stringify({
                            firstFindings: executableResult.findings.slice(
                              0,
                              5,
                            ),
                            passed: executableResult.passed,
                          })}`,
                        ].join("\n"),
                      );
                    }
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
