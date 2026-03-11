import type { OracleExecutionResult } from "../types";

interface HeilmittelApprovalPreview {
  readonly diagnosegruppen?: readonly string[];
  readonly heilmittelCodes?: readonly string[];
  readonly validUntil?: string;
}

interface HeilmittelCatalogEntry {
  readonly blankoEligible?: boolean;
  readonly code: string;
  readonly diagnosegruppe: string;
  readonly heilmittelbereich: string;
  readonly kind: "ergaenzend" | "standardkombination" | "vorrangig";
}

interface HeilmittelOraclePreview {
  readonly approval?: HeilmittelApprovalPreview;
  readonly blankoFlag?: boolean;
  readonly caseId?: string;
  readonly catalogEntries: readonly HeilmittelCatalogEntry[];
  readonly diagnosegruppe: string;
  readonly diagnosisCodes: readonly string[];
  readonly heilmittelbereich: string;
  readonly issueDate?: string;
  readonly items: readonly HeilmittelOrderItem[];
  readonly maxTotalUnits?: number;
  readonly requiresLongTermApproval?: boolean;
  readonly sourceReference?: string;
}

interface HeilmittelOrderItem {
  readonly code: string;
  readonly kind: "ergaenzend" | "standardkombination" | "vorrangig";
  readonly units: number;
}

const parsePreview = (payloadPreview: string) => {
  const parsed = JSON.parse(payloadPreview) as HeilmittelOraclePreview;
  return parsed;
};

const makeFinding = (
  code: string,
  severity: "error" | "info" | "warning",
  message: string,
) => ({
  code,
  message,
  severity,
});

export const runHeilmittelOracle = ({
  payloadPreview,
}: {
  payloadPreview?: string;
}): OracleExecutionResult => {
  if (!payloadPreview || payloadPreview.trim().length === 0) {
    return {
      family: "Heilmittel",
      findings: [
        makeFinding(
          "HEILMITTEL_PAYLOAD_PREVIEW_MISSING",
          "error",
          "No Heilmittel payload preview was provided to the oracle runner.",
        ),
      ],
      passed: false,
      summary: "Heilmittel preview failed the official fixture-backed checks.",
    };
  }

  let preview: HeilmittelOraclePreview;
  try {
    preview = parsePreview(payloadPreview);
  } catch (error) {
    return {
      family: "Heilmittel",
      findings: [
        makeFinding(
          "HEILMITTEL_FIXTURE_INVALID_JSON",
          "error",
          error instanceof Error
            ? `Heilmittel oracle preview is not valid JSON: ${error.message}`
            : "Heilmittel oracle preview is not valid JSON.",
        ),
      ],
      passed: false,
      summary: "Heilmittel preview failed the official fixture-backed checks.",
    };
  }

  const findings: OracleExecutionResult["findings"][number][] = [];
  const matchingCatalogEntries = preview.catalogEntries.filter(
    (entry) =>
      entry.heilmittelbereich === preview.heilmittelbereich &&
      entry.diagnosegruppe === preview.diagnosegruppe,
  );

  if (preview.diagnosisCodes.length === 0) {
    findings.push(
      makeFinding(
        "HEILMITTEL_DIAGNOSIS_REQUIRED",
        "error",
        "Heilmittel orders require at least one ICD-10 diagnosis code.",
      ),
    );
  }

  if (!preview.blankoFlag && preview.items.length === 0) {
    findings.push(
      makeFinding(
        "HEILMITTEL_CODE_REQUIRED",
        "error",
        "Non-blanko Heilmittel orders require at least one selected Heilmittel.",
      ),
    );
  }

  if (preview.blankoFlag) {
    if (matchingCatalogEntries.length === 0) {
      findings.push(
        makeFinding(
          "HEILMITTEL_BLANKO_CONTEXT_MISSING",
          "error",
          "Blanko Heilmittel orders require catalog context for the selected diagnosegruppe.",
        ),
      );
    } else if (
      matchingCatalogEntries.some((entry) => entry.blankoEligible !== true)
    ) {
      findings.push(
        makeFinding(
          "HEILMITTEL_BLANKO_NOT_ELIGIBLE",
          "error",
          "The selected diagnosegruppe is not fully blanko-eligible in the supplied official catalog context.",
        ),
      );
    }
  }

  for (const item of preview.items) {
    const catalogEntry = matchingCatalogEntries.find(
      (entry) => entry.code === item.code && entry.kind === item.kind,
    );

    if (!catalogEntry) {
      findings.push(
        makeFinding(
          "HEILMITTEL_CATALOG_ENTRY_MISSING",
          "error",
          `Heilmittel code ${item.code} is not available for diagnosegruppe ${preview.diagnosegruppe} in ${preview.heilmittelbereich}.`,
        ),
      );
    }
  }

  if (
    typeof preview.maxTotalUnits === "number" &&
    preview.items.reduce((sum, item) => sum + item.units, 0) >
      preview.maxTotalUnits
  ) {
    findings.push(
      makeFinding(
        "HEILMITTEL_MAX_TOTAL_UNITS_EXCEEDED",
        "error",
        `The supplied Heilmittel selection exceeds the official total unit limit of ${preview.maxTotalUnits}.`,
      ),
    );
  }

  if (preview.requiresLongTermApproval) {
    if (!preview.approval) {
      findings.push(
        makeFinding(
          "HEILMITTEL_APPROVAL_REQUIRED",
          "error",
          "This official Prüffall requires a patient-specific long-term approval.",
        ),
      );
    } else {
      if (
        preview.approval.validUntil &&
        preview.issueDate &&
        preview.issueDate > preview.approval.validUntil
      ) {
        findings.push(
          makeFinding(
            "HEILMITTEL_APPROVAL_EXPIRED",
            "error",
            "The patient-specific long-term approval has expired for the issue date.",
          ),
        );
      }

      if (
        preview.approval.diagnosegruppen &&
        preview.approval.diagnosegruppen.length > 0 &&
        !preview.approval.diagnosegruppen.includes(preview.diagnosegruppe)
      ) {
        findings.push(
          makeFinding(
            "HEILMITTEL_APPROVAL_DIAGNOSEGRUPPE_MISMATCH",
            "error",
            "The patient-specific long-term approval does not cover the selected diagnosegruppe.",
          ),
        );
      }

      if (
        preview.approval.heilmittelCodes &&
        preview.approval.heilmittelCodes.length > 0 &&
        !preview.items.some((item) =>
          preview.approval?.heilmittelCodes?.includes(item.code),
        )
      ) {
        findings.push(
          makeFinding(
            "HEILMITTEL_APPROVAL_CODE_MISMATCH",
            "error",
            "The patient-specific long-term approval does not cover any selected Heilmittel code.",
          ),
        );
      }
    }
  }

  if (preview.caseId) {
    findings.push(
      makeFinding(
        "HEILMITTEL_OFFICIAL_PRUEFFALL",
        "info",
        `Validated official Heilmittel Prüffall ${preview.caseId}${preview.sourceReference ? ` (${preview.sourceReference})` : ""}.`,
      ),
    );
  }

  return {
    family: "Heilmittel",
    findings,
    passed: findings.every((finding) => finding.severity !== "error"),
    summary: findings.every((finding) => finding.severity !== "error")
      ? "Heilmittel preview satisfied the official fixture-backed checks."
      : "Heilmittel preview failed the official fixture-backed checks.",
  };
};
