import { Buffer } from "node:buffer";

import type { OracleExecutionResult } from "../types";

import { evaluateCodingRules } from "../../../src/domain/coding-rules";
import { computeBufferSha256 } from "../assets";

interface CodingOraclePreview {
  readonly billingCaseId?: string;
  readonly caseDiagnoses?: readonly {
    readonly billingCaseId?: string;
    readonly isPrimary?: boolean;
    readonly recordStatus: "active" | "cancelled" | "superseded";
  }[];
  readonly caseId?: string;
  readonly catalogEntry?: {
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
  };
  readonly createdAt: string;
  readonly diagnosis: {
    readonly category: "acute" | "anamnestisch" | "dauerdiagnose";
    readonly diagnosensicherheit?: string;
    readonly icdCode: string;
    readonly isPrimary?: boolean;
    readonly patientId?: string;
  };
  readonly patient: {
    readonly administrativeGender?: {
      readonly code: string;
    };
    readonly birthDate?: string;
  };
  readonly patientId?: string;
  readonly sourceReference?: string;
}

interface CodingPackagePreview {
  readonly caseId?: string;
  readonly entries: readonly {
    readonly ageErrorType?: string;
    readonly ageLower?: number;
    readonly ageUpper?: number;
    readonly code?: string;
    readonly genderConstraint?: string;
    readonly genderErrorType?: string;
    readonly isBillable?: boolean;
    readonly notationFlag?: string;
    readonly rareDiseaseFlag?: boolean;
    readonly text?: string;
  }[];
  readonly package: {
    readonly artifact?: {
      readonly bytesBase64?: string;
      readonly byteSize?: number;
      readonly contentType?: string;
      readonly sha256?: string;
      readonly storageId?: string;
      readonly title?: string;
    };
    readonly authenticity?: {
      readonly certificateSha256?: string;
      readonly detachedSignaturePath?: string;
      readonly signatureAlgorithm?: string;
      readonly signatureStatus:
        | "failed"
        | "missing"
        | "unverified"
        | "verified";
      readonly signerOrganization?: string;
      readonly trustAnchor?: string;
      readonly verifiedAt?: string;
    };
    readonly effectiveFrom?: string;
    readonly effectiveTo?: string;
    readonly family: string;
    readonly importedAt: string;
    readonly sourcePath: string;
    readonly status: string;
    readonly version: string;
  };
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

const allowedPackageFamilies = new Set(["SDICD", "SDKH", "SDKRW"]);
const allowedPackageStatuses = new Set(["active", "failed", "superseded"]);
const allowedSeverityModes = new Set(["error", "warning"]);
const allowedArtifactContentTypes = new Set([
  "application/octet-stream",
  "application/zip",
  "text/csv",
  "text/plain",
]);
const allowedSignatureAlgorithms = new Set([
  "cms-detached-sha256",
  "rsa-sha256",
  "sha256withrsa",
]);
const expectedSignerByFamily: Record<string, string> = {
  SDICD: "KBV",
  SDKH: "KBV",
  SDKRW: "KBV",
};
const allowedGenderConstraints = new Set([
  "diverse",
  "female",
  "male",
  "unknown",
]);

const sha256Pattern = /^[a-f0-9]{64}$/i;

const isIsoLikeDate = (value: string | undefined) =>
  value !== undefined && !Number.isNaN(new Date(value).getTime());

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

