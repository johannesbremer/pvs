import { Effect } from "effect";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import type { OracleExecutionResult } from "../types";

import {
  ensureFhirValidatorAssets,
  ensureFhirValidatorRuntimeHome,
} from "../assets";
import { fileSystem, path } from "../platform";
import { resolveJavaCommand } from "../system";

const debugTimingsEnabled =
  process.env.KBV_ORACLE_DEBUG === "1" ||
  process.env.KBV_ORACLE_DEBUG === "true";
const validatorServerStartupTimeoutMs = 60_000;
const validatorServerPollIntervalMs = 200;
const validatorBatchConcurrency = Number.parseInt(
  process.env.PVS_FHIR_VALIDATOR_BATCH_CONCURRENCY ?? "8",
  10,
);
const effectiveValidatorBatchConcurrency =
  Number.isInteger(validatorBatchConcurrency) && validatorBatchConcurrency > 0
    ? validatorBatchConcurrency
    : 8;

type OperationOutcomeIssue = {
  readonly code?: string;
  readonly details?: {
    readonly coding?: readonly {
      readonly code?: string;
      readonly display?: string;
      readonly system?: string;
    }[];
    readonly text?: string;
  };
  readonly diagnostics?: string;
  readonly severity?: string;
};

type OperationOutcomePayload = {
  readonly issue?: readonly OperationOutcomeIssue[];
  readonly resourceType?: string;
};

type ValidatorServerHandle = {
  readonly baseUrl: string;
  readonly child: ReturnType<typeof spawn>;
  readonly family: "eAU" | "eRezept" | "eVDGA";
  readonly languageCodes: readonly string[];
  readonly port: number;
  readonly runtimeHome: string;
  readonly stderrLog: { current: string };
  readonly stdoutLog: { current: string };
};

const validatorServerCache = new Map<string, Promise<ValidatorServerHandle>>();
let validatorServerShutdownRegistered = false;

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

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

const registerValidatorServerShutdown = () => {
  if (validatorServerShutdownRegistered) {
    return;
  }

  validatorServerShutdownRegistered = true;
  process.once("exit", () => {
    for (const pending of validatorServerCache.values()) {
      pending
        .then((handle) => {
          if (handle.child.exitCode === null && !handle.child.killed) {
            handle.child.kill("SIGTERM");
          }
        })
        .catch(() => undefined);
    }
  });
};

const hasResourceTag = (xml: string, tagName: string) =>
  new RegExp(`<${tagName}(?=[\\s>])`, "u").test(xml);

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

const formatFindingsSummary = (
  findings: readonly OracleExecutionResult["findings"][number][],
) => {
  const errorCount = findings.filter(
    (finding) => finding.severity === "error",
  ).length;
  const warningCount = findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const noteCount = findings.filter(
    (finding) => finding.severity === "info",
  ).length;
  const status = errorCount === 0 ? "Success" : "*FAILURE*";

  return `${status}: ${errorCount} errors, ${warningCount} warnings, ${noteCount} notes`;
};

const normalizeIssueSeverity = (
  severity: string | undefined,
): OracleExecutionResult["findings"][number]["severity"] => {
  switch (severity) {
    case "error":
    case "fatal":
      return "error";
    case "warning":
      return "warning";
    default:
      return "info";
  }
};

