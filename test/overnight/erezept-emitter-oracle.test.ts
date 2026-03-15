import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import fc from "fast-check";

import { runExecutableFhirOracleEffect } from "../../tools/oracles/fhir/run";
import { resolveOracleTestCache } from "../oracle-test-cache";
import { ORACLE_PROPERTY_NUM_RUNS, ORACLE_TEST_TIMEOUT } from "../timeouts";
import {
  erpFreetextCaseArbitrary,
  erpPznCaseArbitrary,
  persistErpOracleReplayCaseEffect,
  renderGeneratedErpXmlEffect,
} from "./erezept-oracle-helpers";

describe("overnight eRezept emitter oracle", () => {
  it.effect(
    "emits executable-valid ERP XML for generated PZN orders",
    () =>
      Effect.gen(function* () {
        const { cacheDir } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-overnight-erp-emitter-pzn-",
        });

        yield* Effect.tryPromise(() =>
          fc.assert(
            fc.asyncProperty(erpPznCaseArbitrary, (input) =>
              Effect.runPromise(
                Effect.gen(function* () {
                  const rendered = yield* renderGeneratedErpXmlEffect(input);
                  const executableResult = yield* runExecutableFhirOracleEffect(
                    {
                      cacheDir,
                      family: "eRezept",
                      xml: rendered.xml,
                    },
                  );

                  if (!executableResult.passed) {
                    const replayPath = yield* persistErpOracleReplayCaseEffect({
                      lane: "emitter",
                      payload: { branch: "pzn", input },
                      scenario: "last-pzn-case",
                    });
                    throw new Error(
                      [
                        "Executable validator rejected emitted PZN ERP XML.",
                        `replay=${replayPath}`,
                        `input=${JSON.stringify(input)}`,
                        `summary=${JSON.stringify({
                          errorCount: executableResult.findings.filter(
                            (finding) => finding.severity === "error",
                          ).length,
                          firstFindings: executableResult.findings.slice(0, 5),
                          passed: executableResult.passed,
                        })}`,
                      ].join("\n"),
                    );
                  }

                  const errorFindings = executableResult.findings.filter(
                    (finding) => finding.severity === "error",
                  );
                  if (errorFindings.length > 0) {
                    const replayPath = yield* persistErpOracleReplayCaseEffect({
                      lane: "emitter",
                      payload: { branch: "pzn", input },
                      scenario: "last-pzn-case",
                    });
                    throw new Error(
                      [
                        "Executable validator returned error findings for emitted PZN ERP XML.",
                        `replay=${replayPath}`,
                        `input=${JSON.stringify(input)}`,
                        `errors=${JSON.stringify(errorFindings.slice(0, 5))}`,
                      ].join("\n"),
                    );
                  }

                  expect(rendered.xml).toContain("<Bundle");
                  expect(rendered.xml).toContain("<Composition");
                  expect(rendered.xml).toContain("<MedicationRequest");
                  expect(rendered.bundleEntryCount).toBeGreaterThanOrEqual(7);
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
    "emits executable-valid ERP XML for generated freetext orders",
    () =>
      Effect.gen(function* () {
        const { cacheDir } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-overnight-erp-emitter-freetext-",
        });

        yield* Effect.tryPromise(() =>
          fc.assert(
            fc.asyncProperty(erpFreetextCaseArbitrary, (input) =>
              Effect.runPromise(
                Effect.gen(function* () {
                  const rendered = yield* renderGeneratedErpXmlEffect(input);
                  const executableResult = yield* runExecutableFhirOracleEffect(
                    {
                      cacheDir,
                      family: "eRezept",
                      xml: rendered.xml,
                    },
                  );

                  if (!executableResult.passed) {
                    const replayPath = yield* persistErpOracleReplayCaseEffect({
                      lane: "emitter",
                      payload: { branch: "freetext", input },
                      scenario: "last-freetext-case",
                    });
                    throw new Error(
                      [
                        "Executable validator rejected emitted freetext ERP XML.",
                        `replay=${replayPath}`,
                        `input=${JSON.stringify(input)}`,
                        `summary=${JSON.stringify({
                          errorCount: executableResult.findings.filter(
                            (finding) => finding.severity === "error",
                          ).length,
                          firstFindings: executableResult.findings.slice(0, 5),
                          passed: executableResult.passed,
                        })}`,
                      ].join("\n"),
                    );
                  }

                  const errorFindings = executableResult.findings.filter(
                    (finding) => finding.severity === "error",
                  );
                  if (errorFindings.length > 0) {
                    const replayPath = yield* persistErpOracleReplayCaseEffect({
                      lane: "emitter",
                      payload: { branch: "freetext", input },
                      scenario: "last-freetext-case",
                    });
                    throw new Error(
                      [
                        "Executable validator returned error findings for emitted freetext ERP XML.",
                        `replay=${replayPath}`,
                        `input=${JSON.stringify(input)}`,
                        `errors=${JSON.stringify(errorFindings.slice(0, 5))}`,
                      ].join("\n"),
                    );
                  }

                  expect(rendered.xml).toContain("<Bundle");
                  expect(rendered.xml).toContain("<Composition");
                  expect(rendered.xml).toContain("<MedicationRequest");
                  expect(rendered.bundleEntryCount).toBeGreaterThanOrEqual(7);
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
