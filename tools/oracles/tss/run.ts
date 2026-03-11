import type { OracleExecutionResult } from "../types";

import {
  filterSelectableTssAppointments,
  type TssAppointmentPreview,
  type TssSelectionCriteria,
} from "../../../src/domain/appointments-referrals";

interface TssOraclePreview {
  readonly appointments: readonly TssAppointmentPreview[];
  readonly caseId?: string;
  readonly criteria: TssSelectionCriteria;
  readonly expectedSelectableAppointmentIds: readonly string[];
  readonly sourceReference?: string;
}

const makeFinding = (
  code: string,
  severity: "error" | "info" | "warning",
  message: string,
) => ({
  code,
  message,
  severity,
});

export const runTssOracle = ({
  payloadPreview,
}: {
  payloadPreview?: string;
}): OracleExecutionResult => {
  if (!payloadPreview || payloadPreview.trim().length === 0) {
    return {
      family: "TSS",
      findings: [
        makeFinding(
          "TSS_PAYLOAD_PREVIEW_MISSING",
          "error",
          "No TSS payload preview was provided to the oracle runner.",
        ),
      ],
      passed: false,
      summary: "TSS preview failed the fixture-backed checks.",
    };
  }

  let preview: TssOraclePreview;
  try {
    preview = JSON.parse(payloadPreview) as TssOraclePreview;
  } catch (error) {
    return {
      family: "TSS",
      findings: [
        makeFinding(
          "TSS_FIXTURE_INVALID_JSON",
          "error",
          error instanceof Error
            ? `TSS oracle preview is not valid JSON: ${error.message}`
            : "TSS oracle preview is not valid JSON.",
        ),
      ],
      passed: false,
      summary: "TSS preview failed the fixture-backed checks.",
    };
  }

  const findings = [];
  if (preview.caseId) {
    findings.push(
      makeFinding(
        "TSS_OFFICIAL_FIXTURE",
        "info",
        `Validated TSS fixture ${preview.caseId}${preview.sourceReference ? ` (${preview.sourceReference})` : ""}.`,
      ),
    );
  }

  const selected = filterSelectableTssAppointments(
    preview.appointments,
    preview.criteria,
  );
  const actualIds = selected
    .map((appointment) => appointment.appointmentId)
    .filter(
      (appointmentId): appointmentId is string => appointmentId !== undefined,
    )
    .sort();
  const expectedIds = [...preview.expectedSelectableAppointmentIds].sort();

  findings.push(
    makeFinding(
      "TSS_SELECTABLE_COUNT",
      "info",
      `TSS selection produced ${actualIds.length} selectable appointment(s).`,
    ),
  );

  const mismatch =
    actualIds.length !== expectedIds.length ||
    expectedIds.some(
      (appointmentId, index) => appointmentId !== actualIds[index],
    );

  if (mismatch) {
    findings.push(
      makeFinding(
        "TSS_SELECTION_MISMATCH",
        "error",
        `Expected selectable appointments [${expectedIds.join(", ")}] but got [${actualIds.join(", ")}].`,
      ),
    );
  }

  return {
    family: "TSS",
    findings,
    passed: findings.every((finding) => finding.severity !== "error"),
    summary: findings.every((finding) => finding.severity !== "error")
      ? "TSS preview satisfied the fixture-backed checks."
      : "TSS preview failed the fixture-backed checks.",
  };
};