const parseOperationOutcomeFindings = (
  payload: OperationOutcomePayload | undefined,
  fallbackBody: string,
) => {
  const findings: OracleExecutionResult["findings"][number][] = [];

  for (const issue of payload?.issue ?? []) {
    const firstCoding = issue.details?.coding?.[0];
    findings.push({
      code:
        firstCoding?.code ??
        issue.code ??
        `FHIR_VALIDATOR_${(issue.severity ?? "info").toUpperCase()}`,
      message:
        issue.diagnostics ??
        issue.details?.text ??
        firstCoding?.display ??
        issue.code ??
        "Validator reported an issue without diagnostics.",
      severity: normalizeIssueSeverity(issue.severity),
    });
  }

  if (findings.length > 0) {
    return findings;
  }

  const fallbackFindings = parseFhirValidatorFindings(fallbackBody);
  if (fallbackFindings.length > 0) {
    return fallbackFindings;
  }

  if (fallbackBody.trim().length === 0) {
    return [];
  }

  return [
    {
      code: "FHIR_VALIDATOR_UNPARSEABLE_RESPONSE",
      message: fallbackBody.trim().slice(0, 500),
      severity: "error",
    },
  ] satisfies OracleExecutionResult["findings"];
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

const writeOfflineLanguageSupportResourcesEffect = Effect.fn(
  "oracles.writeOfflineLanguageSupportResources",
)(function* ({
  codes,
  supportDir,
}: {
  codes: readonly string[];
  supportDir: string;
}) {
  if (codes.length === 0) {
    return;
  }

  yield* fileSystem.makeDirectory(supportDir, { recursive: true });
  yield* fileSystem.writeFileString(
    path.join(supportDir, "CodeSystem-kbv-offline-ietf-bcp-47.json"),
    JSON.stringify(buildOfflineLanguageCodeSystem(codes), null, 2),
  );
  yield* fileSystem.writeFileString(
    path.join(supportDir, "ValueSet-all-languages.json"),
    JSON.stringify(buildOfflineAllLanguagesValueSet(codes), null, 2),
  );
});

export const toBatchValidationSourcePathKey = (sourcePath: string) =>
  sourcePath.normalize("NFC");

const alignBatchValidationSummarySourcePaths = ({
  summaries,
  xmlPaths,
}: {
  summaries: readonly {
    errorCount: number;
    noteCount: number;
    passed: boolean;
    rawSection: string;
    sourcePath: string;
    summaryLine: string;
    warningCount: number;
  }[];
  xmlPaths: readonly string[];
}) => {
  if (summaries.length !== xmlPaths.length) {
    return summaries;
  }

  return summaries.map((summary, index) => ({
    ...summary,
    // The validator's section header path can be mojibake in CI, so we use the
    // original batch input ordering as the stable identifier when counts align.
    sourcePath: toBatchValidationSourcePathKey(
      xmlPaths[index] ?? summary.sourcePath,
    ),
  }));
};

const getFhirRuntimeKey = (
  mode: "exec" | "exec-batch",
  family: "eAU" | "eRezept" | "eVDGA",
) =>
  [
    mode,
    process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "main",
    family,
  ].join("-");

const reserveValidatorServerPort = () =>
  Effect.async<number, Error>((resume) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      resume(Effect.fail(toError(error)));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          resume(Effect.fail(new Error("Failed to reserve port."))),
        );
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          resume(Effect.fail(toError(error)));
          return;
        }
        resume(Effect.succeed(port));
      });
    });
  });

const waitForValidatorServerEffect = Effect.fn(
  "oracles.waitForValidatorServer",
)(function* ({
  baseUrl,
  child,
  stderrLog,
  stdoutLog,
}: {
  baseUrl: string;
  child: ReturnType<typeof spawn>;
  stderrLog: { current: string };
  stdoutLog: { current: string };
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < validatorServerStartupTimeoutMs) {
    if (child.exitCode !== null || child.killed) {
      const combined = `${stdoutLog.current}\n${stderrLog.current}`.trim();
      throw new Error(
        combined.length > 0
          ? combined.slice(0, 2_000)
          : "FHIR validator server exited before becoming ready.",
      );
    }

    const response = yield* Effect.tryPromise({
      catch: toError,
      try: () =>
        fetch(`${baseUrl}/validateResource`, {
          method: "GET",
        }),
    }).pipe(
      Effect.catchAll(() => Effect.succeed<Response | undefined>(undefined)),
    );

    if (response && response.status < 500) {
      return;
    }

    yield* Effect.sleep(`${validatorServerPollIntervalMs} millis`);
  }

  throw new Error(
    `FHIR validator server did not become ready within ${validatorServerStartupTimeoutMs}ms.`,
  );
});

const stopValidatorServer = (handle: ValidatorServerHandle) =>
  Effect.sync(() => {
    if (handle.child.exitCode === null && !handle.child.killed) {
      handle.child.kill("SIGTERM");
    }
  });

const startValidatorServerEffect = Effect.fn("oracles.startValidatorServer")(
  function* ({
    cacheDir,
    family,
    languageCodes,
    runtimeKey,
  }: {
    cacheDir: string;
    family: "eAU" | "eRezept" | "eVDGA";
    languageCodes: readonly string[];
    runtimeKey: string;
  }) {
    registerValidatorServerShutdown();

    const runtimeHome = yield* ensureFhirValidatorRuntimeHome({
      cacheDir,
      runtimeKey,
    });
    const supportDir = path.join(runtimeHome, "support");
    yield* fileSystem.remove(supportDir, { force: true, recursive: true });
    yield* writeOfflineLanguageSupportResourcesEffect({
      codes: languageCodes,
      supportDir,
    });

    const assetsStart = Date.now();
    logDebug(`starting ensureFhirValidatorAssets(${family})`);
    const assets = yield* ensureFhirValidatorAssets({
      cacheDir,
      family,
    });
    logTiming(`ensureFhirValidatorAssets(${family})`, assetsStart);

    const port = yield* reserveValidatorServerPort();
    const javaCommand = yield* resolveJavaCommand();
    const mountedIgPaths =
      languageCodes.length > 0
        ? [supportDir, ...assets.igPaths]
        : assets.igPaths;
    const igArgs = mountedIgPaths.flatMap((igPath) => ["-ig", igPath]);
    const stderrLog = { current: "" };
    const stdoutLog = { current: "" };

    logDebug(`starting validatorServer(${family}) on port ${port}`);
    const child = yield* Effect.sync(() =>
      spawn(
        javaCommand,
        [
          `-Duser.home=${runtimeHome}`,
          "-jar",
          assets.validatorJar,
          "-server",
          String(port),
          "-version",
          "4.0.1",
          ...igArgs,
          "-tx",
          "n/a",
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    );

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutLog.current = `${stdoutLog.current}${chunk}`.slice(-20_000);
    });
    child.stderr.on("data", (chunk: string) => {
      stderrLog.current = `${stderrLog.current}${chunk}`.slice(-20_000);
    });

    const handle = {
      baseUrl: `http://127.0.0.1:${port}`,
      child,
      family,
      languageCodes,
      port,
      runtimeHome,
      stderrLog,
      stdoutLog,
    } satisfies ValidatorServerHandle;

    yield* waitForValidatorServerEffect({
      baseUrl: handle.baseUrl,
      child,
      stderrLog,
      stdoutLog,
    });

    return handle;
  },
);

