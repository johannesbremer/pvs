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

const coerceExecOutput = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return "";
};

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
        timeout: 300_000,
        maxBuffer: 64 * 1024 * 1024,
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
        "stdout" in error
          ? coerceExecOutput(error.stdout)
          : "",
      stderr:
        typeof error === "object" &&
        error !== null &&
        "stderr" in error
          ? coerceExecOutput(error.stderr)
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

const logArchiveProgress = (message: string) => {
  process.stderr.write(`[erp-archive] ${message}\n`);
};

describe("official KBV fixture sweeps", () => {
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

  it(
    "validates all official eRezept XML examples in the archive with the executable oracle",
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

      const entries = await readdir(erpExamplesDir);
      const xmlExamples = entries
        .filter((entry) => entry.endsWith(".xml"))
        .sort();

      expect(xmlExamples.length).toBeGreaterThan(50);

      for (const [index, exampleName] of xmlExamples.entries()) {
        logArchiveProgress(`start ${index + 1}/${xmlExamples.length} ${exampleName}`);
        const xmlPath = join(erpExamplesDir, exampleName);
        const result = await runStandaloneFhirValidation({
          family: "eRezept",
          xmlPath,
        });
        const validatorErrors = parseValidatorErrorLines(result.stdout);

        expect(
          validatorErrors,
          `eRezept example ${exampleName} should validate without error findings.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
        ).toHaveLength(0);
        expect(
          result.stdout.includes("Success: 0 errors"),
          `eRezept example ${exampleName} should complete with Success: 0 errors.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
        ).toBe(true);
        logArchiveProgress(`done ${index + 1}/${xmlExamples.length} ${exampleName}`);
      }
    },
    900_000,
  );
});
