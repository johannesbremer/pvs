import type { OracleExecutionResult } from "../types";
import {
  ensureFhirValidatorAssets,
  ensureFhirValidatorDependencyCache,
} from "../assets";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveJavaCommand } from "../system";

const execFileAsync = promisify(execFile);

const missingTagFinding = (tagName: string) => ({
  code: `FHIR_TAG_${tagName.toUpperCase()}_MISSING`,
  severity: "error" as const,
  message: `Expected <${tagName}> in rendered FHIR XML.`,
});

const parseFhirValidatorFindings = (output: string) => {
  const findings: Array<OracleExecutionResult["findings"][number]> = [];
  const trimmedOutput = output.trim();

  const missingPackageMatches = trimmedOutput.matchAll(
    /Unable to resolve package id ([^\s]+)/g,
  );
  for (const match of missingPackageMatches) {
    findings.push({
      code: "FHIR_VALIDATOR_MISSING_PACKAGE",
      severity: "error",
      message: `Validator could not resolve package ${match[1]}.`,
    });
  }

  if (/Error fetching /i.test(trimmedOutput)) {
    findings.push({
      code: "FHIR_VALIDATOR_NETWORK_DEPENDENCY",
      severity: "warning",
      message:
        "Validator attempted to fetch additional packages from remote package servers.",
    });
  }

  if (/Exception in thread \"main\"/i.test(trimmedOutput)) {
    findings.push({
      code: "FHIR_VALIDATOR_EXECUTION_FAILED",
      severity: "error",
      message: trimmedOutput.slice(0, 500),
    });
  }

  const failureMatch = trimmedOutput.match(/\*FAILURE\*:\s*([^\n]+)/);
  if (failureMatch) {
    findings.push({
      code: "FHIR_VALIDATION_FAILED",
      severity: "error",
      message: failureMatch[1],
    });
  }

  return findings;
};

export const runFhirOracle = ({
  family,
  xml,
}: {
  family: "eRezept" | "eAU";
  xml?: string;
}): OracleExecutionResult => {
  const findings = [];

  if (!xml || xml.trim().length === 0) {
    findings.push({
      code: "FHIR_XML_MISSING",
      severity: "error" as const,
      message: "No rendered FHIR XML was provided to the oracle runner.",
    });
  } else {
    if (!xml.includes("<Bundle")) {
      findings.push(missingTagFinding("Bundle"));
    }
    if (!xml.includes("<Composition")) {
      findings.push(missingTagFinding("Composition"));
    }

    if (family === "eRezept") {
      if (!xml.includes("<MedicationRequest")) {
        findings.push(missingTagFinding("MedicationRequest"));
      }
      if (!xml.includes("<Medication")) {
        findings.push(missingTagFinding("Medication"));
      }
    }

    if (family === "eAU") {
      if (!xml.includes("<Encounter")) {
        findings.push(missingTagFinding("Encounter"));
      }
      if (!xml.includes("<Condition")) {
        findings.push(missingTagFinding("Condition"));
      }
    }
  }

  return {
    family,
    passed: findings.length === 0,
    findings,
    summary:
      findings.length === 0
        ? `${family} XML satisfied the local FHIR oracle checks.`
        : `${family} XML failed ${findings.length} local FHIR oracle checks.`,
  };
};

export const runExecutableFhirOracle = async ({
  family,
  xml,
  cacheDir,
}: {
  family: "eRezept" | "eAU";
  xml?: string;
  cacheDir?: string;
}): Promise<OracleExecutionResult> => {
  if (!xml || xml.trim().length === 0) {
    return runFhirOracle({ family, xml });
  }

  const { validatorJar, igPaths } = await ensureFhirValidatorAssets({
    family,
    ...(cacheDir ? { cacheDir } : {}),
  });
  const effectiveCacheDir = cacheDir ?? process.env.KBV_UPDATE_CACHE_DIR;
  const userHomeOverride = join(
    effectiveCacheDir ?? join(process.cwd(), ".cache", "kbv-oracles"),
    "fhir-home",
  );

  const tempDir = await mkdtemp(join(tmpdir(), "kbv-fhir-oracle-"));
  const xmlPath = join(tempDir, `${family}.xml`);

  try {
    await ensureFhirValidatorDependencyCache({
      ...(effectiveCacheDir ? { cacheDir: effectiveCacheDir } : {}),
    });
    await mkdir(userHomeOverride, { recursive: true });
    await writeFile(xmlPath, xml, "utf8");
    const igArgs = igPaths.flatMap((igPath) => ["-ig", igPath]);
    const { stdout, stderr } = await execFileAsync(resolveJavaCommand(), [
      `-Duser.home=${userHomeOverride}`,
      "-jar",
      validatorJar,
      "-version",
      "4.0.1",
      xmlPath,
      ...igArgs,
      "-tx",
      "n/a",
    ], {
      maxBuffer: 10 * 1024 * 1024,
    });

    const combined = `${stdout}\n${stderr}`;
    const findings = parseFhirValidatorFindings(combined);

    const passed = findings.every((finding) => finding.severity !== "error");

    return {
      family,
      passed,
      findings,
      summary:
        passed
          ? `${family} executable validator completed without error findings.`
          : `${family} executable validator reported errors.`,
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
    const findings = parseFhirValidatorFindings(errorOutput);
    return {
      family,
      passed: false,
      findings:
        findings.length > 0
          ? findings
          : [
              {
                code: "FHIR_VALIDATOR_EXECUTION_FAILED",
                severity: "error",
                message: errorOutput.slice(0, 500),
              },
            ],
      summary: `${family} executable validator failed to run.`,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};
