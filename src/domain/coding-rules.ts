export type CodingRuleFamily = "sdicd" | "sdkh" | "sdkrw";
export type CodingRuleSeverity = "info" | "warning" | "error";

export type CodingCatalogEntry = {
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

export type CodingRuleInput = {
  readonly patientId: string;
  readonly patient: {
    readonly birthDate?: string;
    readonly administrativeGender?: {
      readonly code: string;
    };
  };
  readonly diagnosis: {
    readonly patientId: string;
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
  readonly catalogEntry?: CodingCatalogEntry;
  readonly createdAt: string;
};

export type CodingRuleEvaluation = {
  readonly patientId: string;
  readonly diagnosisId?: string;
  readonly billingCaseId?: string;
  readonly ruleFamily: CodingRuleFamily;
  readonly severity: CodingRuleSeverity;
  readonly ruleCode: string;
  readonly message: string;
  readonly blocking: boolean;
  readonly createdAt: string;
};

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
  patientId,
  patient,
  diagnosis,
  billingCaseId,
  caseDiagnoses = [],
  catalogEntry,
  createdAt,
}: CodingRuleInput): Array<CodingRuleEvaluation> => {
  const evaluations: Array<CodingRuleEvaluation> = [];

  if (!catalogEntry) {
    evaluations.push({
      patientId,
      ...(billingCaseId ? { billingCaseId } : {}),
      ruleFamily: "sdicd",
      severity: "error",
      ruleCode: "SDICD_CODE_UNKNOWN",
      message: `ICD code ${diagnosis.icdCode} is not present in the imported SDICD catalog.`,
      blocking: true,
      createdAt,
    });
  } else {
    if (!catalogEntry.isBillable) {
      evaluations.push({
        patientId,
        ...(billingCaseId ? { billingCaseId } : {}),
        ruleFamily: "sdicd",
        severity: "warning",
        ruleCode: "SDICD_NOT_BILLABLE",
        message: `ICD code ${diagnosis.icdCode} is not marked billable in SDICD.`,
        blocking: false,
        createdAt,
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
        ruleFamily: "sdicd",
        severity: catalogEntry.ageErrorType === "warning" ? "warning" : "error",
        ruleCode: "SDICD_AGE_TOO_LOW",
        message: `Patient age ${ageAtReference} is below the ICD lower bound ${catalogEntry.ageLower}.`,
        blocking: catalogEntry.ageErrorType !== "warning",
        createdAt,
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
        ruleFamily: "sdicd",
        severity: catalogEntry.ageErrorType === "warning" ? "warning" : "error",
        ruleCode: "SDICD_AGE_TOO_HIGH",
        message: `Patient age ${ageAtReference} exceeds the ICD upper bound ${catalogEntry.ageUpper}.`,
        blocking: catalogEntry.ageErrorType !== "warning",
        createdAt,
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
        ruleFamily: "sdicd",
        severity:
          catalogEntry.genderErrorType === "warning" ? "warning" : "error",
        ruleCode: "SDICD_GENDER_MISMATCH",
        message: `Patient gender ${patientGender} conflicts with ICD constraint ${catalogEntry.genderConstraint}.`,
        blocking: catalogEntry.genderErrorType !== "warning",
        createdAt,
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
      ruleFamily: "sdkh",
      severity: "warning",
      ruleCode: "SDKH_CHRONIC_CERTAINTY_MISSING",
      message:
        "Chronic diagnosis was recorded without diagnosensicherheit metadata.",
      blocking: false,
      createdAt,
    });
  }

  if (billingCaseId) {
    const activeCaseDiagnoses = [
      ...caseDiagnoses,
      {
        billingCaseId,
        recordStatus: "active" as const,
        isPrimary: diagnosis.isPrimary,
      },
    ].filter((row) => row.recordStatus === "active");

    if (!activeCaseDiagnoses.some((row) => row.isPrimary === true)) {
      evaluations.push({
        patientId,
        billingCaseId,
        ruleFamily: "sdkrw",
        severity: "warning",
        ruleCode: "SDKRW_PRIMARY_DIAGNOSIS_MISSING",
        message:
          "No active primary diagnosis is currently attached to this billing case.",
        blocking: false,
        createdAt,
      });
    }
  }

  return evaluations;
};