const ensureValidatorServerEffect = Effect.fn("oracles.ensureValidatorServer")(
  function* ({
    cacheDir,
    family,
    languageCodes,
    runtimeKey,
  }: {
    cacheDir: string;
    family: "eAU" | "eRezept" | "eVDGA";
    languageCodes: readonly string[];
    runtimeKey: string;
  }) {
    const cacheKey = `${cacheDir}:${runtimeKey}`;
    const existingPromise = validatorServerCache.get(cacheKey);

    if (existingPromise) {
      const existing = yield* Effect.tryPromise(() => existingPromise);
      const canReuse =
        existing.child.exitCode === null &&
        !existing.child.killed &&
        languageCodes.every((code) => existing.languageCodes.includes(code));

      if (canReuse) {
        return existing;
      }

      validatorServerCache.delete(cacheKey);
      yield* stopValidatorServer(existing);
    }

    const pending = Effect.runPromise(
      startValidatorServerEffect({
        cacheDir,
        family,
        languageCodes,
        runtimeKey,
      }),
    );
    validatorServerCache.set(cacheKey, pending);

    try {
      return yield* Effect.tryPromise(() => pending);
    } catch (error) {
      validatorServerCache.delete(cacheKey);
      throw error;
    }
  },
);

const validateXmlWithServerEffect = Effect.fn("oracles.validateXmlWithServer")(
  function* ({
    family,
    server,
    xml,
  }: {
    family: "eAU" | "eRezept" | "eVDGA";
    server: ValidatorServerHandle;
    xml: string;
  }) {
    const response = yield* Effect.tryPromise({
      catch: toError,
      try: () =>
        fetch(`${server.baseUrl}/validateResource`, {
          body: xml,
          headers: {
            Accept: "application/fhir+json",
            "Content-Type": "application/fhir+xml",
          },
          method: "POST",
        }),
    });
    const body = yield* Effect.tryPromise({
      catch: toError,
      try: () => response.text(),
    });
    const payload = yield* Effect.tryPromise<
      OperationOutcomePayload | undefined,
      Error
    >({
      catch: toError,
      try: () =>
        Promise.resolve().then(() => {
          if (body.trim().length === 0) {
            return undefined;
          }

          return JSON.parse(body) as OperationOutcomePayload;
        }),
    }).pipe(
      Effect.catchAll(() =>
        Effect.succeed<OperationOutcomePayload | undefined>(undefined),
      ),
    );
    const findings = parseOperationOutcomeFindings(payload, body);
    const passed = findings.every((finding) => finding.severity !== "error");

    if (!response.ok && findings.length === 0) {
      return {
        family,
        findings: [
          {
            code: `FHIR_VALIDATOR_HTTP_${response.status}`,
            message: body.trim().slice(0, 500),
            severity: response.status >= 500 ? "error" : "warning",
          },
        ],
        passed: false,
        summary: `${family} executable validator reported errors.`,
      } satisfies OracleExecutionResult;
    }

    return {
      family,
      findings,
      passed,
      summary: passed
        ? `${family} executable validator completed without error findings.`
        : `${family} executable validator reported errors.`,
    } satisfies OracleExecutionResult;
  },
);

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

