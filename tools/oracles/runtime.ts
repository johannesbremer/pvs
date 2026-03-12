import type { OracleExecutionResult, OraclePlan } from "./types";

import { runBfbOracle } from "./bfb/run";
import { runBmpOracle } from "./bmp/run";
import { runExecutableBmpOracle } from "./bmp/run";
import { runCodingOracle } from "./coding/run";
import { runExecutableFhirOracle, runFhirOracle } from "./fhir/run";
import { buildOraclePlan } from "./framework";
import { runHeilmittelOracle } from "./heilmittel/run";
import { runExecutableKvdtOracle, runKvdtOracle } from "./kvdt/run";
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

export const executeOraclePlan = ({
  executionMode = "local",
  payloadPreview,
  payloadPreviewXml,
  plan,
}: {
  executionMode?: "executable" | "local";
  payloadPreview?: string;
  payloadPreviewXml?: string;
  plan: OraclePlan;
}): Promise<OracleExecutionResult> => {
  switch (plan.family) {
    case "BFB":
      return Promise.resolve(runBfbOracle({ payloadPreview }));
    case "BMP":
      return executionMode === "executable"
        ? runExecutableBmpOracle({ xml: payloadPreviewXml })
        : Promise.resolve(runBmpOracle({ xml: payloadPreviewXml }));
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
    case "eVDGA":
      return executionMode === "executable"
        ? runExecutableFhirOracle({
            family: "eVDGA",
            xml: payloadPreviewXml,
          })
        : Promise.resolve(
            runFhirOracle({
              family: "eVDGA",
              xml: payloadPreviewXml,
            }),
          );
    case "Heilmittel":
      return Promise.resolve(runHeilmittelOracle({ payloadPreview }));
    case "ICD":
      return Promise.resolve(runCodingOracle({ payloadPreview }));
    case "KVDT":
      return executionMode === "executable"
        ? runExecutableKvdtOracle({ payloadPreview })
        : Promise.resolve(runKvdtOracle({ payloadPreview }));
    case "TSS":
      return Promise.resolve(
        runTssOracle({ payloadPreview, payloadPreviewXml }),
      );
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
}) => {
  const plan = buildOraclePlan({
    artifactId,
    documentId,
    family,
    profileVersion,
  });

  if (!plan) {
    return Promise.resolve(undefined);
  }

  return executeOraclePlan({
    executionMode,
    payloadPreview,
    payloadPreviewXml,
    plan,
  }).then((report) => ({
    plan,
    report,
  }));
};
