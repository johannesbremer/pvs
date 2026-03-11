import { evaluateCodingRules } from "../../../src/domain/coding-rules";
import type { OracleExecutionResult } from "../types";

type CodingOraclePreview = {
  readonly caseId?: string;
  readonly sourceReference?: string;
  readonly patientId?: string;
  readonly patient: {
    readonly birthDate?: string;
    readonly administrativeGender?: {
      readonly code: string;
    };
  };
  readonly diagnosis: {
    readonly patientId?: string;
    readonly icdCode: string;
    readonly category: "acute" | "dauerdiagnose" | "anamnestisch";
    readonly diagnosensicherheit?: string;
    readonly isPrimary?: boolean;
  };
  readonly billingCaseId?: string;
  readonly caseDiagnoses?: ReadonlyArray<{
    readonly billingCaseId?: string;
    readonly recordStatus: "active" | "cancelled" | "superseded";
    readonly isPrimary?: boolean;
  }>;
  readonly catalogEntry?: {
    readonly code: string;
    readonly text: string;
    readonly isBillable: boolean;
    readonly notationFlag?: string;
    readonly ageLower?: number;
    readonly ageUpper?: number;
    readonly ageErrorType?: string;
    readonly genderConstraint?: string;
    readonly genderErrorType?: string;
    readonly rareDiseaseFlag?: boolean;
  };
  readonly createdAt: string;
};

type CodingPackagePreview = {
  readonly caseId?: string;
  readonly sourceReference?: string;
  readonly package: {
    readonly family: string;
    readonly version: string;
    readonly effectiveFrom?: string;
    readonly effectiveTo?: string;
    readonly sourcePath: string;
    readonly importedAt: string;
    readonly status: string;
  };
  readonly entries: ReadonlyArray<{
    readonly code?: string;
    readonly text?: string;
    readonly isBillable?: boolean;
    readonly notationFlag?: string;
    readonly ageLower?: number;
    readonly ageUpper?: number;
    readonly ageErrorType?: string;
    readonly genderConstraint?: string;
    readonly genderErrorType?: string;
    readonly rareDiseaseFlag?: boolean;
  }>;
};

const makeFinding = (
  code: string,
  severity: "info" | "warning" | "error",
  message: string,
) => ({
  code,
  severity,
  message,
});

const allowedPackageFamilies = new Set(["SDICD", "SDKH", "SDKRW"]);
const allowedPackageStatuses = new Set(["active", "superseded", "failed"]);
const allowedSeverityModes = new Set(["warning", "error"]);
const allowedGenderConstraints = new Set([
  "male",
  "female",
  "diverse",
  "unknown",
]);

const isIsoLikeDate = (value: string | undefined) =>
  value !== undefined &&
  !Number.isNaN(new Date(value).getTime());

const runCodingPackageOracle = (
  preview: CodingPackagePreview,
): OracleExecutionResult => {
  const findings = [];

  if (preview.caseId) {
    findings.push(
      makeFinding(
        "ICD_OFFICIAL_FIXTURE",
        "info",
        `Validated coding fixture ${preview.caseId}${preview.sourceReference ? ` (${preview.sourceReference})` : ""}.`,
      ),
    );
  }

  if (!allowedPackageFamilies.has(preview.package.family)) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_FAMILY_INVALID",
        "error",
        `Unsupported coding package family ${preview.package.family}.`,
      ),
    );
  }

  if (!preview.package.version || preview.package.version.trim().length === 0) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_VERSION_MISSING",
        "error",
        "Coding package metadata is missing a version string.",
      ),
    );
  }

  if (!preview.package.sourcePath || preview.package.sourcePath.trim().length === 0) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_SOURCE_PATH_MISSING",
        "error",
        "Coding package metadata is missing a sourcePath.",
      ),
    );
  }

  if (!isIsoLikeDate(preview.package.importedAt)) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_IMPORTED_AT_INVALID",
        "error",
        "Coding package metadata contains an invalid importedAt timestamp.",
      ),
    );
  }

  if (
    preview.package.effectiveFrom &&
    !isIsoLikeDate(preview.package.effectiveFrom)
  ) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_EFFECTIVE_FROM_INVALID",
        "error",
        "Coding package metadata contains an invalid effectiveFrom date.",
      ),
    );
  }

  if (
    preview.package.effectiveTo &&
    !isIsoLikeDate(preview.package.effectiveTo)
  ) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_EFFECTIVE_TO_INVALID",
        "error",
        "Coding package metadata contains an invalid effectiveTo date.",
      ),
    );
  }

  if (
    preview.package.effectiveFrom &&
    preview.package.effectiveTo &&
    preview.package.effectiveFrom > preview.package.effectiveTo
  ) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_EFFECTIVE_RANGE_INVALID",
        "error",
        "Coding package effectiveFrom is later than effectiveTo.",
      ),
    );
  }

  if (!allowedPackageStatuses.has(preview.package.status)) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_STATUS_INVALID",
        "error",
        `Unsupported coding package status ${preview.package.status}.`,
      ),
    );
  }

  if (preview.entries.length === 0) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_EMPTY",
        "error",
        "Coding package preview does not contain any catalog entries.",
      ),
    );
  } else {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_ENTRY_COUNT",
        "info",
        `Coding package preview contains ${preview.entries.length} catalog entr${preview.entries.length === 1 ? "y" : "ies"}.`,
      ),
    );
  }

  const seenCodes = new Set<string>();
  for (const [index, entry] of preview.entries.entries()) {
    const label = entry.code?.trim() || `entry#${index + 1}`;

    if (!entry.code || entry.code.trim().length === 0) {
      findings.push(
        makeFinding(
          "ICD_ENTRY_CODE_MISSING",
          "error",
          `Coding package entry ${label} is missing a code.`,
        ),
      );
    } else if (seenCodes.has(entry.code)) {
      findings.push(
        makeFinding(
          "ICD_ENTRY_CODE_DUPLICATE",
          "error",
          `Coding package entry ${entry.code} appears more than once.`,
        ),
      );
    } else {
      seenCodes.add(entry.code);
    }

    if (!entry.text || entry.text.trim().length === 0) {
      findings.push(
        makeFinding(
          "ICD_ENTRY_TEXT_MISSING",
          "error",
          `Coding package entry ${label} is missing display text.`,
        ),
      );
    }

    if (entry.isBillable === undefined) {
      findings.push(
        makeFinding(
          "ICD_ENTRY_BILLABLE_MISSING",
          "error",
          `Coding package entry ${label} is missing its isBillable flag.`,
        ),
      );
    }

    if (
      entry.ageLower !== undefined &&
      entry.ageUpper !== undefined &&
      entry.ageLower > entry.ageUpper
    ) {
      findings.push(
        makeFinding(
          "ICD_ENTRY_AGE_RANGE_INVALID",
          "error",
          `Coding package entry ${label} declares ageLower above ageUpper.`,
        ),
      );
    }

    if (
      entry.ageErrorType !== undefined &&
      !allowedSeverityModes.has(entry.ageErrorType)
    ) {
      findings.push(
        makeFinding(
          "ICD_ENTRY_AGE_ERROR_TYPE_INVALID",
          "error",
          `Coding package entry ${label} uses an unsupported ageErrorType.`,
        ),
      );
    }

    if (
      entry.genderConstraint !== undefined &&
      !allowedGenderConstraints.has(entry.genderConstraint)
    ) {
      findings.push(
        makeFinding(
          "ICD_ENTRY_GENDER_CONSTRAINT_INVALID",
          "error",
          `Coding package entry ${label} uses an unsupported genderConstraint.`,
        ),
      );
    }

    if (
      entry.genderErrorType !== undefined &&
      !allowedSeverityModes.has(entry.genderErrorType)
    ) {
      findings.push(
        makeFinding(
          "ICD_ENTRY_GENDER_ERROR_TYPE_INVALID",
          "error",
          `Coding package entry ${label} uses an unsupported genderErrorType.`,
        ),
      );
    }
  }

  const passed = findings.every((finding) => finding.severity !== "error");

  return {
    family: "ICD",
    passed,
    findings,
    summary: passed
      ? "Coding package satisfied the fixture-backed integrity checks."
      : "Coding package failed the fixture-backed integrity checks.",
  };
};

