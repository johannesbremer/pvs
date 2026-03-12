import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { OracleExecutionResult } from "../types";

import {
  ensureFhirValidatorAssets,
  ensureFhirValidatorDependencyCache,
} from "../assets";
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
      await writeFile(
        join(supportDir, "ValueSet-all-languages.json"),
        JSON.stringify(
          buildOfflineAllLanguagesValueSet(offlineLanguageCodes),
          null,
          2,
        ),
        "utf8",
      );
    }
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
        ? `${String(error.stdout)}\n${String(error.stderr)}`
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
