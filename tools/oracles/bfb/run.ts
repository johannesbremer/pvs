import type { OracleExecutionResult } from "../types";

type BfbFieldPreview = {
  readonly fieldCode?: string;
  readonly page?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly value?: string;
  readonly required?: boolean;
};

type BfbBarcodePreview = {
  readonly barcodeType?: string;
  readonly page?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly payload?: string;
};

type BfbRenderContextPreview = {
  readonly caseId?: string;
  readonly sourceReference?: string;
  readonly templateId?: string;
  readonly templateVersion?: string;
  readonly subjectKind?: string;
  readonly pageCount?: number;
  readonly fields?: ReadonlyArray<BfbFieldPreview>;
  readonly barcodes?: ReadonlyArray<BfbBarcodePreview>;
  readonly goldenTemplate?: BfbGoldenTemplatePreview;
};

type BfbGoldenFieldPreview = {
  readonly fieldCode: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly required?: boolean;
  readonly exactValue?: string;
};

type BfbGoldenBarcodePreview = {
  readonly barcodeType: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly payloadPrefix?: string;
  readonly exactPayload?: string;
};

type BfbGoldenTemplatePreview = {
  readonly snapshotId?: string;
  readonly templateId: string;
  readonly templateVersion?: string;
  readonly subjectKind?: string;
  readonly pageCount: number;
  readonly fields: ReadonlyArray<BfbGoldenFieldPreview>;
  readonly barcodes: ReadonlyArray<BfbGoldenBarcodePreview>;
};

const allowedBarcodeTypes = new Set([
  "code128",
  "datamatrix",
  "ean13",
  "qr",
]);

const makeFinding = (
  code: string,
  severity: "info" | "warning" | "error",
  message: string,
) => ({
  code,
  severity,
  message,
});

const hasPositiveNumber = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value > 0;

const hasCoordinate = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value >= 0;

const numbersEqual = (
  left: number | undefined,
  right: number | undefined,
) => left !== undefined && right !== undefined && left === right;

