import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { OraclePlan } from "../tools/oracles/types";

import {
  buildAndExecuteOraclePlanEffect,
  executeOraclePlanEffect,
} from "../tools/oracles/runtime";

describe("oracle runtime", () => {
  it.effect(
    "executes local BFB, ICD, ICD package, Heilmittel, and TSS runners",
    () =>
      Effect.gen(function* () {
        const bfbPlan = {
          expectedOutputs: ["comparison.json"],
          family: "BFB",
          fixtureRoot: "test/oracles/bfb",
          inputKind: "print-artifact",
          passFailRule:
            "Rendered output matches fixture expectations and barcode checks.",
          pluginKind: "fixture-backed",
          workingDirectory: ".",
        } satisfies OraclePlan;

        const heilmittelPlan = {
          expectedOutputs: ["comparison.json"],
          family: "Heilmittel",
          fixtureRoot: "test/oracles/heilmittel",
          inputKind: "heilmittel-order",
          passFailRule:
            "Order evaluation and output match approved regression fixtures.",
          pluginKind: "fixture-backed",
          workingDirectory: ".",
        } satisfies OraclePlan;

        const tssPlan = {
          expectedOutputs: ["comparison.json"],
          family: "TSS",
          fixtureRoot: "test/oracles/tss",
          inputKind: "tss-selection",
          passFailRule:
            "TSS appointment listing and selection behavior matches fixture expectations.",
          pluginKind: "fixture-backed",
          workingDirectory: ".",
        } satisfies OraclePlan;

        const codingPlan = {
          expectedOutputs: ["comparison.json"],
          family: "ICD",
          fixtureRoot: "test/oracles/coding",
          inputKind: "coding-preview",
          passFailRule:
            "Coding evaluation matches SDICD/SDKH/SDKRW fixture expectations.",
          pluginKind: "fixture-backed",
          workingDirectory: ".",
        } satisfies OraclePlan;

        const [
          bfbResult,
          codingResult,
          codingPackageResult,
          heilmittelResult,
          tssResult,
        ] = yield* Effect.all([
          executeOraclePlanEffect({
            payloadPreview: JSON.stringify({
              barcodes: [
                {
                  barcodeType: "datamatrix",
                  height: 24,
                  page: 1,
                  payload: "ERP|runtime|token",
                  width: 24,
                  x: 156,
                  y: 232,
                },
              ],
              caseId: "BFB-RUNTIME-PREVIEW",
              fields: [
                {
                  fieldCode: "patient-name",
                  height: 5,
                  page: 1,
                  required: true,
                  value: "Erika Mustermann",
                  width: 72,
                  x: 12.5,
                  y: 18.2,
                },
              ],
              goldenTemplate: {
                barcodes: [
                  {
                    barcodeType: "datamatrix",
                    height: 24,
                    page: 1,
                    payloadPrefix: "ERP|runtime|",
                    width: 24,
                    x: 156,
                    y: 232,
                  },
                ],
                fields: [
                  {
                    exactValue: "Erika Mustermann",
                    fieldCode: "patient-name",
                    height: 5,
                    page: 1,
                    required: true,
                    width: 72,
                    x: 12.5,
                    y: 18.2,
                  },
                ],
                pageCount: 1,
                snapshotId: "Muster16-runtime-golden",
                subjectKind: "prescription-print",
                templateId: "Muster16",
                templateVersion: "2026.1",
              },
              pageCount: 1,
              subjectKind: "prescription-print",
              templateId: "Muster16",
              templateVersion: "2026.1",
            }),
            plan: bfbPlan,
          }),
          executeOraclePlanEffect({
            payloadPreview: JSON.stringify({
              caseId: "SDKH-CHRONIC-CERTAINTY",
              catalogEntry: {
                code: "M54.5",
                isBillable: true,
                text: "Low back pain",
              },
              createdAt: "2026-03-11T10:04:00.000Z",
              diagnosis: {
                category: "dauerdiagnose",
                icdCode: "M54.5",
              },
              patient: {
                administrativeGender: { code: "female" },
                birthDate: "1975-08-17",
              },
            }),
            plan: codingPlan,
          }),
          executeOraclePlanEffect({
            payloadPreview: JSON.stringify({
              caseId: "ICD-PACKAGE-RUNTIME-PREVIEW",
              entries: [
                {
                  code: "A00.0",
                  isBillable: true,
                  text: "Cholera",
                },
              ],
              package: {
                artifact: {
                  bytesBase64: "Q09ERTtBMDAuMDtDaG9sZXJhCg==",
                  byteSize: 19,
                  contentType: "text/plain",
                  sha256:
                    "9589c5b90e81329f7ffa074ffee01e27767850b03b23327bc6b3fa227d5c1622",
                  storageId: "seed;_storage",
                },
                authenticity: {
                  certificateSha256:
                    "6666666666666666666666666666666666666666666666666666666666666666",
                  detachedSignaturePath: "Abrechnung/ICD/SDICD_2026_2.p7s",
                  signatureAlgorithm: "cms-detached-sha256",
                  signatureStatus: "verified",
                  signerOrganization: "KBV",
                  trustAnchor: "KBV_UPDATE",
                  verifiedAt: "2026-03-11T10:05:01.000Z",
                },
                family: "SDICD",
                importedAt: "2026-03-11T10:05:00.000Z",
                sourcePath: "Abrechnung/ICD/SDICD_2026_2.txt",
                status: "active",
                version: "2026.2",
              },
            }),
            plan: codingPlan,
          }),
          executeOraclePlanEffect({
            payloadPreview: JSON.stringify({
              blankoFlag: true,
              caseId: "PF06-A1",
              catalogEntries: [
                {
                  blankoEligible: true,
                  code: "X0501",
                  diagnosegruppe: "WS",
                  heilmittelbereich: "Physiotherapie",
                  kind: "vorrangig",
                },
              ],
              diagnosegruppe: "WS",
              diagnosisCodes: ["M54.0", "Z98.8"],
              heilmittelbereich: "Physiotherapie",
              items: [],
            }),
            plan: heilmittelPlan,
          }),
          executeOraclePlanEffect({
            payloadPreview: JSON.stringify({
              appointments: [
                {
                  appointmentId: "apt-1",
                  organizationId: "org-1",
                  source: "tss",
                  start: "2026-04-12T09:00:00.000Z",
                  status: "proposed",
                  tssServiceType: "orthopaedy",
                  vermittlungscode: "VMC-1000",
                },
              ],
              caseId: "TSS-RUNTIME-PREVIEW",
              criteria: {
                organizationId: "org-1",
                tssServiceType: "orthopaedy",
                vermittlungscode: "VMC-1000",
              },
              expectedSelectableAppointmentIds: ["apt-1"],
            }),
            plan: tssPlan,
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
      }),
  );

  it.effect(
    "executes local KVDT and BMP runners through the plan builder",
    () =>
      Effect.gen(function* () {
        const kvdtExecuted = yield* buildAndExecuteOraclePlanEffect({
          family: "KVDT",
          payloadPreview: "con0|adt0|sad0",
        });
        const bmpExecuted = yield* buildAndExecuteOraclePlanEffect({
          family: "BMP",
          payloadPreviewXml: '<?xml version="1.0"?><bmp/>',
        });

        expect(kvdtExecuted?.report.passed).toBe(true);
        expect(kvdtExecuted?.plan.family).toBe("KVDT");
        expect(bmpExecuted?.report.passed).toBe(true);
        expect(bmpExecuted?.plan.family).toBe("BMP");
      }),
  );
});