export const runCodingOracle = ({
  payloadPreview,
}: {
  payloadPreview?: string;
}): OracleExecutionResult => {
  if (!payloadPreview || payloadPreview.trim().length === 0) {
    return {
      family: "ICD",
      passed: false,
      findings: [
        makeFinding(
          "ICD_PAYLOAD_PREVIEW_MISSING",
          "error",
          "No coding payload preview was provided to the oracle runner.",
        ),
      ],
      summary: "Coding preview failed the fixture-backed rule checks.",
    };
  }

  let preview: CodingOraclePreview;
  try {
    preview = JSON.parse(payloadPreview) as CodingOraclePreview;
  } catch (error) {
    return {
      family: "ICD",
      passed: false,
      findings: [
        makeFinding(
          "ICD_FIXTURE_INVALID_JSON",
          "error",
          error instanceof Error
            ? `Coding oracle preview is not valid JSON: ${error.message}`
            : "Coding oracle preview is not valid JSON.",
        ),
      ],
      summary: "Coding preview failed the fixture-backed rule checks.",
    };
  }

  if (
    typeof preview === "object" &&
    preview !== null &&
    "package" in preview &&
    "entries" in preview
  ) {
    return runCodingPackageOracle(preview as unknown as CodingPackagePreview);
  }

  const evaluations = evaluateCodingRules({
    patientId: preview.patientId ?? "preview-patient",
    patient: preview.patient,
    diagnosis: {
      patientId: preview.diagnosis.patientId ?? preview.patientId ?? "preview-patient",
      icdCode: preview.diagnosis.icdCode,
      category: preview.diagnosis.category,
      ...(preview.diagnosis.diagnosensicherheit
        ? { diagnosensicherheit: preview.diagnosis.diagnosensicherheit }
        : {}),
      ...(preview.diagnosis.isPrimary !== undefined
        ? { isPrimary: preview.diagnosis.isPrimary }
        : {}),
    },
    ...(preview.billingCaseId ? { billingCaseId: preview.billingCaseId } : {}),
    ...(preview.caseDiagnoses ? { caseDiagnoses: preview.caseDiagnoses } : {}),
    ...(preview.catalogEntry ? { catalogEntry: preview.catalogEntry } : {}),
    createdAt: preview.createdAt,
  });

  const findings = evaluations.map((evaluation) =>
    makeFinding(evaluation.ruleCode, evaluation.severity, evaluation.message),
  );

  if (preview.caseId) {
    findings.unshift(
      makeFinding(
        "ICD_OFFICIAL_FIXTURE",
        "info",
        `Validated coding fixture ${preview.caseId}${preview.sourceReference ? ` (${preview.sourceReference})` : ""}.`,
      ),
    );
  }

  return {
    family: "ICD",
    passed: findings.every((finding) => finding.severity !== "error"),
    findings,
    summary:
      findings.every((finding) => finding.severity !== "error")
        ? "Coding preview satisfied the fixture-backed rule checks."
        : "Coding preview failed the fixture-backed rule checks.",
  };
};
