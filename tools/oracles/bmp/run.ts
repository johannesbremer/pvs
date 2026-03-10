import type { OracleExecutionResult } from "../types";

export const runBmpOracle = ({
  xml,
}: {
  xml?: string;
}): OracleExecutionResult => {
  const findings = [];

  if (!xml || !xml.includes("<?xml")) {
    findings.push({
      code: "BMP_XML_MISSING",
      severity: "error" as const,
      message: "BMP XML input is missing or malformed.",
    });
  }

  return {
    family: "BMP",
    passed: findings.length === 0,
    findings,
    summary:
      findings.length === 0
        ? "BMP XML satisfied the local oracle checks."
        : "BMP XML failed the local oracle checks.",
  };
};
