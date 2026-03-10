import { runBmpOracle } from "./bmp/run";
import { runFhirOracle } from "./fhir/run";
import { runKvdtOracle } from "./kvdt/run";
import { buildOraclePlan } from "./framework";
import type { OracleExecutionResult, OraclePlan } from "./types";

export const resolveOracleFamily = (artifactFamily: string) => {
  switch (artifactFamily) {
    case "ERP":
      return "eRezept";
    case "EAU":
      return "eAU";
    case "KVDT":
      return "KVDT";
    case "BMP":
      return "BMP";
    case "Heilmittel":
      return "Heilmittel";
    case "BFB":
      return "BFB";
    default:
      return undefined;
  }
};

const fallbackResult = (
  family: string,
  summary: string,
): OracleExecutionResult => ({
  family,
  passed: false,
  findings: [
    {
      code: "ORACLE_PLUGIN_UNSUPPORTED",
      severity: "error",
      message: summary,
    },
  ],
  summary,
});

export const executeOraclePlan = ({
  plan,
  payloadPreviewXml,
  payloadPreview,
}: {
  plan: OraclePlan;
  payloadPreviewXml?: string;
  payloadPreview?: string;
}): OracleExecutionResult => {
  switch (plan.family) {
    case "eRezept":
      return runFhirOracle({
        family: "eRezept",
        xml: payloadPreviewXml,
      });
    case "eAU":
      return runFhirOracle({
        family: "eAU",
        xml: payloadPreviewXml,
      });
    case "KVDT":
      return runKvdtOracle({ payloadPreview });
    case "BMP":
      return runBmpOracle({ xml: payloadPreviewXml });
    default:
      return fallbackResult(
        plan.family,
        `No local oracle executor is implemented for ${plan.family}.`,
      );
  }
};

export const buildAndExecuteOraclePlan = ({
  family,
  artifactId,
  documentId,
  profileVersion,
  payloadPreviewXml,
  payloadPreview,
}: {
  family: string;
  artifactId?: string;
  documentId?: string;
  profileVersion?: string;
  payloadPreviewXml?: string;
  payloadPreview?: string;
}) => {
  const plan = buildOraclePlan({
    family,
    artifactId,
    documentId,
    profileVersion,
  });

  if (!plan) {
    return undefined;
  }

  return {
    plan,
    report: executeOraclePlan({
      plan,
      payloadPreviewXml,
      payloadPreview,
    }),
  };
};
