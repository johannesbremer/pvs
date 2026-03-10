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
const debugTimingsEnabled =
  process.env.KBV_ORACLE_DEBUG === "1" ||
  process.env.KBV_ORACLE_DEBUG === "true";

const logDebug = (message: string) => {
  if (!debugTimingsEnabled) {
    return;
  }

  console.error(`[kbv-oracle] ${message}`);
};

const logTiming = (label: string, startTime: number) => {
  if (!debugTimingsEnabled) {
    return;
  }

  const elapsedMs = Date.now() - startTime;
  console.error(`[kbv-oracle] ${label}: ${elapsedMs}ms`);
};

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

const extractOfflineLanguageCodes = (xml: string) => {
  const matches = xml.matchAll(
    /<extension\s+url="language">\s*<valueCode\s+value="([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)"\s*\/>\s*<\/extension>/g,
  );
  return [...new Set([...matches].map((match) => match[1]))].sort();
};

const buildOfflineLanguageCodeSystem = (codes: ReadonlyArray<string>) => ({
  resourceType: "CodeSystem",
  id: "kbv-offline-ietf-bcp-47",
  url: "urn:ietf:bcp:47",
  version: "0.0.1-kbv-offline",
  name: "KbvOfflineIetfBcp47",
  title: "Offline BCP-47 Language Codes",
  status: "active",
  experimental: true,
  description:
    "Minimal offline code system generated at validation time so validator_cli can resolve language-tag codes without a terminology server.",
  caseSensitive: true,
  content: "complete",
  concept: codes.map((code) => ({
    code,
    display: code,
  })),
});

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

  const effectiveCacheDir = cacheDir ?? process.env.KBV_UPDATE_CACHE_DIR;
  const userHomeOverride = join(
    effectiveCacheDir ?? join(process.cwd(), ".cache", "kbv-oracles"),
    "fhir-home",
  );

  const tempDir = await mkdtemp(join(tmpdir(), "kbv-fhir-oracle-"));
  const xmlPath = join(tempDir, `${family}.xml`);
  const supportDir = join(tempDir, "support");

  try {
    const assetsStart = Date.now();
    logDebug(`starting ensureFhirValidatorAssets(${family})`);
    const assets = await ensureFhirValidatorAssets({
      family,
      ...(cacheDir ? { cacheDir } : {}),
    });
    logTiming(`ensureFhirValidatorAssets(${family})`, assetsStart);

    const dependencyStart = Date.now();
    logDebug(`starting ensureFhirValidatorDependencyCache(${family})`);
    await ensureFhirValidatorDependencyCache({
      ...(effectiveCacheDir ? { cacheDir: effectiveCacheDir } : {}),
    });
    logTiming(`ensureFhirValidatorDependencyCache(${family})`, dependencyStart);

    const writeStart = Date.now();
    logDebug(`starting writeInputXml(${family})`);
    await mkdir(userHomeOverride, { recursive: true });
    await writeFile(xmlPath, xml, "utf8");
    const offlineLanguageCodes = extractOfflineLanguageCodes(xml);
    if (offlineLanguageCodes.length > 0) {
      await mkdir(supportDir, { recursive: true });
      await writeFile(
        join(supportDir, "CodeSystem-kbv-offline-ietf-bcp-47.json"),
        JSON.stringify(
          buildOfflineLanguageCodeSystem(offlineLanguageCodes),
          null,
          2,
        ),
        "utf8",
      );
    }
    logTiming(`writeInputXml(${family})`, writeStart);

    const mountedIgPaths =
      offlineLanguageCodes.length > 0 ? [supportDir, ...assets.igPaths] : assets.igPaths;
    const igArgs = mountedIgPaths.flatMap((igPath) => ["-ig", igPath]);
    const execStart = Date.now();
    logDebug(`starting validatorCli(${family})`);
    const { stdout, stderr } = await execFileAsync(resolveJavaCommand(), [
      `-Duser.home=${userHomeOverride}`,
      "-jar",
      assets.validatorJar,
      "-version",
      "4.0.1",
      xmlPath,
      ...igArgs,
      "-tx",
      "n/a",
    ], {
      maxBuffer: 10 * 1024 * 1024,
    });
    logTiming(`validatorCli(${family})`, execStart);

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
