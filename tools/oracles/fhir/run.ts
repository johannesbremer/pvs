import type { OracleExecutionResult } from "../types";

const missingTagFinding = (tagName: string) => ({
  code: `FHIR_TAG_${tagName.toUpperCase()}_MISSING`,
  severity: "error" as const,
  message: `Expected <${tagName}> in rendered FHIR XML.`,
});

export const runFhirOracle = ({
  family,
  xml,
}: {
  family: "eRezept" | "eAU";
  xml?: string;
}): OracleExecutionResult => {
  const findings = [];

  if (!xml || xml.trim().length === 0) {
    findings.push({
      code: "FHIR_XML_MISSING",
      severity: "error" as const,
      message: "No rendered FHIR XML was provided to the oracle runner.",
    });
  } else {
    if (!xml.includes("<Bundle")) {
      findings.push(missingTagFinding("Bundle"));
    }
    if (!xml.includes("<Composition")) {
      findings.push(missingTagFinding("Composition"));
    }

    if (family === "eRezept") {
      if (!xml.includes("<MedicationRequest")) {
        findings.push(missingTagFinding("MedicationRequest"));
      }
      if (!xml.includes("<Medication")) {
        findings.push(missingTagFinding("Medication"));
      }
    }

    if (family === "eAU") {
      if (!xml.includes("<Encounter")) {
        findings.push(missingTagFinding("Encounter"));
      }
      if (!xml.includes("<Condition")) {
        findings.push(missingTagFinding("Condition"));
      }
    }
  }

  return {
    family,
    passed: findings.length === 0,
    findings,
    summary:
      findings.length === 0
        ? `${family} XML satisfied the local FHIR oracle checks.`
        : `${family} XML failed ${findings.length} local FHIR oracle checks.`,
  };
};
