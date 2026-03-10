import { runBmpOracle } from "./bmp/run";
import { runBfbOracle } from "./bfb/run";
import { runExecutableFhirOracle, runFhirOracle } from "./fhir/run";
import { runHeilmittelOracle } from "./heilmittel/run";
import { runExecutableBmpOracle } from "./bmp/run";
import { runExecutableKvdtOracle, runKvdtOracle } from "./kvdt/run";
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
  executionMode = "local",
  payloadPreviewXml,
  payloadPreview,
}: {
  plan: OraclePlan;
  executionMode?: "local" | "executable";
  payloadPreviewXml?: string;
  payloadPreview?: string;
}): Promise<OracleExecutionResult> => {
  switch (plan.family) {
    case "eRezept":
      return executionMode === "executable"
        ? runExecutableFhirOracle({
            family: "eRezept",
            xml: payloadPreviewXml,
          })
        : Promise.resolve(
            runFhirOracle({
              family: "eRezept",
              xml: payloadPreviewXml,
            }),
          );
    case "eAU":
      return executionMode === "executable"
        ? runExecutableFhirOracle({
            family: "eAU",
            xml: payloadPreviewXml,
          })
        : Promise.resolve(
            runFhirOracle({
              family: "eAU",
              xml: payloadPreviewXml,
            }),
          );
    case "KVDT":
      return executionMode === "executable"
        ? runExecutableKvdtOracle({ payloadPreview })
        : Promise.resolve(runKvdtOracle({ payloadPreview }));
    case "BMP":
      return executionMode === "executable"
        ? runExecutableBmpOracle({ xml: payloadPreviewXml })
        : Promise.resolve(runBmpOracle({ xml: payloadPreviewXml }));
    case "BFB":
      return Promise.resolve(runBfbOracle({ payloadPreview }));
    case "Heilmittel":
      return Promise.resolve(runHeilmittelOracle({ payloadPreview }));
    default:
      return Promise.resolve(
        fallbackResult(
          plan.family,
          `No local oracle executor is implemented for ${plan.family}.`,
        ),
      );
  }
};

export const buildAndExecuteOraclePlan = ({
  family,
  artifactId,
  documentId,
  profileVersion,
  executionMode = "local",
  payloadPreviewXml,
  payloadPreview,
}: {
  family: string;
  artifactId?: string;
  documentId?: string;
  profileVersion?: string;
  executionMode?: "local" | "executable";
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
    return Promise.resolve(undefined);
  }

  return executeOraclePlan({
    plan,
    executionMode,
    payloadPreviewXml,
    payloadPreview,
  }).then((report) => ({
    plan,
    report,
  }));
};