export const runBfbOracle = ({
  payloadPreview,
}: {
  payloadPreview?: string;
}): OracleExecutionResult => {
  if (!payloadPreview || payloadPreview.trim().length === 0) {
    return {
      family: "BFB",
      passed: false,
      findings: [
        makeFinding(
          "BFB_RENDER_CONTEXT_MISSING",
          "error",
          "No BFB render context preview was provided to the oracle runner.",
        ),
      ],
      summary: "BFB preview failed the local fixture-backed checks.",
    };
  }

  let preview: BfbRenderContextPreview;
  try {
    preview = JSON.parse(payloadPreview) as BfbRenderContextPreview;
  } catch (error) {
    return {
      family: "BFB",
      passed: false,
      findings: [
        makeFinding(
          "BFB_RENDER_CONTEXT_INVALID_JSON",
          "error",
          error instanceof Error
            ? `BFB render context preview is not valid JSON: ${error.message}`
            : "BFB render context preview is not valid JSON.",
        ),
      ],
      summary: "BFB preview failed the local fixture-backed checks.",
    };
  }

  const findings = [];

  if (preview.caseId) {
    findings.push(
      makeFinding(
        "BFB_OFFICIAL_FIXTURE",
        "info",
        `Validated BFB fixture ${preview.caseId}${preview.sourceReference ? ` (${preview.sourceReference})` : ""}.`,
      ),
    );
  }

  if (!preview.templateId || preview.templateId.trim().length === 0) {
    findings.push(
      makeFinding(
        "BFB_TEMPLATE_MISSING",
        "error",
        "BFB render context does not declare a template identifier.",
      ),
    );
  } else {
    findings.push(
      makeFinding(
        "BFB_TEMPLATE_DECLARED",
        "info",
        `BFB render context targets template ${preview.templateId}${preview.templateVersion ? ` (${preview.templateVersion})` : ""}.`,
      ),
    );
  }

  if (
    preview.pageCount === undefined ||
    !Number.isInteger(preview.pageCount) ||
    preview.pageCount < 1
  ) {
    findings.push(
      makeFinding(
        "BFB_PAGE_COUNT_INVALID",
        "error",
        "BFB render context must declare a positive integer pageCount.",
      ),
    );
  }

  if (!preview.fields || preview.fields.length === 0) {
    findings.push(
      makeFinding(
        "BFB_FIELDS_EMPTY",
        "error",
        "BFB render context does not contain any positioned fields.",
      ),
    );
  } else {
    findings.push(
      makeFinding(
        "BFB_FIELD_COUNT",
        "info",
        `BFB render context contains ${preview.fields.length} positioned field(s).`,
      ),
    );
  }

  for (const [index, field] of (preview.fields ?? []).entries()) {
    const label = field.fieldCode?.trim() || `field#${index + 1}`;

    if (!field.fieldCode || field.fieldCode.trim().length === 0) {
      findings.push(
        makeFinding(
          "BFB_FIELD_CODE_MISSING",
          "error",
          `BFB positioned field #${index + 1} is missing fieldCode.`,
        ),
      );
    }

    if (
      field.page === undefined ||
      !Number.isInteger(field.page) ||
      field.page < 1 ||
      (preview.pageCount !== undefined && field.page > preview.pageCount)
    ) {
      findings.push(
        makeFinding(
          "BFB_FIELD_PAGE_INVALID",
          "error",
          `BFB field ${label} points to an invalid page.`,
        ),
      );
    }

    if (!hasCoordinate(field.x) || !hasCoordinate(field.y)) {
      findings.push(
        makeFinding(
          "BFB_FIELD_POSITION_INVALID",
          "error",
          `BFB field ${label} is missing a valid non-negative print position.`,
        ),
      );
    }

    if (
      (field.width !== undefined && !hasPositiveNumber(field.width)) ||
      (field.height !== undefined && !hasPositiveNumber(field.height))
    ) {
      findings.push(
        makeFinding(
          "BFB_FIELD_SIZE_INVALID",
          "error",
          `BFB field ${label} declares a non-positive width or height.`,
        ),
      );
    }

    if (
      field.required === true &&
      (!field.value || field.value.trim().length === 0)
    ) {
      findings.push(
        makeFinding(
          "BFB_REQUIRED_FIELD_EMPTY",
          "error",
          `BFB required field ${label} has no render value.`,
        ),
      );
    }
  }

  if (!preview.barcodes || preview.barcodes.length === 0) {
    findings.push(
      makeFinding(
        "BFB_BARCODE_MISSING",
        "warning",
        "BFB render context does not include any barcode payloads.",
      ),
    );
  } else {
    findings.push(
      makeFinding(
        "BFB_BARCODE_COUNT",
        "info",
        `BFB render context contains ${preview.barcodes.length} barcode payload(s).`,
      ),
    );
  }

  for (const [index, barcode] of (preview.barcodes ?? []).entries()) {
    const label = barcode.barcodeType?.trim() || `barcode#${index + 1}`;

    if (
      !barcode.barcodeType ||
      !allowedBarcodeTypes.has(barcode.barcodeType.toLowerCase())
    ) {
      findings.push(
        makeFinding(
          "BFB_BARCODE_TYPE_INVALID",
          "error",
          `BFB barcode ${label} uses an unsupported barcode type.`,
        ),
      );
    }

    if (
      barcode.page === undefined ||
      !Number.isInteger(barcode.page) ||
      barcode.page < 1 ||
      (preview.pageCount !== undefined && barcode.page > preview.pageCount)
    ) {
      findings.push(
        makeFinding(
          "BFB_BARCODE_PAGE_INVALID",
          "error",
          `BFB barcode ${label} points to an invalid page.`,
        ),
      );
    }

    if (
      !hasCoordinate(barcode.x) ||
      !hasCoordinate(barcode.y) ||
      !hasPositiveNumber(barcode.width) ||
      !hasPositiveNumber(barcode.height)
    ) {
      findings.push(
        makeFinding(
          "BFB_BARCODE_POSITION_INVALID",
          "error",
          `BFB barcode ${label} does not declare a valid printable bounding box.`,
        ),
      );
    }

    if (!barcode.payload || barcode.payload.trim().length === 0) {
      findings.push(
        makeFinding(
          "BFB_BARCODE_PAYLOAD_MISSING",
          "error",
          `BFB barcode ${label} is missing its encoded payload.`,
        ),
      );
    }
  }

  if (preview.goldenTemplate) {
    const golden = preview.goldenTemplate;

    findings.push(
      makeFinding(
        "BFB_GOLDEN_TEMPLATE_DECLARED",
        "info",
        `BFB fixture declares golden template snapshot ${golden.snapshotId ?? golden.templateId}.`,
      ),
    );

    if (preview.templateId !== golden.templateId) {
      findings.push(
        makeFinding(
          "BFB_GOLDEN_TEMPLATE_ID_MISMATCH",
          "error",
          `BFB render context templateId ${preview.templateId ?? "<missing>"} does not match golden template ${golden.templateId}.`,
        ),
      );
    }

    if (
      golden.templateVersion !== undefined &&
      preview.templateVersion !== golden.templateVersion
    ) {
      findings.push(
        makeFinding(
          "BFB_GOLDEN_TEMPLATE_VERSION_MISMATCH",
          "error",
          `BFB render context templateVersion ${preview.templateVersion ?? "<missing>"} does not match golden version ${golden.templateVersion}.`,
        ),
      );
    }

    if (
      golden.subjectKind !== undefined &&
      preview.subjectKind !== golden.subjectKind
    ) {
      findings.push(
        makeFinding(
          "BFB_GOLDEN_SUBJECT_KIND_MISMATCH",
          "error",
          `BFB render context subjectKind ${preview.subjectKind ?? "<missing>"} does not match golden subject kind ${golden.subjectKind}.`,
        ),
      );
    }

    if (preview.pageCount !== golden.pageCount) {
      findings.push(
        makeFinding(
          "BFB_GOLDEN_PAGE_COUNT_MISMATCH",
          "error",
          `BFB render context pageCount ${preview.pageCount ?? "<missing>"} does not match golden pageCount ${golden.pageCount}.`,
        ),
      );
    }

    if ((preview.fields?.length ?? 0) !== golden.fields.length) {
      findings.push(
        makeFinding(
          "BFB_GOLDEN_FIELD_COUNT_MISMATCH",
          "error",
          `BFB render context contains ${preview.fields?.length ?? 0} fields, expected ${golden.fields.length}.`,
        ),
      );
    }

    if ((preview.barcodes?.length ?? 0) !== golden.barcodes.length) {
      findings.push(
        makeFinding(
          "BFB_GOLDEN_BARCODE_COUNT_MISMATCH",
          "error",
          `BFB render context contains ${preview.barcodes?.length ?? 0} barcodes, expected ${golden.barcodes.length}.`,
        ),
      );
    }

    for (const goldenField of golden.fields) {
      const actualField = (preview.fields ?? []).find(
        (field) => field.fieldCode === goldenField.fieldCode,
      );

      if (!actualField) {
        findings.push(
          makeFinding(
            "BFB_GOLDEN_FIELD_MISSING",
            "error",
            `BFB render context is missing golden field ${goldenField.fieldCode}.`,
          ),
        );
        continue;
      }

      if (
        actualField.page !== goldenField.page ||
        !numbersEqual(actualField.x, goldenField.x) ||
        !numbersEqual(actualField.y, goldenField.y) ||
        (goldenField.width !== undefined &&
          !numbersEqual(actualField.width, goldenField.width)) ||
        (goldenField.height !== undefined &&
          !numbersEqual(actualField.height, goldenField.height))
      ) {
        findings.push(
          makeFinding(
            "BFB_GOLDEN_FIELD_LAYOUT_MISMATCH",
            "error",
            `BFB field ${goldenField.fieldCode} does not match the golden page or print box.`,
          ),
        );
      }

      if (
        goldenField.required !== undefined &&
        actualField.required !== goldenField.required
      ) {
        findings.push(
          makeFinding(
            "BFB_GOLDEN_FIELD_REQUIRED_MISMATCH",
            "error",
            `BFB field ${goldenField.fieldCode} does not match the golden required flag.`,
          ),
        );
      }

      if (
        goldenField.exactValue !== undefined &&
        actualField.value !== goldenField.exactValue
      ) {
        findings.push(
          makeFinding(
            "BFB_GOLDEN_FIELD_VALUE_MISMATCH",
            "error",
            `BFB field ${goldenField.fieldCode} does not match the golden value snapshot.`,
          ),
        );
      }
    }

    const expectedFieldCodes = new Set(golden.fields.map((field) => field.fieldCode));
    for (const actualField of preview.fields ?? []) {
      if (
        actualField.fieldCode &&
        !expectedFieldCodes.has(actualField.fieldCode)
      ) {
        findings.push(
          makeFinding(
            "BFB_GOLDEN_UNEXPECTED_FIELD",
            "error",
            `BFB render context contains unexpected field ${actualField.fieldCode}.`,
          ),
        );
      }
    }

    for (const goldenBarcode of golden.barcodes) {
      const actualBarcode = (preview.barcodes ?? []).find(
        (barcode) =>
          barcode.barcodeType === goldenBarcode.barcodeType &&
          barcode.page === goldenBarcode.page,
      );

      if (!actualBarcode) {
        findings.push(
          makeFinding(
            "BFB_GOLDEN_BARCODE_MISSING",
            "error",
            `BFB render context is missing golden barcode ${goldenBarcode.barcodeType} on page ${goldenBarcode.page}.`,
          ),
        );
        continue;
      }

      if (
        !numbersEqual(actualBarcode.x, goldenBarcode.x) ||
        !numbersEqual(actualBarcode.y, goldenBarcode.y) ||
        !numbersEqual(actualBarcode.width, goldenBarcode.width) ||
        !numbersEqual(actualBarcode.height, goldenBarcode.height)
      ) {
        findings.push(
          makeFinding(
            "BFB_GOLDEN_BARCODE_LAYOUT_MISMATCH",
            "error",
            `BFB barcode ${goldenBarcode.barcodeType} does not match the golden print box.`,
          ),
        );
      }

      if (
        goldenBarcode.payloadPrefix !== undefined &&
        !actualBarcode.payload?.startsWith(goldenBarcode.payloadPrefix)
      ) {
        findings.push(
          makeFinding(
            "BFB_GOLDEN_BARCODE_PAYLOAD_PREFIX_MISMATCH",
            "error",
            `BFB barcode ${goldenBarcode.barcodeType} does not match the golden payload prefix.`,
          ),
        );
      }

      if (
        goldenBarcode.exactPayload !== undefined &&
        actualBarcode.payload !== goldenBarcode.exactPayload
      ) {
        findings.push(
          makeFinding(
            "BFB_GOLDEN_BARCODE_PAYLOAD_MISMATCH",
            "error",
            `BFB barcode ${goldenBarcode.barcodeType} does not match the golden payload snapshot.`,
          ),
        );
      }
    }
  }

  const passed = findings.every((finding) => finding.severity !== "error");

  return {
    family: "BFB",
    passed,
    findings,
    summary: passed
      ? "BFB preview satisfied the local fixture-backed checks."
      : "BFB preview failed the local fixture-backed checks.",
  };
};
