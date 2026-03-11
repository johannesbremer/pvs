export interface CodingCatalogEntry {
  readonly ageErrorType?: string;
  readonly ageLower?: number;
  readonly ageUpper?: number;
  readonly code: string;
  readonly genderConstraint?: string;
  readonly genderErrorType?: string;
  readonly isBillable: boolean;
  readonly notationFlag?: string;
  readonly rareDiseaseFlag?: boolean;
  readonly text: string;
}
export interface CodingRuleEvaluation {
  readonly billingCaseId?: string;
  readonly blocking: boolean;
  readonly createdAt: string;
  readonly diagnosisId?: string;
  readonly message: string;
  readonly patientId: string;
  readonly ruleCode: string;
  readonly ruleFamily: CodingRuleFamily;
  readonly severity: CodingRuleSeverity;
}

export type CodingRuleFamily = "sdicd" | "sdkh" | "sdkrw";

export interface CodingRuleInput {
  readonly billingCaseId?: string;
  readonly caseDiagnoses?: readonly {
    readonly billingCaseId?: string;
    readonly isPrimary?: boolean;
    readonly recordStatus: "active" | "cancelled" | "superseded";
  }[];
  readonly catalogEntry?: CodingCatalogEntry;
  readonly createdAt: string;
  readonly diagnosis: {
    readonly category: "acute" | "anamnestisch" | "dauerdiagnose";
    readonly diagnosensicherheit?: string;
    readonly icdCode: string;
    readonly isPrimary?: boolean;
    readonly patientId: string;
  };
  readonly patient: {
    readonly administrativeGender?: {
      readonly code: string;
    };
    readonly birthDate?: string;
  };
  readonly patientId: string;
}

export type CodingRuleSeverity = "error" | "info" | "warning";

export const calculateAgeAtDate = (
  birthDate?: string,
  referenceDate?: string,
): number | undefined => {
  if (!birthDate || !referenceDate) {
    return undefined;
  }

  const birth = new Date(birthDate);
  const reference = new Date(referenceDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) {
    return undefined;
  }

  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = reference.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && reference.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
};

export const evaluateCodingRules = ({
  billingCaseId,
  caseDiagnoses = [],
  catalogEntry,
  createdAt,
  diagnosis,
  patient,
  patientId,
}: CodingRuleInput): CodingRuleEvaluation[] => {
  const evaluations: CodingRuleEvaluation[] = [];

  if (!catalogEntry) {
    evaluations.push({
      patientId,
      ...(billingCaseId ? { billingCaseId } : {}),
      blocking: true,
      createdAt,
      message: `ICD code ${diagnosis.icdCode} is not present in the imported SDICD catalog.`,
      ruleCode: "SDICD_CODE_UNKNOWN",
      ruleFamily: "sdicd",
      severity: "error",
    });
  } else {
    if (!catalogEntry.isBillable) {
      evaluations.push({
        patientId,
        ...(billingCaseId ? { billingCaseId } : {}),
        blocking: false,
        createdAt,
        message: `ICD code ${diagnosis.icdCode} is not marked billable in SDICD.`,
        ruleCode: "SDICD_NOT_BILLABLE",
        ruleFamily: "sdicd",
        severity: "warning",
      });
    }

    const ageAtReference = calculateAgeAtDate(patient.birthDate, createdAt);
    if (
      ageAtReference !== undefined &&
      catalogEntry.ageLower !== undefined &&
      ageAtReference < catalogEntry.ageLower
    ) {
      evaluations.push({
        patientId,
        ...(billingCaseId ? { billingCaseId } : {}),
        blocking: catalogEntry.ageErrorType !== "warning",
        createdAt,
        message: `Patient age ${ageAtReference} is below the ICD lower bound ${catalogEntry.ageLower}.`,
        ruleCode: "SDICD_AGE_TOO_LOW",
        ruleFamily: "sdicd",
        severity: catalogEntry.ageErrorType === "warning" ? "warning" : "error",
      });
    }

    if (
      ageAtReference !== undefined &&
      catalogEntry.ageUpper !== undefined &&
      ageAtReference > catalogEntry.ageUpper
    ) {
      evaluations.push({
        patientId,
        ...(billingCaseId ? { billingCaseId } : {}),
        blocking: catalogEntry.ageErrorType !== "warning",
        createdAt,
        message: `Patient age ${ageAtReference} exceeds the ICD upper bound ${catalogEntry.ageUpper}.`,
        ruleCode: "SDICD_AGE_TOO_HIGH",
        ruleFamily: "sdicd",
        severity: catalogEntry.ageErrorType === "warning" ? "warning" : "error",
      });
    }

    const patientGender = patient.administrativeGender?.code;
    if (
      patientGender &&
      catalogEntry.genderConstraint &&
      catalogEntry.genderConstraint !== patientGender
    ) {
      evaluations.push({
        patientId,
        ...(billingCaseId ? { billingCaseId } : {}),
        blocking: catalogEntry.genderErrorType !== "warning",
        createdAt,
        message: `Patient gender ${patientGender} conflicts with ICD constraint ${catalogEntry.genderConstraint}.`,
        ruleCode: "SDICD_GENDER_MISMATCH",
        ruleFamily: "sdicd",
        severity:
          catalogEntry.genderErrorType === "warning" ? "warning" : "error",
      });
    }
  }

  if (
    diagnosis.category === "dauerdiagnose" &&
    diagnosis.diagnosensicherheit === undefined
  ) {
    evaluations.push({
      patientId,
      ...(billingCaseId ? { billingCaseId } : {}),
      blocking: false,
      createdAt,
      message:
        "Chronic diagnosis was recorded without diagnosensicherheit metadata.",
      ruleCode: "SDKH_CHRONIC_CERTAINTY_MISSING",
      ruleFamily: "sdkh",
      severity: "warning",
    });
  }

  if (billingCaseId) {
    const activeCaseDiagnoses = [
      ...caseDiagnoses,
      {
        billingCaseId,
        isPrimary: diagnosis.isPrimary,
        recordStatus: "active" as const,
      },
    ].filter((row) => row.recordStatus === "active");

    if (!activeCaseDiagnoses.some((row) => row.isPrimary === true)) {
      evaluations.push({
        billingCaseId,
        blocking: false,
        createdAt,
        message:
          "No active primary diagnosis is currently attached to this billing case.",
        patientId,
        ruleCode: "SDKRW_PRIMARY_DIAGNOSIS_MISSING",
        ruleFamily: "sdkrw",
        severity: "warning",
      });
    }
  }

  return evaluations;
};
