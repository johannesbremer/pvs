import { describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import fc from "fast-check";

import {
  runExecutableFhirOracleWithServerEffect,
  runFhirOracle,
} from "../../tools/oracles/fhir/run";
import { encodeJsonStringSync } from "../../tools/oracles/json-schema";
import {
  assertExpectedComparisonEffect,
  type DifferentialLanePayload,
} from "../erezept-differential-shared";
import { resolveOracleTestCache } from "../oracle-test-cache";
import { ORACLE_PROPERTY_NUM_RUNS, ORACLE_TEST_TIMEOUT } from "../timeouts";
import { trackedAsyncProperty } from "./dashboard";
import {
  emittedMismatchMutations,
  emittedParityMutations,
  erpFreetextCaseArbitrary,
  erpPznCaseArbitrary,
  loadOfficialErpExampleXmlEffect,
  officialMismatchMutations,
  officialParityMutations,
  renderGeneratedErpXmlEffect,
} from "./erezept-oracle-helpers";

const propertyDifferentialSuite = "property eRezept differential oracle";
const differentialSearchStopCondition =
  "Run until canceled, timeout, or the first mismatch between the local and executable oracle classifications.";

const DifferentialSourceKind = Schema.Literal("emitted", "official");
const DifferentialExpectedComparison = Schema.Literal(
  "exec-reject-local-pass",
  "same-reject",
);

const DifferentialExampleFields = Schema.Struct({
  expectedComparison: DifferentialExpectedComparison,
  input: Schema.optional(
    Schema.Struct({
      medicationDisplay: Schema.String,
      orderKind: Schema.Literal("freetext", "pzn"),
      patient: Schema.String,
      pzn: Schema.optional(Schema.String),
    }),
  ),
  mutationId: Schema.String,
  sourceKind: DifferentialSourceKind,
});

const describeDifferentialExample = (testCase: DifferentialLanePayload) =>
  encodeJsonStringSync(DifferentialExampleFields)({
    expectedComparison: testCase.mutation.expectedComparison,
    input:
      "input" in testCase
        ? {
            medicationDisplay: testCase.input.medicationDisplay,
            orderKind: testCase.input.orderKind,
            patient: `${testCase.input.patientGiven} ${testCase.input.patientFamily}`,
            pzn: testCase.input.pzn,
          }
        : undefined,
    mutationId: testCase.mutation.id,
    sourceKind: testCase.sourceKind,
  });

const summarizeDifferentialTags = (
  testCase: DifferentialLanePayload,
): readonly string[] =>
  [
    `source:${testCase.sourceKind}`,
    `mutation:${testCase.mutation.id}`,
    `expected:${testCase.mutation.expectedComparison}`,
    ...("input" in testCase ? [`orderKind:${testCase.input.orderKind}`] : []),
  ] as const;

describe("property eRezept differential oracle", () => {
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
          tempPrefix: "kbv-property-erp-diff-parity-",
        });

        const trackedProperty = yield* trackedAsyncProperty({
          arbitrary: fc.oneof(
            fc.record({
              mutation: fc.constantFrom(...officialParityMutations),
              sourceKind: fc.constant<"official">("official"),
            }),
            fc.record({
              input: fc.oneof(erpPznCaseArbitrary, erpFreetextCaseArbitrary),
              mutation: fc.constantFrom(...emittedParityMutations),
              sourceKind: fc.constant<"emitted">("emitted"),
            }),
          ),
          configuredBudget: ORACLE_PROPERTY_NUM_RUNS,
          describeExample: describeDifferentialExample,
          id: "differential-parity-property",
          run: (testCase) =>
            Effect.gen(function* () {
              const baseXml =
                testCase.sourceKind === "official"
                  ? yield* loadOfficialErpExampleXmlEffect(cacheDir)
                  : (yield* renderGeneratedErpXmlEffect(testCase.input)).xml;
              const mutatedXml = testCase.mutation.mutate(baseXml);
              const localResult = runFhirOracle({
                family: "eRezept",
                xml: mutatedXml,
              });
              const executableResult =
                yield* runExecutableFhirOracleWithServerEffect({
                  cacheDir,
                  family: "eRezept",
                  serverInstanceKey: "overnight-differential-parity",
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
          stopCondition: differentialSearchStopCondition,
          suite: propertyDifferentialSuite,
          summarizeTags: summarizeDifferentialTags,
          title: "Parity property",
        });

        yield* Effect.tryPromise(() =>
          fc.assert(trackedProperty.property, {
            numRuns: ORACLE_PROPERTY_NUM_RUNS,
          }),
        );
        yield* Effect.sync(() =>
          trackedProperty.complete(
            "passed",
            `Completed ${ORACLE_PROPERTY_NUM_RUNS} parity iterations`,
          ),
        );
      }),
    { concurrent: true, timeout: ORACLE_TEST_TIMEOUT },
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
          tempPrefix: "kbv-property-erp-diff-mismatch-",
        });

        const trackedProperty = yield* trackedAsyncProperty({
          arbitrary: fc.oneof(
            fc.record({
              mutation: fc.constantFrom(...officialMismatchMutations),
              sourceKind: fc.constant<"official">("official"),
            }),
            fc.record({
              input: fc.oneof(erpPznCaseArbitrary, erpFreetextCaseArbitrary),
              mutation: fc.constantFrom(...emittedMismatchMutations),
              sourceKind: fc.constant<"emitted">("emitted"),
            }),
          ),
          configuredBudget: ORACLE_PROPERTY_NUM_RUNS,
          describeExample: describeDifferentialExample,
          id: "differential-mismatch-property",
          run: (testCase) =>
            Effect.gen(function* () {
              const baseXml =
                testCase.sourceKind === "official"
                  ? yield* loadOfficialErpExampleXmlEffect(cacheDir)
                  : (yield* renderGeneratedErpXmlEffect(testCase.input)).xml;
              const mutatedXml = testCase.mutation.mutate(baseXml);
              const localResult = runFhirOracle({
                family: "eRezept",
                xml: mutatedXml,
              });
              const executableResult =
                yield* runExecutableFhirOracleWithServerEffect({
                  cacheDir,
                  family: "eRezept",
                  serverInstanceKey: "overnight-differential-mismatch",
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
          stopCondition: differentialSearchStopCondition,
          suite: propertyDifferentialSuite,
          summarizeTags: summarizeDifferentialTags,
          title: "Mismatch property",
        });

        yield* Effect.tryPromise(() =>
          fc.assert(trackedProperty.property, {
            numRuns: ORACLE_PROPERTY_NUM_RUNS,
          }),
        );
        yield* Effect.sync(() =>
          trackedProperty.complete(
            "passed",
            `Completed ${ORACLE_PROPERTY_NUM_RUNS} mismatch iterations`,
          ),
        );
      }),
    { concurrent: true, timeout: ORACLE_TEST_TIMEOUT },
  );
});
