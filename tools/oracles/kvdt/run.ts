import type { OracleExecutionResult } from "../types";

export const runKvdtOracle = ({
  payloadPreview,
}: {
  payloadPreview?: string;
}): OracleExecutionResult => {
  const findings = [];

  if (!payloadPreview || payloadPreview.trim().length === 0) {
    findings.push({
      code: "KVDT_PAYLOAD_PREVIEW_MISSING",
      severity: "error" as const,
      message: "No KVDT payload preview was provided to the oracle runner.",
    });
  }

  return {
    family: "KVDT",
    passed: findings.length === 0,
    findings,
    summary:
      findings.length === 0
        ? "KVDT preview satisfied the local oracle checks."
        : "KVDT preview failed the local oracle checks.",
  };
};
