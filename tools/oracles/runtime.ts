import { Effect } from "effect";

import type { OracleExecutionResult, OraclePlan } from "./types";

import { runBfbOracle } from "./bfb/run";
import { runBmpOracle, runExecutableBmpOracleEffect } from "./bmp/run";
import { runCodingOracle } from "./coding/run";
import { runExecutableFhirOracleEffect, runFhirOracle } from "./fhir/run";
import { buildOraclePlan } from "./framework";
import { runHeilmittelOracle } from "./heilmittel/run";
import { runExecutableKvdtOracleEffect, runKvdtOracle } from "./kvdt/run";
import { runTssOracle } from "./tss/run";

export const resolveOracleFamily = (artifactFamily: string) => {
  switch (artifactFamily) {
    case "BFB":
      return "BFB";
    case "BMP":
      return "BMP";
    case "EAU":
      return "eAU";
    case "ERP":
      return "eRezept";
    case "EVDGA":
      return "eVDGA";
    case "Heilmittel":
      return "Heilmittel";
    case "ICD":
      return "ICD";
    case "KVDT":
      return "KVDT";
    case "TSS":
      return "TSS";
    default:
      return undefined;
  }
};

const fallbackResult = (
  family: string,
  summary: string,
): OracleExecutionResult => ({
  family,
  findings: [
    {
      code: "ORACLE_PLUGIN_UNSUPPORTED",
      message: summary,
      severity: "error",
    },
  ],
  passed: false,
  summary,
});

export const executeOraclePlanEffect = Effect.fn("oracles.executeOraclePlan")(
  function* ({
    executionMode = "local",
    payloadPreview,
    payloadPreviewXml,
    plan,
  }: {
    executionMode?: "executable" | "local";
    payloadPreview?: string;
    payloadPreviewXml?: string;
    plan: OraclePlan;
  }) {
    switch (plan.family) {
      case "BFB":
        return runBfbOracle({ payloadPreview });
      case "BMP":
        return executionMode === "executable"
          ? yield* runExecutableBmpOracleEffect({ xml: payloadPreviewXml })
          : runBmpOracle({ xml: payloadPreviewXml });
      case "eAU":
        return executionMode === "executable"
          ? yield* runExecutableFhirOracleEffect({
              family: "eAU",
              xml: payloadPreviewXml,
            })
          : runFhirOracle({
              family: "eAU",
              xml: payloadPreviewXml,
            });
      case "eRezept":
        return executionMode === "executable"
          ? yield* runExecutableFhirOracleEffect({
              family: "eRezept",
              xml: payloadPreviewXml,
            })
          : runFhirOracle({
              family: "eRezept",
              xml: payloadPreviewXml,
            });
      case "eVDGA":
        return executionMode === "executable"
          ? yield* runExecutableFhirOracleEffect({
              family: "eVDGA",
              xml: payloadPreviewXml,
            })
          : runFhirOracle({
              family: "eVDGA",
              xml: payloadPreviewXml,
            });
      case "Heilmittel":
        return runHeilmittelOracle({ payloadPreview });
      case "ICD":
        return runCodingOracle({ payloadPreview });
      case "KVDT":
        return executionMode === "executable"
          ? yield* runExecutableKvdtOracleEffect({ payloadPreview })
          : runKvdtOracle({ payloadPreview });
      case "TSS":
        return runTssOracle({ payloadPreview, payloadPreviewXml });
      default:
        return fallbackResult(
          plan.family,
          `No local oracle executor is implemented for ${plan.family}.`,
        );
    }
  },
);

export const executeOraclePlan = (args: {
  executionMode?: "executable" | "local";
  payloadPreview?: string;
  payloadPreviewXml?: string;
  plan: OraclePlan;
}): Promise<OracleExecutionResult> =>
  Effect.runPromise(executeOraclePlanEffect(args));

export const buildAndExecuteOraclePlanEffect = Effect.fn(
  "oracles.buildAndExecuteOraclePlan",
)(function* ({
  artifactId,
  documentId,
  executionMode = "local",
  family,
  payloadPreview,
  payloadPreviewXml,
  profileVersion,
}: {
  artifactId?: string;
  documentId?: string;
  executionMode?: "executable" | "local";
  family: string;
  payloadPreview?: string;
  payloadPreviewXml?: string;
  profileVersion?: string;
}) {
  const plan = buildOraclePlan({
    artifactId,
    documentId,
    family,
    profileVersion,
  });

  if (!plan) {
    return undefined;
  }

  const report = yield* executeOraclePlanEffect({
    executionMode,
    payloadPreview,
    payloadPreviewXml,
    plan,
  });

  return {
    plan,
    report,
  };
});

export const buildAndExecuteOraclePlan = (args: {
  artifactId?: string;
  documentId?: string;
  executionMode?: "executable" | "local";
  family: string;
  payloadPreview?: string;
  payloadPreviewXml?: string;
  profileVersion?: string;
}) => Effect.runPromise(buildAndExecuteOraclePlanEffect(args));
