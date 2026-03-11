import { describe, expect, it } from "vitest";

import { buildAndExecuteOraclePlan, executeOraclePlan } from "../tools/oracles/runtime";
import type { OraclePlan } from "../tools/oracles/types";

describe("oracle runtime", () => {
  it("executes local BFB and Heilmittel runners", async () => {
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

    const [bfbResult, heilmittelResult] = await Promise.all([
      executeOraclePlan({
        plan: bfbPlan,
        payloadPreview: "{\"form\":\"M16\"}",
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
    ]);

    expect(bfbResult.passed).toBe(true);
    expect(heilmittelResult.passed).toBe(true);
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
