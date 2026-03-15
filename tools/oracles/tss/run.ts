import { Schema } from "effect";

import type { OracleExecutionResult } from "../types";

import { parseOfficialTssSearchsetXml } from "../../../src/codecs/xml/tss";
import {
  filterSelectableTssAppointments,
  type TssAppointmentPreview,
  type TssSelectionCriteria,
} from "../../../src/domain/appointments-referrals";
import { decodeJsonStringSync, encodeJsonStringSync } from "../json-schema";

export const TssAppointmentPreviewFields = Schema.Struct({
  appointmentId: Schema.optional(Schema.String),
  displayBucket: Schema.optional(Schema.String),
  end: Schema.optional(Schema.String),
  externalAppointmentId: Schema.optional(Schema.String),
  organizationId: Schema.String,
  patientId: Schema.optional(Schema.String),
  source: Schema.Literal("internal", "tss"),
  start: Schema.String,
  status: Schema.Literal(
    "booked",
    "cancelled",
    "fulfilled",
    "noshow",
    "proposed",
  ),
  tssServiceType: Schema.optional(Schema.String),
  vermittlungscode: Schema.optional(Schema.String),
});

export const TssSelectionCriteriaFields = Schema.Struct({
  displayBucket: Schema.optional(Schema.String),
  organizationId: Schema.String,
  startFrom: Schema.optional(Schema.String),
  startTo: Schema.optional(Schema.String),
  tssServiceType: Schema.optional(Schema.String),
  vermittlungscode: Schema.optional(Schema.String),
});

export const TssOraclePreviewFields = Schema.Struct({
  appointments: Schema.Array(TssAppointmentPreviewFields),
  caseId: Schema.optional(Schema.String),
  criteria: TssSelectionCriteriaFields,
  expectedSelectableAppointmentIds: Schema.Array(Schema.String),
  sourceReference: Schema.optional(Schema.String),
});

type TssOraclePreview = typeof TssOraclePreviewFields.Type;

export const decodeTssOraclePreviewSync = decodeJsonStringSync(
  TssOraclePreviewFields,
);

export const encodeTssOraclePreviewSync = encodeJsonStringSync(
  TssOraclePreviewFields,
);

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
  payloadPreviewXml,
}: {
  payloadPreview?: string;
  payloadPreviewXml?: string;
}): OracleExecutionResult => {
  if (payloadPreviewXml && payloadPreviewXml.trim().length > 0) {
    const parsed = parseOfficialTssSearchsetXml(payloadPreviewXml);
    const findings = [
      makeFinding(
        "TSS_OFFICIAL_XML_PARSED",
        "info",
        `Parsed ${parsed.appointments.length} appointment(s) from official TSS XML.`,
      ),
    ];

    if (parsed.appointments.length === 0) {
      findings.push(
        makeFinding(
          "TSS_OFFICIAL_XML_NO_APPOINTMENTS",
          "error",
          "No Appointment resources were found in the official TSS XML payload.",
        ),
      );
    }

    if (
      parsed.appointments.some(
        (appointment) =>
          appointment.start.length === 0 ||
          appointment.externalAppointmentId.length === 0,
      )
    ) {
      findings.push(
        makeFinding(
          "TSS_OFFICIAL_XML_REQUIRED_FIELDS_MISSING",
          "error",
          "At least one parsed TSS appointment is missing its id or start timestamp.",
        ),
      );
    }

    return {
      family: "TSS",
      findings,
      passed: findings.every((finding) => finding.severity !== "error"),
      summary: findings.every((finding) => finding.severity !== "error")
        ? "Official TSS XML satisfied the parser checks."
        : "Official TSS XML failed the parser checks.",
    };
  }

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
    preview = decodeTssOraclePreviewSync(payloadPreview);
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
