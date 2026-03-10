import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  ensureExtractedAsset,
  kbvOracleAssets,
} from "../tools/oracles/assets";
import { runExecutableFhirOracle } from "../tools/oracles/fhir/run";

const cacheDir = join(process.cwd(), ".cache", "kbv-oracles");
const execFileAsync = promisify(execFile);
const renderedDosageInstructionExamples = new Set([
  "Beispiel_3.xml",
  "Beispiel_4.xml",
  "Beispiel_5.xml",
  "Beispiel_16.xml",
  "Beispiel_23.xml",
]);

const runStandaloneFhirValidation = async ({
  family,
  xmlPath,
}: {
  family: "eAU" | "eRezept";
  xmlPath: string;
}) => {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["tools/oracles/debug-fhir.mjs", family, xmlPath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          VITEST: "",
          VITEST_POOL_ID: "",
          VITEST_WORKER_ID: "",
        },
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );

    return {
      passed: true,
      exitCode: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      passed: false,
      exitCode:
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "number"
          ? error.code
          : 1,
      stdout:
        typeof error === "object" &&
        error !== null &&
        "stdout" in error &&
        typeof error.stdout === "string"
          ? error.stdout
          : "",
      stderr:
        typeof error === "object" &&
        error !== null &&
        "stderr" in error &&
        typeof error.stderr === "string"
          ? error.stderr
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }
};

const parseValidatorErrorLines = (stdout: string) =>
  stdout
    .split("\n")
    .map((line) => line.replace(/\x1B\[[0-9;]*m/g, "").trim())
    .filter((line) => line.startsWith("Error @"));

const isKnownRenderedDosageInstructionLimitation = (line: string) =>
  line.includes("Unable to find a profile match for MedicationRequest/") ||
  line.includes("The System URI could not be determined for the code 'de-DE'") ||
  line.includes("The value provided ('de-DE') was not found in the value set 'All Languages'");

describe("official KBV fixture sweeps", () => {
  const curatedErpExamples = [
    "Beispiel_1.xml",
    "Beispiel_3.xml",
    "Beispiel_4.xml",
    "Beispiel_5.xml",
    "Beispiel_10_1.xml",
    "Beispiel_16.xml",
    "Beispiel_22.xml",
    "Beispiel_23.xml",
    "Beispiel_60.xml",
  ] as const;

  it(
    "validates all official non-error eAU XML examples with the executable oracle",
    async () => {
      const eauExamplesDir = await ensureExtractedAsset(
        kbvOracleAssets.kbvEauExamples_1_2,
        cacheDir,
      );
      const entries = await readdir(eauExamplesDir);
      const xmlExamples = entries
        .filter((entry) => entry.endsWith(".xml"))
        .filter((entry) => !entry.includes("_Fehler_"))
        .sort();

      expect(xmlExamples.length).toBeGreaterThan(5);

      for (const exampleName of xmlExamples) {
        const xml = await readFile(join(eauExamplesDir, exampleName), "utf8");
        const result = await runExecutableFhirOracle({
          family: "eAU",
          xml,
          cacheDir,
        });

        expect(
          result.findings.filter((finding) => finding.severity === "error"),
          `eAU example ${exampleName} should validate without errors`,
        ).toHaveLength(0);
        expect(result.passed, `eAU example ${exampleName} should pass`).toBe(true);
      }
    },
    420_000,
  );

  for (const exampleName of curatedErpExamples) {
    it(
      `validates official eRezept example ${exampleName} with the executable oracle`,
      async () => {
        const erpExamplesDir = await ensureExtractedAsset(
          kbvOracleAssets.kbvErpExamples_1_4,
          cacheDir,
        );
        await ensureExtractedAsset(
          kbvOracleAssets.fhirValidatorService_2_2_0,
          cacheDir,
        );
        await ensureExtractedAsset(
          kbvOracleAssets.kbvFhirErp_1_4_1,
          cacheDir,
        );
        const xmlPath = join(erpExamplesDir, exampleName);
        const result = await runStandaloneFhirValidation({
          family: "eRezept",
          xmlPath,
        });
        const validatorErrors = parseValidatorErrorLines(result.stdout);

        if (!renderedDosageInstructionExamples.has(exampleName)) {
          expect(
            result.stdout.includes("Success: 0 errors"),
            `eRezept example ${exampleName} should validate without errors.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
          ).toBe(true);
          expect(validatorErrors).toHaveLength(0);
          return;
        }

        expect(
          validatorErrors.length,
          `eRezept example ${exampleName} should fail only with the known renderedDosageInstruction limitation.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
        ).toBeGreaterThan(0);
        expect(
          validatorErrors.every(isKnownRenderedDosageInstructionLimitation),
          `eRezept example ${exampleName} reported unexpected validator errors.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
        ).toBe(true);
      },
      180_000,
    );
  }
});
