import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { OracleExecutionResult } from "../types";

import {
  ensureFhirValidatorAssets,
  ensureFhirValidatorDependencyCache,
  ensureFhirValidatorRuntimeHome,
} from "../assets";
import { resolveJavaCommand } from "../system";

const execFileAsync = promisify(execFile);
const debugTimingsEnabled =
  process.env.KBV_ORACLE_DEBUG === "1" ||
  process.env.KBV_ORACLE_DEBUG === "true";
// eslint-disable-next-line no-control-regex
const ansiColorCodePattern = /\x1B\[[0-9;]*m/gu;

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
  message: `Expected <${tagName}> in rendered FHIR XML.`,
  severity: "error" as const,
});

const parseFhirValidatorFindings = (output: string) => {
  const findings: OracleExecutionResult["findings"][number][] = [];
  const trimmedOutput = output.trim();

  const missingPackageMatches = trimmedOutput.matchAll(
    /Unable to resolve package id (\S+)/g,
  );
  for (const match of missingPackageMatches) {
    findings.push({
      code: "FHIR_VALIDATOR_MISSING_PACKAGE",
      message: `Validator could not resolve package ${match[1]}.`,
      severity: "error",
    });
  }

  if (/Error fetching /i.test(trimmedOutput)) {
    findings.push({
      code: "FHIR_VALIDATOR_NETWORK_DEPENDENCY",
      message:
        "Validator attempted to fetch additional packages from remote package servers.",
      severity: "warning",
    });
  }

  if (/Exception in thread "main"/i.test(trimmedOutput)) {
    findings.push({
      code: "FHIR_VALIDATOR_EXECUTION_FAILED",
      message: trimmedOutput.slice(0, 500),
      severity: "error",
    });
  }

  const failureMatch = /\*FAILURE\*:\s*([^\n]+)/.exec(trimmedOutput);
  if (failureMatch) {
    findings.push({
      code: "FHIR_VALIDATION_FAILED",
      message: failureMatch[1],
      severity: "error",
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

const buildOfflineLanguageCodeSystem = (codes: readonly string[]) => ({
  caseSensitive: true,
  concept: codes.map((code) => ({
    code,
    display: code,
  })),
  content: "complete",
  description:
    "Minimal offline code system generated at validation time so validator_cli can resolve language-tag codes without a terminology server.",
  experimental: true,
  id: "kbv-offline-ietf-bcp-47",
  name: "KbvOfflineIetfBcp47",
  resourceType: "CodeSystem",
  status: "active",
  title: "Offline BCP-47 Language Codes",
  url: "urn:ietf:bcp:47",
  version: "0.0.1-kbv-offline",
});

const buildOfflineAllLanguagesValueSet = (codes: readonly string[]) => ({
  compose: {
    include: [
      {
        concept: codes.map((code) => ({
          code,
          display: code,
        })),
        system: "urn:ietf:bcp:47",
      },
    ],
  },
  description:
    "Minimal offline ValueSet generated at validation time so validator_cli can validate GeneratedDosageInstructionsMeta.language without a terminology server.",
  expansion: {
    contains: codes.map((code) => ({
      code,
      display: code,
      system: "urn:ietf:bcp:47",
    })),
    identifier: "urn:uuid:kbv-offline-all-languages",
    offset: 0,
    timestamp: "2026-03-11T00:00:00Z",
    total: codes.length,
  },
  experimental: true,
  id: "all-languages",
  name: "AllLanguages",
  resourceType: "ValueSet",
  status: "active",
  title: "All Languages",
  url: "http://hl7.org/fhir/ValueSet/all-languages",
  version: "4.0.1",
});

const writeOfflineLanguageSupportResources = async ({
  codes,
  supportDir,
}: {
  codes: readonly string[];
  supportDir: string;
}) => {
  if (codes.length === 0) {
    return;
  }

  await mkdir(supportDir, { recursive: true });
  await writeFile(
    join(supportDir, "CodeSystem-kbv-offline-ietf-bcp-47.json"),
    JSON.stringify(buildOfflineLanguageCodeSystem(codes), null, 2),
    "utf8",
  );
  await writeFile(
    join(supportDir, "ValueSet-all-languages.json"),
    JSON.stringify(buildOfflineAllLanguagesValueSet(codes), null, 2),
    "utf8",
  );
};

const stripAnsiColorCodes = (value: string) =>
  value.replace(ansiColorCodePattern, "");

const coerceExecOutput = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return "";
};

const parseBatchValidationSections = (stdout: string) => {
  const cleanedOutput = stripAnsiColorCodes(stdout);
  const summaries: {
    errorCount: number;
    noteCount: number;
    passed: boolean;
    rawSection: string;
    sourcePath: string;
    summaryLine: string;
    warningCount: number;
  }[] = [];

  for (const section of cleanedOutput.split(/^-- /mu).slice(1)) {
    const [headerLine = "", ...bodyLines] = section.split("\n");
    const sourcePath = headerLine.replace(/\s-+$/u, "").trim();
    const body = bodyLines.join("\n");
    const summaryLine = body
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) => line.startsWith("Success:") || line.startsWith("*FAILURE*:"),
      );

    if (!sourcePath || !summaryLine) {
      continue;
    }

    const countsMatch = /(\d+) errors?, (\d+) warnings?, (\d+) notes?/u.exec(
      summaryLine,
    );
    summaries.push({
      errorCount: Number.parseInt(countsMatch?.[1] ?? "0", 10),
      noteCount: Number.parseInt(countsMatch?.[3] ?? "0", 10),
      passed: summaryLine.startsWith("Success:"),
      rawSection: body.trim(),
      sourcePath,
      summaryLine,
      warningCount: Number.parseInt(countsMatch?.[2] ?? "0", 10),
    });
  }

  return summaries;
};

export interface ExecutableFhirBatchValidationResult {
  readonly passed: boolean;
  readonly stderr: string;
  readonly stdout: string;
  readonly summaries: readonly {
    readonly errorCount: number;
    readonly noteCount: number;
    readonly passed: boolean;
    readonly rawSection: string;
    readonly sourcePath: string;
    readonly summaryLine: string;
    readonly warningCount: number;
  }[];
}

export const runFhirOracle = ({
  family,
  xml,
}: {
  family: "eAU" | "eRezept" | "eVDGA";
  xml?: string;
}): OracleExecutionResult => {
  const findings = [];

  if (!xml || xml.trim().length === 0) {
    findings.push({
      code: "FHIR_XML_MISSING",
      message: "No rendered FHIR XML was provided to the oracle runner.",
      severity: "error" as const,
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

    if (family === "eVDGA") {
      if (!xml.includes("<DeviceRequest")) {
        findings.push(missingTagFinding("DeviceRequest"));
      }
      if (!xml.includes("<Coverage")) {
        findings.push(missingTagFinding("Coverage"));
      }
    }
  }

  return {
    family,
    findings,
    passed: findings.length === 0,
    summary:
      findings.length === 0
        ? `${family} XML satisfied the local FHIR oracle checks.`
        : `${family} XML failed ${findings.length} local FHIR oracle checks.`,
  };
};

export const runExecutableFhirOracle = async ({
  cacheDir,
  family,
  xml,
}: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xml?: string;
}): Promise<OracleExecutionResult> => {
  if (!xml || xml.trim().length === 0) {
    return runFhirOracle({ family, xml });
  }

  const effectiveCacheDir = cacheDir ?? process.env.KBV_UPDATE_CACHE_DIR;
  const resolvedCacheDir =
    effectiveCacheDir ?? join(process.cwd(), ".cache", "kbv-oracles");
  const runtimeKey = [
    "exec",
    process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "main",
    String(process.pid),
    family,
  ].join("-");
  const userHomeOverride = await ensureFhirValidatorRuntimeHome({
    cacheDir: resolvedCacheDir,
    runtimeKey,
  });

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
    await writeOfflineLanguageSupportResources({
      codes: offlineLanguageCodes,
      supportDir,
    });
    logTiming(`writeInputXml(${family})`, writeStart);

    const mountedIgPaths =
      offlineLanguageCodes.length > 0
        ? [supportDir, ...assets.igPaths]
        : assets.igPaths;
    const igArgs = mountedIgPaths.flatMap((igPath) => ["-ig", igPath]);
    const execStart = Date.now();
    logDebug(`starting validatorCli(${family})`);
    const { stderr, stdout } = await execFileAsync(
      resolveJavaCommand(),
      [
        `-Duser.home=${userHomeOverride}`,
        "-jar",
        assets.validatorJar,
        "-version",
        "4.0.1",
        xmlPath,
        ...igArgs,
        "-tx",
        "n/a",
      ],
      {
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    logTiming(`validatorCli(${family})`, execStart);

    const combined = `${stdout}\n${stderr}`;
    const findings = parseFhirValidatorFindings(combined);

    const passed = findings.every((finding) => finding.severity !== "error");

    return {
      family,
      findings,
      passed,
      summary: passed
        ? `${family} executable validator completed without error findings.`
        : `${family} executable validator reported errors.`,
    };
  } catch (error) {
    const errorOutput =
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      "stderr" in error
        ? `${coerceExecOutput(error.stdout)}\n${coerceExecOutput(error.stderr)}`
        : error instanceof Error
          ? error.message
          : String(error);
    const findings = parseFhirValidatorFindings(errorOutput);
    return {
      family,
      findings:
        findings.length > 0
          ? findings
          : [
              {
                code: "FHIR_VALIDATOR_EXECUTION_FAILED",
                message: errorOutput.slice(0, 500),
                severity: "error",
              },
            ],
      passed: false,
      summary: `${family} executable validator failed to run.`,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
};

export const runExecutableFhirValidationBatch = async ({
  cacheDir,
  family,
  xmlPaths,
}: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xmlPaths: readonly string[];
}): Promise<ExecutableFhirBatchValidationResult> => {
  if (xmlPaths.length === 0) {
    return {
      passed: true,
      stderr: "",
      stdout: "",
      summaries: [],
    };
  }

  const effectiveCacheDir = cacheDir ?? process.env.KBV_UPDATE_CACHE_DIR;
  const resolvedCacheDir =
    effectiveCacheDir ?? join(process.cwd(), ".cache", "kbv-oracles");
  const runtimeKey = [
    "exec-batch",
    process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "main",
    String(process.pid),
    family,
  ].join("-");
  const userHomeOverride = await ensureFhirValidatorRuntimeHome({
    cacheDir: resolvedCacheDir,
    runtimeKey,
  });

  const tempDir = await mkdtemp(join(tmpdir(), "kbv-fhir-batch-oracle-"));
  const supportDir = join(tempDir, "support");

  try {
    const assets = await ensureFhirValidatorAssets({
      family,
      ...(cacheDir ? { cacheDir } : {}),
    });
    await ensureFhirValidatorDependencyCache({
      ...(effectiveCacheDir ? { cacheDir: effectiveCacheDir } : {}),
    });

    const xmlDocuments = await Promise.all(
      xmlPaths.map(async (xmlPath) => readFile(xmlPath, "utf8")),
    );
    const offlineLanguageCodes = [
      ...new Set(
        xmlDocuments.flatMap((xml) => extractOfflineLanguageCodes(xml)),
      ),
    ].sort();

    await mkdir(userHomeOverride, { recursive: true });
    await writeOfflineLanguageSupportResources({
      codes: offlineLanguageCodes,
      supportDir,
    });

    const mountedIgPaths =
      offlineLanguageCodes.length > 0
        ? [supportDir, ...assets.igPaths]
        : assets.igPaths;
    const igArgs = mountedIgPaths.flatMap((igPath) => ["-ig", igPath]);

    const { stderr, stdout } = await execFileAsync(
      resolveJavaCommand(),
      [
        `-Duser.home=${userHomeOverride}`,
        "-jar",
        assets.validatorJar,
        "-version",
        "4.0.1",
        ...xmlPaths,
        ...igArgs,
        "-tx",
        "n/a",
      ],
      {
        maxBuffer: 64 * 1024 * 1024,
      },
    );

    const summaries = parseBatchValidationSections(stdout);
    return {
      passed:
        summaries.length === xmlPaths.length &&
        summaries.every((summary) => summary.passed),
      stderr,
      stdout,
      summaries,
    };
  } catch (error) {
    const stdout =
      typeof error === "object" && error !== null && "stdout" in error
        ? coerceExecOutput(error.stdout)
        : "";
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? coerceExecOutput(error.stderr)
        : error instanceof Error
          ? error.message
          : String(error);

    return {
      passed: false,
      stderr,
      stdout,
      summaries: parseBatchValidationSections(stdout),
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
};
