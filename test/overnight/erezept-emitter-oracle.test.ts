import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import fc from "fast-check";

import { runExecutableFhirOracleEffect } from "../../tools/oracles/fhir/run";
import { encodeJsonStringSync } from "../../tools/oracles/json-schema";
import { OracleFindingFields } from "../../tools/oracles/types";
import { resolveOracleTestCache } from "../oracle-test-cache";
import { ORACLE_PROPERTY_NUM_RUNS, ORACLE_TEST_TIMEOUT } from "../timeouts";
import { trackedAsyncProperty } from "./dashboard";
import {
  type ErpEmitterCase,
  ErpEmitterCaseFields,
  erpFreetextCaseArbitrary,
  erpPznCaseArbitrary,
  persistErpOracleReplayCaseEffect,
  renderGeneratedErpXmlEffect,
} from "./erezept-oracle-helpers";

const overnightEmitterSuite = "overnight eRezept emitter oracle";
const overnightSearchStopCondition =
  "Run until canceled, timeout, or the first emitted bundle that the executable validator rejects.";

const EmitterExampleFields = Schema.Struct({
  authoredOn: Schema.String,
  dosageText: Schema.optional(Schema.String),
  medicationDisplay: Schema.String,
  orderKind: Schema.Literal("freetext", "pzn"),
  patient: Schema.String,
  pzn: Schema.optional(Schema.String),
});

const EmitterReplayPayloadFields = Schema.Struct({
  branch: Schema.Literal("freetext", "pzn"),
  input: ErpEmitterCaseFields,
});

const EmitterFailureSummaryFields = Schema.Struct({
  errorCount: Schema.Number,
  firstFindings: Schema.Array(OracleFindingFields),
  passed: Schema.Boolean,
});

const describeEmitterExample = (input: ErpEmitterCase) =>
  encodeJsonStringSync(EmitterExampleFields)({
    authoredOn: input.authoredOn,
    dosageText: input.dosageText,
    medicationDisplay: input.medicationDisplay,
    orderKind: input.orderKind,
    patient: `${input.patientGiven} ${input.patientFamily}`,
    pzn: input.pzn,
  });

const summarizeEmitterTags = (input: ErpEmitterCase): readonly string[] =>
  [
    `orderKind:${input.orderKind}`,
    `medication:${input.medicationDisplay}`,
    ...(input.pzn ? [`pzn:${input.pzn}`] : []),
  ] as const;

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

        const trackedProperty = yield* trackedAsyncProperty({
          arbitrary: erpPznCaseArbitrary,
          configuredBudget: ORACLE_PROPERTY_NUM_RUNS,
          describeExample: describeEmitterExample,
          id: "emitter-pzn",
          run: (input) =>
            Effect.gen(function* () {
              const rendered = yield* renderGeneratedErpXmlEffect(input);
              const executableResult = yield* runExecutableFhirOracleEffect({
                cacheDir,
                family: "eRezept",
                xml: rendered.xml,
              });

              if (!executableResult.passed) {
                const replayPath = yield* persistErpOracleReplayCaseEffect({
                  lane: "emitter",
                  payload: { branch: "pzn" as const, input },
                  payloadSchema: EmitterReplayPayloadFields,
                  scenario: "last-pzn-case",
                });
                throw new Error(
                  [
                    "Executable validator rejected emitted PZN ERP XML.",
                    `replay=${replayPath}`,
                    `input=${encodeJsonStringSync(ErpEmitterCaseFields)(input)}`,
                    `summary=${encodeJsonStringSync(
                      EmitterFailureSummaryFields,
                    )({
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
                  payload: { branch: "pzn" as const, input },
                  payloadSchema: EmitterReplayPayloadFields,
                  scenario: "last-pzn-case",
                });
                throw new Error(
                  [
                    "Executable validator returned error findings for emitted PZN ERP XML.",
                    `replay=${replayPath}`,
                    `input=${encodeJsonStringSync(ErpEmitterCaseFields)(input)}`,
                    `errors=${encodeJsonStringSync(Schema.Array(OracleFindingFields))(errorFindings.slice(0, 5))}`,
                  ].join("\n"),
                );
              }

              expect(rendered.xml).toContain("<Bundle");
              expect(rendered.xml).toContain("<Composition");
              expect(rendered.xml).toContain("<MedicationRequest");
              expect(rendered.bundleEntryCount).toBeGreaterThanOrEqual(7);
            }),
          stopCondition: overnightSearchStopCondition,
          suite: overnightEmitterSuite,
          summarizeTags: summarizeEmitterTags,
          title: "PZN emitter property",
        });

        yield* Effect.tryPromise(() =>
          fc.assert(trackedProperty.property, {
            numRuns: ORACLE_PROPERTY_NUM_RUNS,
          }),
        );
        yield* Effect.sync(() =>
          trackedProperty.complete(
            "passed",
            `Completed ${ORACLE_PROPERTY_NUM_RUNS} PZN iterations`,
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

        const trackedProperty = yield* trackedAsyncProperty({
          arbitrary: erpFreetextCaseArbitrary,
          configuredBudget: ORACLE_PROPERTY_NUM_RUNS,
          describeExample: describeEmitterExample,
          id: "emitter-freetext",
          run: (input) =>
            Effect.gen(function* () {
              const rendered = yield* renderGeneratedErpXmlEffect(input);
              const executableResult = yield* runExecutableFhirOracleEffect({
                cacheDir,
                family: "eRezept",
                xml: rendered.xml,
              });

              if (!executableResult.passed) {
                const replayPath = yield* persistErpOracleReplayCaseEffect({
                  lane: "emitter",
                  payload: { branch: "freetext" as const, input },
                  payloadSchema: EmitterReplayPayloadFields,
                  scenario: "last-freetext-case",
                });
                throw new Error(
                  [
                    "Executable validator rejected emitted freetext ERP XML.",
                    `replay=${replayPath}`,
                    `input=${encodeJsonStringSync(ErpEmitterCaseFields)(input)}`,
                    `summary=${encodeJsonStringSync(
                      EmitterFailureSummaryFields,
                    )({
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
                  payload: { branch: "freetext" as const, input },
                  payloadSchema: EmitterReplayPayloadFields,
                  scenario: "last-freetext-case",
                });
                throw new Error(
                  [
                    "Executable validator returned error findings for emitted freetext ERP XML.",
                    `replay=${replayPath}`,
                    `input=${encodeJsonStringSync(ErpEmitterCaseFields)(input)}`,
                    `errors=${encodeJsonStringSync(Schema.Array(OracleFindingFields))(errorFindings.slice(0, 5))}`,
                  ].join("\n"),
                );
              }

              expect(rendered.xml).toContain("<Bundle");
              expect(rendered.xml).toContain("<Composition");
              expect(rendered.xml).toContain("<MedicationRequest");
              expect(rendered.bundleEntryCount).toBeGreaterThanOrEqual(7);
            }),
          stopCondition: overnightSearchStopCondition,
          suite: overnightEmitterSuite,
          summarizeTags: summarizeEmitterTags,
          title: "Freetext emitter property",
        });

        yield* Effect.tryPromise(() =>
          fc.assert(trackedProperty.property, {
            numRuns: ORACLE_PROPERTY_NUM_RUNS,
          }),
        );
        yield* Effect.sync(() =>
          trackedProperty.complete(
            "passed",
            `Completed ${ORACLE_PROPERTY_NUM_RUNS} freetext iterations`,
          ),
        );
      }),
    ORACLE_TEST_TIMEOUT,
  );
});