export const reconcileBatchValidationSummarySourcePaths = (
  args: Parameters<typeof alignBatchValidationSummarySourcePaths>[0],
) => alignBatchValidationSummarySourcePaths(args);

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
    if (!hasResourceTag(xml, "Bundle")) {
      findings.push(missingTagFinding("Bundle"));
    }
    if (!hasResourceTag(xml, "Composition")) {
      findings.push(missingTagFinding("Composition"));
    }

    if (family === "eRezept") {
      if (!hasResourceTag(xml, "MedicationRequest")) {
        findings.push(missingTagFinding("MedicationRequest"));
      }
      if (!hasResourceTag(xml, "Medication")) {
        findings.push(missingTagFinding("Medication"));
      }
    }

    if (family === "eAU") {
      if (!hasResourceTag(xml, "Encounter")) {
        findings.push(missingTagFinding("Encounter"));
      }
      if (!hasResourceTag(xml, "Condition")) {
        findings.push(missingTagFinding("Condition"));
      }
    }

    if (family === "eVDGA") {
      if (!hasResourceTag(xml, "DeviceRequest")) {
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

export const runExecutableFhirOracleEffect = Effect.fn(
  "oracles.runExecutableFhirOracle",
)(function* ({
  cacheDir,
  family,
  xml,
}: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xml?: string;
}) {
  if (!xml || xml.trim().length === 0) {
    return runFhirOracle({ family, xml });
  }

  const effectiveCacheDir = cacheDir ?? process.env.KBV_UPDATE_CACHE_DIR;
  const resolvedCacheDir =
    effectiveCacheDir ?? path.join(process.cwd(), ".cache", "kbv-oracles");
  const runtimeKey = getFhirRuntimeKey("exec", family);

  return yield* Effect.gen(function* () {
    const offlineLanguageCodes = extractOfflineLanguageCodes(xml);
    const server = yield* ensureValidatorServerEffect({
      cacheDir: resolvedCacheDir,
      family,
      languageCodes: offlineLanguageCodes,
      runtimeKey,
    });

    return yield* validateXmlWithServerEffect({
      family,
      server,
      xml,
    });
  }).pipe(
    Effect.catchAll((error) => {
      const errorOutput =
        error instanceof Error ? error.message : String(error);
      const findings = parseFhirValidatorFindings(errorOutput);
      return Effect.succeed({
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
      } satisfies OracleExecutionResult);
    }),
  );
});

export const runExecutableFhirOracle = (args: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xml?: string;
}): Promise<OracleExecutionResult> =>
  Effect.runPromise(runExecutableFhirOracleEffect(args));

export const runExecutableFhirValidationBatchEffect = Effect.fn(
  "oracles.runExecutableFhirValidationBatch",
)(function* ({
  cacheDir,
  family,
  xmlPaths,
}: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xmlPaths: readonly string[];
}) {
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
    effectiveCacheDir ?? path.join(process.cwd(), ".cache", "kbv-oracles");
  const runtimeKey = getFhirRuntimeKey("exec-batch", family);
  return yield* Effect.gen(function* () {
    const xmlEntries = yield* Effect.forEach(xmlPaths, (xmlPath) =>
      Effect.gen(function* () {
        const xml = yield* fileSystem.readFileString(xmlPath);
        return {
          languageCodes: extractOfflineLanguageCodes(xml),
          xml,
          xmlPath,
        };
      }),
    );
    const offlineLanguageCodes = [
      ...new Set(xmlEntries.flatMap((entry) => entry.languageCodes)),
    ].sort();
    const server = yield* ensureValidatorServerEffect({
      cacheDir: resolvedCacheDir,
      family,
      languageCodes: offlineLanguageCodes,
      runtimeKey,
    });
    const summaries = yield* Effect.forEach(
      xmlEntries,
      ({ xml, xmlPath }) =>
        Effect.gen(function* () {
          const result = yield* validateXmlWithServerEffect({
            family,
            server,
            xml,
          });
          const errorCount = result.findings.filter(
            (finding) => finding.severity === "error",
          ).length;
          const warningCount = result.findings.filter(
            (finding) => finding.severity === "warning",
          ).length;
          const noteCount = result.findings.filter(
            (finding) => finding.severity === "info",
          ).length;

          return {
            errorCount,
            noteCount,
            passed: result.passed,
            rawSection:
              result.findings.length === 0
                ? formatFindingsSummary(result.findings)
                : [
                    formatFindingsSummary(result.findings),
                    ...result.findings.map(
                      (finding) =>
                        `${finding.severity.toUpperCase()}: ${finding.code}: ${finding.message}`,
                    ),
                  ].join("\n"),
            sourcePath: toBatchValidationSourcePathKey(xmlPath),
            summaryLine: formatFindingsSummary(result.findings),
            warningCount,
          };
        }),
      { concurrency: effectiveValidatorBatchConcurrency },
    );

    return {
      passed: summaries.every((summary) => summary.passed),
      stderr: "",
      stdout: "",
      summaries: alignBatchValidationSummarySourcePaths({
        summaries,
        xmlPaths,
      }),
    } satisfies ExecutableFhirBatchValidationResult;
  });
});

export const runExecutableFhirValidationBatch = (args: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xmlPaths: readonly string[];
}): Promise<ExecutableFhirBatchValidationResult> =>
  Effect.runPromise(runExecutableFhirValidationBatchEffect(args));
