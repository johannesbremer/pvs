import { describe, expect, it } from "vitest";

import { buildAndExecuteOraclePlan, executeOraclePlan } from "../tools/oracles/runtime";
import type { OraclePlan } from "../tools/oracles/types";

describe("oracle runtime", () => {
  it("executes local BFB, ICD, ICD package, Heilmittel, and TSS runners", async () => {
    const bfbPlan = {
      family: "BFB",
      pluginKind: "fixture-backed",
      inputKind: "print-artifact",
      fixtureRoot: "test/oracles/bfb",
      workingDirectory: ".",
      expectedOutputs: ["comparison.json"],
      passFailRule: "Rendered output matches fixture expectations and barcode checks.",
    } satisfies OraclePlan;

    const heilmittelPlan = {
      family: "Heilmittel",
      pluginKind: "fixture-backed",
      inputKind: "heilmittel-order",
      fixtureRoot: "test/oracles/heilmittel",
      workingDirectory: ".",
      expectedOutputs: ["comparison.json"],
      passFailRule: "Order evaluation and output match approved regression fixtures.",
    } satisfies OraclePlan;

    const tssPlan = {
      family: "TSS",
      pluginKind: "fixture-backed",
      inputKind: "tss-selection",
      fixtureRoot: "test/oracles/tss",
      workingDirectory: ".",
      expectedOutputs: ["comparison.json"],
      passFailRule: "TSS appointment listing and selection behavior matches fixture expectations.",
    } satisfies OraclePlan;

    const codingPlan = {
      family: "ICD",
      pluginKind: "fixture-backed",
      inputKind: "coding-preview",
      fixtureRoot: "test/oracles/coding",
      workingDirectory: ".",
      expectedOutputs: ["comparison.json"],
      passFailRule: "Coding evaluation matches SDICD/SDKH/SDKRW fixture expectations.",
    } satisfies OraclePlan;

    const [bfbResult, codingResult, codingPackageResult, heilmittelResult, tssResult] = await Promise.all([
      executeOraclePlan({
        plan: bfbPlan,
        payloadPreview: JSON.stringify({
          caseId: "BFB-RUNTIME-PREVIEW",
          templateId: "Muster16",
          templateVersion: "2026.1",
          subjectKind: "prescription-print",
          pageCount: 1,
          fields: [
            {
              fieldCode: "patient-name",
              page: 1,
              x: 12.5,
              y: 18.2,
              width: 72,
              height: 5,
              value: "Erika Mustermann",
              required: true,
            },
          ],
          barcodes: [
            {
              barcodeType: "datamatrix",
              page: 1,
              x: 156,
              y: 232,
              width: 24,
              height: 24,
              payload: "ERP|runtime|token",
            },
          ],
        }),
      }),
      executeOraclePlan({
        plan: codingPlan,
        payloadPreview: JSON.stringify({
          caseId: "SDKH-CHRONIC-CERTAINTY",
          patient: {
            birthDate: "1975-08-17",
            administrativeGender: { code: "female" },
          },
          diagnosis: {
            icdCode: "M54.5",
            category: "dauerdiagnose",
          },
          catalogEntry: {
            code: "M54.5",
            text: "Low back pain",
            isBillable: true,
          },
          createdAt: "2026-03-11T10:04:00.000Z",
        }),
      }),
      executeOraclePlan({
        plan: codingPlan,
        payloadPreview: JSON.stringify({
          caseId: "ICD-PACKAGE-RUNTIME-PREVIEW",
          package: {
            family: "SDICD",
            version: "2026.2",
            sourcePath: "Abrechnung/ICD/SDICD_2026_2.txt",
            importedAt: "2026-03-11T10:05:00.000Z",
            status: "active",
          },
          entries: [
            {
              code: "A00.0",
              text: "Cholera",
              isBillable: true,
            },
          ],
        }),
      }),
      executeOraclePlan({
        plan: heilmittelPlan,
        payloadPreview: JSON.stringify({
          caseId: "PF06-A1",
          heilmittelbereich: "Physiotherapie",
          diagnosegruppe: "WS",
          diagnosisCodes: ["M54.0", "Z98.8"],
          blankoFlag: true,
          items: [],
          catalogEntries: [
            {
              code: "X0501",
              heilmittelbereich: "Physiotherapie",
              diagnosegruppe: "WS",
              kind: "vorrangig",
              blankoEligible: true,
            },
          ],
        }),
      }),
      executeOraclePlan({
        plan: tssPlan,
        payloadPreview: JSON.stringify({
          caseId: "TSS-RUNTIME-PREVIEW",
          criteria: {
            organizationId: "org-1",
            vermittlungscode: "VMC-1000",
            tssServiceType: "orthopaedy",
          },
          appointments: [
            {
              appointmentId: "apt-1",
              organizationId: "org-1",
              source: "tss",
              status: "proposed",
              start: "2026-04-12T09:00:00.000Z",
              vermittlungscode: "VMC-1000",
              tssServiceType: "orthopaedy",
            },
          ],
          expectedSelectableAppointmentIds: ["apt-1"],
        }),
      }),
    ]);

    expect(bfbResult.passed).toBe(true);
    expect(codingResult.passed).toBe(true);
    expect(
      codingResult.findings.some(
        (finding) => finding.code === "SDKH_CHRONIC_CERTAINTY_MISSING",
      ),
    ).toBe(true);
    expect(codingPackageResult.passed).toBe(true);
    expect(
      codingPackageResult.findings.some(
        (finding) => finding.code === "ICD_PACKAGE_ENTRY_COUNT",
      ),
    ).toBe(true);
    expect(heilmittelResult.passed).toBe(true);
    expect(tssResult.passed).toBe(true);
  });

  it("executes local KVDT and BMP runners through the plan builder", async () => {
    const kvdtExecuted = await buildAndExecuteOraclePlan({
      family: "KVDT",
      payloadPreview: "con0|adt0|sad0",
    });
    const bmpExecuted = await buildAndExecuteOraclePlan({
      family: "BMP",
      payloadPreviewXml: "<?xml version=\"1.0\"?><bmp/>",
    });

    expect(kvdtExecuted?.report.passed).toBe(true);
    expect(kvdtExecuted?.plan.family).toBe("KVDT");
    expect(bmpExecuted?.report.passed).toBe(true);
    expect(bmpExecuted?.plan.family).toBe("BMP");
  });
});
