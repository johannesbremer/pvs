import type { OracleExecutionResult } from "../types";

export const runHeilmittelOracle = ({
  payloadPreview,
}: {
  payloadPreview?: string;
}): OracleExecutionResult => {
  const findings = [];

  if (!payloadPreview || payloadPreview.trim().length === 0) {
    findings.push({
      code: "HEILMITTEL_PAYLOAD_PREVIEW_MISSING",
      severity: "error" as const,
      message: "No Heilmittel payload preview was provided to the oracle runner.",
    });
  }

  return {
    family: "Heilmittel",
    passed: findings.length === 0,
    findings,
    summary:
      findings.length === 0
        ? "Heilmittel preview satisfied the local fixture-backed checks."
        : "Heilmittel preview failed the local fixture-backed checks.",
  };
};
