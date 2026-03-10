import type { OracleExecutionResult } from "../types";
import { ensureBmpAssets } from "../assets";
import { resolveXmllintCommand } from "../system";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const parseBmpFindings = (output: string) => {
  const findings: Array<OracleExecutionResult["findings"][number]> = [];
  const trimmedOutput = output.trim();

  if (trimmedOutput.length === 0) {
    return findings;
  }

  if (/validates/i.test(trimmedOutput)) {
    findings.push({
      code: "BMP_XSD_VALID",
      severity: "info",
      message: trimmedOutput.slice(0, 500),
    });
  }

  if (/error|fails to validate|Schemas parser error/i.test(trimmedOutput)) {
    findings.push({
      code: "BMP_XSD_ERROR",
      severity: "error",
      message: trimmedOutput.slice(0, 500),
    });
  }

  return findings;
};

export const runBmpOracle = ({
  xml,
}: {
  xml?: string;
}): OracleExecutionResult => {
  const findings = [];

  if (!xml || !xml.includes("<?xml")) {
    findings.push({
      code: "BMP_XML_MISSING",
      severity: "error" as const,
      message: "BMP XML input is missing or malformed.",
    });
  }

  return {
    family: "BMP",
    passed: findings.length === 0,
    findings,
    summary:
      findings.length === 0
        ? "BMP XML satisfied the local oracle checks."
        : "BMP XML failed the local oracle checks.",
  };
};

export const runExecutableBmpOracle = async ({
  xml,
  cacheDir,
}: {
  xml?: string;
  cacheDir?: string;
}): Promise<OracleExecutionResult> => {
  const localResult = runBmpOracle({ xml });
  if (!localResult.passed) {
    return localResult;
  }
  const validatedXml = xml as string;

  try {
    const assets = await ensureBmpAssets({
      ...(cacheDir ? { cacheDir } : {}),
    });
    const tempDir = await mkdtemp(join(tmpdir(), "kbv-bmp-oracle-"));
    const xmlPath = join(tempDir, "payload.xml");
    try {
      await writeFile(xmlPath, validatedXml, "utf8");
      await execFileAsync(resolveXmllintCommand(), [
        "--noout",
        "--schema",
        assets.bmpXsd,
        xmlPath,
      ], {
        maxBuffer: 5 * 1024 * 1024,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    return {
      family: "BMP",
      passed: true,
      findings: [],
      summary: `BMP XML validated successfully against ${assets.bmpXsd}.`,
    };
  } catch (error) {
    const errorOutput =
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      "stderr" in error
        ? `${String(error.stdout)}\n${String(error.stderr)}`
        : error instanceof Error
          ? error.message
          : String(error);
    const findings = parseBmpFindings(errorOutput);
    return {
      family: "BMP",
      passed: false,
      findings:
        findings.length > 0
          ? findings
          : [
              {
                code: "BMP_EXECUTION_FAILED",
                severity: "error",
                message: errorOutput.slice(0, 500),
              },
            ],
      summary: "BMP executable validation failed.",
    };
  }
};