  if (
    !preview.package.sourcePath ||
    preview.package.sourcePath.trim().length === 0
  ) {
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

  if (!preview.package.sourcePath.includes(preview.package.family)) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_SOURCE_PATH_FAMILY_MISMATCH",
        "error",
        `Coding package sourcePath ${preview.package.sourcePath} does not contain family ${preview.package.family}.`,
      ),
    );
  }

  const normalizedVersionToken = preview.package.version.replace(
    /[^\dA-Z]+/gi,
    "_",
  );
  if (
    normalizedVersionToken.length > 0 &&
    !preview.package.sourcePath.includes(normalizedVersionToken) &&
    !preview.package.sourcePath.includes(preview.package.version)
  ) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_SOURCE_PATH_VERSION_MISMATCH",
        "error",
        `Coding package sourcePath ${preview.package.sourcePath} does not reflect version ${preview.package.version}.`,
      ),
    );
  }

  if (!/\.(txt|zip|csv)$/i.test(preview.package.sourcePath)) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_SOURCE_PATH_EXTENSION_INVALID",
        "error",
        `Coding package sourcePath ${preview.package.sourcePath} does not use a supported package extension.`,
      ),
    );
  }

  if (!preview.package.artifact) {
    findings.push(
      makeFinding(
        "ICD_PACKAGE_ARTIFACT_MISSING",
        "error",
        "Coding package metadata does not include artifact provenance.",
      ),
    );
  } else {
    const artifact = preview.package.artifact;

    if (
      !artifact.contentType ||
      !allowedArtifactContentTypes.has(artifact.contentType)
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_ARTIFACT_CONTENT_TYPE_INVALID",
          "error",
          "Coding package artifact does not declare a supported content type.",
        ),
      );
    }

    if (
      artifact.byteSize === undefined ||
      !Number.isFinite(artifact.byteSize) ||
      artifact.byteSize <= 0
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_ARTIFACT_BYTESIZE_INVALID",
          "error",
          "Coding package artifact byteSize must be a positive number.",
        ),
      );
    }

    if (!artifact.sha256 || !sha256Pattern.test(artifact.sha256)) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_ARTIFACT_SHA256_INVALID",
          "error",
          "Coding package artifact sha256 must be a 64-character hex digest.",
        ),
      );
    }

    if (artifact.bytesBase64 !== undefined) {
      let decodedBytes: Buffer | undefined;

      try {
        decodedBytes = Buffer.from(artifact.bytesBase64, "base64");
      } catch {
        findings.push(
          makeFinding(
            "ICD_PACKAGE_ARTIFACT_BYTES_INVALID",
            "error",
            "Coding package artifact bytesBase64 is not valid base64.",
          ),
        );
      }

      if (
        decodedBytes &&
        Buffer.from(decodedBytes).toString("base64") !== artifact.bytesBase64
      ) {
        findings.push(
          makeFinding(
            "ICD_PACKAGE_ARTIFACT_BYTES_INVALID",
            "error",
            "Coding package artifact bytesBase64 is not canonical base64 content.",
          ),
        );
      }

      if (
        decodedBytes &&
        artifact.byteSize !== undefined &&
        decodedBytes.byteLength !== artifact.byteSize
      ) {
        findings.push(
          makeFinding(
            "ICD_PACKAGE_ARTIFACT_BYTESIZE_MISMATCH",
            "error",
            `Coding package artifact byteSize ${artifact.byteSize} does not match decoded content length ${decodedBytes.byteLength}.`,
          ),
        );
      }

      if (
        decodedBytes &&
        artifact.sha256 &&
        sha256Pattern.test(artifact.sha256)
      ) {
        const actualSha256 = computeBufferSha256(decodedBytes);
        if (actualSha256 !== artifact.sha256.toLowerCase()) {
          findings.push(
            makeFinding(
              "ICD_PACKAGE_ARTIFACT_SHA256_MISMATCH",
              "error",
              `Coding package artifact sha256 ${artifact.sha256} does not match decoded content hash ${actualSha256}.`,
            ),
          );
        } else {
          findings.push(
            makeFinding(
              "ICD_PACKAGE_ARTIFACT_SHA256_VERIFIED",
              "info",
              "Coding package artifact sha256 matches the provided package bytes.",
            ),
          );
        }
      }
    }
  }

  if (!preview.package.authenticity) {
    if (preview.package.status === "active") {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_AUTHENTICITY_MISSING",
          "error",
          "Active coding package metadata does not include authenticity or signature verification metadata.",
        ),
      );
    }
  } else {
    const authenticity = preview.package.authenticity;

    if (
      preview.package.status === "active" &&
      authenticity.signatureStatus !== "verified"
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_SIGNATURE_NOT_VERIFIED",
          "error",
          `Active coding package must be signatureStatus=verified, got ${authenticity.signatureStatus}.`,
        ),
      );
    }

    if (
      authenticity.signatureAlgorithm !== undefined &&
      !allowedSignatureAlgorithms.has(
        authenticity.signatureAlgorithm.toLowerCase(),
      )
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_SIGNATURE_ALGORITHM_INVALID",
          "error",
          "Coding package authenticity metadata does not declare a supported signature algorithm.",
        ),
      );
    }

    if (
      authenticity.signatureStatus === "verified" &&
      !authenticity.signatureAlgorithm
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_SIGNATURE_ALGORITHM_MISSING",
          "error",
          "Verified coding package authenticity metadata is missing signatureAlgorithm.",
        ),
      );
    }

    if (authenticity.detachedSignaturePath) {
      const normalizedVersionToken = preview.package.version.replace(
        /[^\dA-Z]+/gi,
        "_",
      );
      if (!/\.(p7s|sig|asc)$/i.test(authenticity.detachedSignaturePath)) {
        findings.push(
          makeFinding(
            "ICD_PACKAGE_SIGNATURE_PATH_EXTENSION_INVALID",
            "error",
            `Detached signature path ${authenticity.detachedSignaturePath} does not use a supported signature extension.`,
          ),
        );
      }

      if (
        !authenticity.detachedSignaturePath.includes(preview.package.family)
      ) {
        findings.push(
          makeFinding(
            "ICD_PACKAGE_SIGNATURE_PATH_FAMILY_MISMATCH",
            "error",
            `Detached signature path ${authenticity.detachedSignaturePath} does not contain family ${preview.package.family}.`,
          ),
        );
      }

      if (
        normalizedVersionToken.length > 0 &&
        !authenticity.detachedSignaturePath.includes(normalizedVersionToken) &&
        !authenticity.detachedSignaturePath.includes(preview.package.version)
      ) {
        findings.push(
          makeFinding(
            "ICD_PACKAGE_SIGNATURE_PATH_VERSION_MISMATCH",
            "error",
            `Detached signature path ${authenticity.detachedSignaturePath} does not reflect version ${preview.package.version}.`,
          ),
        );
      }
    } else if (authenticity.signatureStatus === "verified") {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_SIGNATURE_PATH_MISSING",
          "error",
          "Verified coding package authenticity metadata is missing detachedSignaturePath.",
        ),
      );
    }

    const expectedSigner = expectedSignerByFamily[preview.package.family];
    if (
      expectedSigner &&
      authenticity.signerOrganization !== undefined &&
      authenticity.signerOrganization !== expectedSigner
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_SIGNER_UNEXPECTED",
          "error",
          `Coding package signer ${authenticity.signerOrganization} does not match expected signer ${expectedSigner}.`,
        ),
      );
    }

    if (
      authenticity.signatureStatus === "verified" &&
      authenticity.trustAnchor !== "KBV_UPDATE"
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_TRUST_ANCHOR_INVALID",
          "error",
          `Verified coding package must use trustAnchor KBV_UPDATE, got ${authenticity.trustAnchor ?? "<missing>"}.`,
        ),
      );
    }

    if (
      authenticity.certificateSha256 !== undefined &&
      !sha256Pattern.test(authenticity.certificateSha256)
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_CERTIFICATE_SHA256_INVALID",
          "error",
          "Coding package certificateSha256 must be a 64-character hex digest.",
        ),
      );
    }

    if (
      authenticity.signatureStatus === "verified" &&
      !authenticity.certificateSha256
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_CERTIFICATE_SHA256_MISSING",
          "error",
          "Verified coding package authenticity metadata is missing certificateSha256.",
        ),
      );
    }

    if (
      authenticity.verifiedAt !== undefined &&
      !isIsoLikeDate(authenticity.verifiedAt)
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_VERIFIED_AT_INVALID",
          "error",
          "Coding package authenticity metadata contains an invalid verifiedAt timestamp.",
        ),
      );
    }

    if (
      authenticity.signatureStatus === "verified" &&
      !authenticity.verifiedAt
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_VERIFIED_AT_MISSING",
          "error",
          "Verified coding package authenticity metadata is missing verifiedAt.",
        ),
      );
    }

    if (
      authenticity.verifiedAt &&
      isIsoLikeDate(authenticity.verifiedAt) &&
      authenticity.verifiedAt < preview.package.importedAt
    ) {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_VERIFIED_AT_BEFORE_IMPORT",
          "error",
          "Coding package authenticity metadata verifies the package before importedAt.",
        ),
      );
    }

    if (authenticity.signatureStatus === "verified") {
      findings.push(
        makeFinding(
          "ICD_PACKAGE_SIGNATURE_VERIFIED",
          "info",
          `Coding package authenticity metadata reports a verified signature via ${authenticity.signatureAlgorithm ?? "<missing>"}.`,
        ),
      );
    }
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
    findings,
    passed,
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
      findings: [
        makeFinding(
          "ICD_PAYLOAD_PREVIEW_MISSING",
          "error",
          "No coding payload preview was provided to the oracle runner.",
        ),
      ],
      passed: false,
      summary: "Coding preview failed the fixture-backed rule checks.",
    };
  }

  let preview: CodingOraclePreview;
  try {
    preview = JSON.parse(payloadPreview) as CodingOraclePreview;
  } catch (error) {
    return {
      family: "ICD",
      findings: [
        makeFinding(
          "ICD_FIXTURE_INVALID_JSON",
          "error",
          error instanceof Error
            ? `Coding oracle preview is not valid JSON: ${error.message}`
            : "Coding oracle preview is not valid JSON.",
        ),
      ],
      passed: false,
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
    diagnosis: {
      category: preview.diagnosis.category,
      icdCode: preview.diagnosis.icdCode,
      patientId:
        preview.diagnosis.patientId ?? preview.patientId ?? "preview-patient",
      ...(preview.diagnosis.diagnosensicherheit
        ? { diagnosensicherheit: preview.diagnosis.diagnosensicherheit }
        : {}),
      ...(preview.diagnosis.isPrimary !== undefined
        ? { isPrimary: preview.diagnosis.isPrimary }
        : {}),
    },
    patient: preview.patient,
    patientId: preview.patientId ?? "preview-patient",
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
    findings,
    passed: findings.every((finding) => finding.severity !== "error"),
    summary: findings.every((finding) => finding.severity !== "error")
      ? "Coding preview satisfied the fixture-backed rule checks."
      : "Coding preview failed the fixture-backed rule checks.",
  };
};
