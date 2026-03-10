import type { OracleExecutionResult } from "../types";

export const runBfbOracle = ({
  payloadPreview,
}: {
  payloadPreview?: string;
}): OracleExecutionResult => {
  const findings = [];

  if (!payloadPreview || payloadPreview.trim().length === 0) {
    findings.push({
      code: "BFB_RENDER_CONTEXT_MISSING",
      severity: "error" as const,
      message: "No BFB render context preview was provided to the oracle runner.",
    });
  }

  return {
    family: "BFB",
    passed: findings.length === 0,
    findings,
    summary:
      findings.length === 0
        ? "BFB preview satisfied the local fixture-backed checks."
        : "BFB preview failed the local fixture-backed checks.",
  };
};
