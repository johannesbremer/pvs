import { Effect, Schema } from "effect";

import type { OracleExecutionResult } from "../tools/oracles/types";
import type {
  ErpDifferentialMutation,
  ErpEmitterCase,
} from "./overnight/erezept-oracle-helpers";

import { runFhirOracle } from "../tools/oracles/fhir/run";
import { encodeJsonStringSync } from "../tools/oracles/json-schema";
import { persistErpOracleReplayCaseEffect } from "./overnight/erezept-oracle-helpers";

const DifferentialSourceKind = Schema.Literal("emitted", "official");
const DifferentialExpectedComparison = Schema.Literal(
  "exec-reject-local-pass",
  "same-reject",
);

export type DifferentialLanePayload =
  | {
      input: ErpEmitterCase;
      mutation: ErpDifferentialMutation;
      sourceKind: "emitted";
    }
  | {
      mutation: ErpDifferentialMutation;
      sourceKind: "official";
    };

export const DifferentialReplayPayloadFields = Schema.Struct({
  expectedComparison: DifferentialExpectedComparison,
  input: Schema.optional(
    Schema.Struct({
      authoredOn: Schema.String,
      dosageText: Schema.optional(Schema.String),
      medicationDisplay: Schema.String,
      orderKind: Schema.Literal("freetext", "pzn"),
      patientFamily: Schema.String,
      patientGiven: Schema.String,
      pzn: Schema.optional(Schema.String),
    }),
  ),
  mutationId: Schema.String,
  sourceKind: DifferentialSourceKind,
});

export const assertDifferentialClassificationEffect = ({
  baseXml,
  cacheDir,
  execute,
  lanePayload,
  scenario,
}: {
  baseXml: string;
  cacheDir: string;
  execute: (args: {
    cacheDir: string;
    family: "eRezept";
    xml: string;
  }) => Effect.Effect<OracleExecutionResult, unknown, never>;
  lanePayload: DifferentialLanePayload;
  scenario: string;
}) =>
  Effect.gen(function* () {
    const mutatedXml = lanePayload.mutation.mutate(baseXml);
    const localResult = runFhirOracle({
      family: "eRezept",
      xml: mutatedXml,
    });
    const executableResult = yield* execute({
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

export const assertExpectedComparisonEffect = ({
  executableResult,
  lanePayload,
  localResult,
  mutation,
  scenario,
}: {
  executableResult: OracleExecutionResult;
  lanePayload: DifferentialLanePayload;
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
      payload: {
        expectedComparison: mutation.expectedComparison,
        input: "input" in lanePayload ? lanePayload.input : undefined,
        mutationId: mutation.id,
        sourceKind: lanePayload.sourceKind,
      },
      payloadSchema: DifferentialReplayPayloadFields,
      scenario,
    });

    throw new Error(
      [
        `ERP differential mutation changed classification from ${mutation.expectedComparison}.`,
        `replay=${replayPath}`,
        `testCase=${encodeJsonStringSync(DifferentialReplayPayloadFields)({
          expectedComparison: mutation.expectedComparison,
          input: "input" in lanePayload ? lanePayload.input : undefined,
          mutationId: mutation.id,
          sourceKind: lanePayload.sourceKind,
        })}`,
        `localPassed=${localResult.passed}`,
        `executablePassed=${executableResult.passed}`,
        `executableSummary=${executableResult.summary}`,
      ].join("\n"),
    );
  });
