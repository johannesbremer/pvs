import { Effect, Either, Runtime, Schema } from "effect";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import type { OracleExecutionResult } from "../types";

import {
  ensureFhirValidatorAssets,
  ensureFhirValidatorDependencyCache,
  ensureFhirValidatorRuntimeHome,
} from "../assets";
import { fileSystem, path, runCommand } from "../platform";
import { resolveJavaCommand } from "../system";

const debugTimingsEnabled =
  process.env.KBV_ORACLE_DEBUG === "1" ||
  process.env.KBV_ORACLE_DEBUG === "true";
// eslint-disable-next-line no-control-regex
const ansiColorCodePattern = /\x1B\[[0-9;]*m/gu;
const validatorServerStartupTimeoutMs = 60_000;
const validatorServerPollIntervalMs = 200;
const validatorServerRequestTimeoutMs = 30_000;
const validatorCliTimeoutMs = 60_000;
const validatorBatchCliTimeoutMs = 180_000;
const javaEnvKeysToStrip = [
  "CLASSPATH",
  "JAVA_TOOL_OPTIONS",
  "JDK_JAVA_OPTIONS",
  "_JAVA_OPTIONS",
] as const;

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

class FhirOracleRuntimeError extends Schema.TaggedError<FhirOracleRuntimeError>()(
  "FhirOracleRuntimeError",
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  },
) {}

const OperationOutcomeIssueFields = Schema.Struct({
  code: Schema.optional(Schema.String),
  details: Schema.optional(
    Schema.Struct({
      coding: Schema.optional(
        Schema.Array(
          Schema.Struct({
            code: Schema.optional(Schema.String),
            display: Schema.optional(Schema.String),
            system: Schema.optional(Schema.String),
          }),
        ),
      ),
      text: Schema.optional(Schema.String),
    }),
  ),
  diagnostics: Schema.optional(Schema.String),
  severity: Schema.optional(Schema.String),
});

const OperationOutcomePayloadFields = Schema.Struct({
  issue: Schema.optional(Schema.Array(OperationOutcomeIssueFields)),
  resourceType: Schema.optional(Schema.String),
});

const OfflineLanguageCodeSystemFields = Schema.Struct({
  caseSensitive: Schema.Boolean,
  concept: Schema.Array(
    Schema.Struct({
      code: Schema.String,
      display: Schema.String,
    }),
  ),
  content: Schema.String,
  description: Schema.String,
  experimental: Schema.Boolean,
  id: Schema.String,
  name: Schema.String,
  resourceType: Schema.Literal("CodeSystem"),
  status: Schema.String,
  title: Schema.String,
  url: Schema.String,
  version: Schema.String,
});

const OfflineAllLanguagesValueSetFields = Schema.Struct({
  compose: Schema.Struct({
    include: Schema.Array(
      Schema.Struct({
        concept: Schema.Array(
          Schema.Struct({
            code: Schema.String,
            display: Schema.String,
          }),
        ),
        system: Schema.String,
      }),
    ),
  }),
  description: Schema.String,
  expansion: Schema.Struct({
    contains: Schema.Array(
      Schema.Struct({
        code: Schema.String,
        display: Schema.String,
        system: Schema.String,
      }),
    ),
    identifier: Schema.String,
    offset: Schema.Number,
    timestamp: Schema.String,
    total: Schema.Number,
  }),
  experimental: Schema.Boolean,
  id: Schema.String,
  name: Schema.String,
  resourceType: Schema.Literal("ValueSet"),
  status: Schema.String,
  title: Schema.String,
  url: Schema.String,
  version: Schema.String,
});

const encodeJsonString = <A, I, R>(schema: Schema.Schema<A, I, R>, value: A) =>
  Schema.encode(Schema.parseJson(schema))(value);

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

const toFhirOracleRuntimeError = (error: unknown, message?: string) =>
  new FhirOracleRuntimeError({
    ...(error instanceof Error ? { cause: error.message } : {}),
    message:
      message ?? (error instanceof Error ? error.message : String(error)),
  });

const withRequestTimeout = (url: string, init?: RequestInit) =>
  fetch(url, {
    ...init,
    signal: AbortSignal.timeout(validatorServerRequestTimeoutMs),
  });

const getSanitizedJavaEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        value !== undefined &&
        !javaEnvKeysToStrip.includes(
          key as (typeof javaEnvKeysToStrip)[number],
        ),
    ),
  );

const runValidatorCommandEffect = ({
  args,
  command,
  timeoutMs,
}: {
  args: readonly string[];
  command: string;
  timeoutMs: number;
}) =>
  Effect.tryPromise(() =>
    runCommand({
      args,
      command,
      env: getSanitizedJavaEnv(),
    }),
  ).pipe(
    Effect.timeoutFail({
      duration: `${timeoutMs} millis`,
      onTimeout: () =>
        new FhirOracleRuntimeError({
          message: `FHIR validator CLI timed out after ${timeoutMs}ms.`,
        }),
    }),
  );

const stripAnsiColorCodes = (value: string) =>
  value.replace(ansiColorCodePattern, "");

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
  resourceType: "CodeSystem" as const,
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
  resourceType: "ValueSet" as const,
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
  const codeSystemJson = yield* encodeJsonString(
    OfflineLanguageCodeSystemFields,
    buildOfflineLanguageCodeSystem(codes),
  );
  yield* fileSystem.writeFileString(
    path.join(supportDir, "CodeSystem-kbv-offline-ietf-bcp-47.json"),
    codeSystemJson,
  );
  const valueSetJson = yield* encodeJsonString(
    OfflineAllLanguagesValueSetFields,
    buildOfflineAllLanguagesValueSet(codes),
  );
  yield* fileSystem.writeFileString(
    path.join(supportDir, "ValueSet-all-languages.json"),
    valueSetJson,
  );
});

export const toBatchValidationSourcePathKey = (sourcePath: string) =>
  sourcePath.normalize("NFC");

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
    const sourcePath = toBatchValidationSourcePathKey(
      headerLine.replace(/\s-+$/u, "").trim(),
    );
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
  mode: "exec" | "exec-batch" | "exec-server",
  family: "eAU" | "eRezept" | "eVDGA",
) =>
  [
    mode,
    process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "main",
    family,
  ].join("-");

const reserveValidatorServerPort = () =>
  Effect.async<number, FhirOracleRuntimeError>((resume) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      resume(Effect.fail(toFhirOracleRuntimeError(error)));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          resume(
            Effect.fail(
              new FhirOracleRuntimeError({
                message: "Failed to reserve port.",
              }),
            ),
          ),
        );
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          resume(Effect.fail(toFhirOracleRuntimeError(error)));
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
      return yield* new FhirOracleRuntimeError({
        message:
          combined.length > 0
            ? combined.slice(0, 2_000)
            : "FHIR validator server exited before becoming ready.",
      });
    }

    const response = yield* Effect.tryPromise({
      catch: toFhirOracleRuntimeError,
      try: () =>
        withRequestTimeout(`${baseUrl}/validateResource`, {
          method: "GET",
        }),
    }).pipe(
      Effect.catchAll(() =>
        Effect.as(Effect.void, undefined as Response | undefined),
      ),
    );

    if (response && response.status < 500) {
      return;
    }

    yield* Effect.sleep(`${validatorServerPollIntervalMs} millis`);
  }

  return yield* new FhirOracleRuntimeError({
    message: `FHIR validator server did not become ready within ${validatorServerStartupTimeoutMs}ms.`,
  });
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
          env: getSanitizedJavaEnv(),
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
      const existing = yield* Effect.tryPromise({
        catch: toFhirOracleRuntimeError,
        try: () => existingPromise,
      });
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

    const runtime = yield* Effect.runtime<never>();
    const pending = Runtime.runPromise(runtime)(
      startValidatorServerEffect({
        cacheDir,
        family,
        languageCodes,
        runtimeKey,
      }),
    );
    validatorServerCache.set(cacheKey, pending);

    return yield* Effect.tryPromise({
      catch: toFhirOracleRuntimeError,
      try: () => pending,
    }).pipe(
      Effect.tapError(() =>
        Effect.sync(() => validatorServerCache.delete(cacheKey)),
      ),
    );
  },
);

const invalidateValidatorServerCacheEffect = Effect.fn(
  "oracles.invalidateValidatorServerCache",
)(function* ({ cacheKey }: { cacheKey: string }) {
  const pending = validatorServerCache.get(cacheKey);
  validatorServerCache.delete(cacheKey);

  if (!pending) {
    return;
  }

  const handle = yield* Effect.tryPromise({
    catch: () => undefined,
    try: () => pending,
  }).pipe(
    Effect.catchAll(() =>
      Effect.as(Effect.void, undefined as undefined | ValidatorServerHandle),
    ),
  );

  if (!handle) {
    return;
  }

  yield* stopValidatorServer(handle);
});

export const runExecutableFhirOracleWithServerRecoveryEffect = <E>({
  executeServer,
  onServerRuntimeError,
}: {
  executeServer: Effect.Effect<OracleExecutionResult, E, never>;
  onServerRuntimeError: (args: {
    attempt: 1 | 2;
    error: E;
  }) => Effect.Effect<void, never, never>;
}): Effect.Effect<OracleExecutionResult, E, never> =>
  Effect.gen(function* () {
    const firstAttempt = yield* Effect.either(executeServer);
    if (Either.isRight(firstAttempt)) {
      return firstAttempt.right;
    }

    yield* onServerRuntimeError({
      attempt: 1,
      error: firstAttempt.left,
    });

    const secondAttempt = yield* Effect.either(executeServer);
    if (Either.isRight(secondAttempt)) {
      return secondAttempt.right;
    }

    yield* onServerRuntimeError({
      attempt: 2,
      error: secondAttempt.left,
    });

    return yield* Effect.fail(secondAttempt.left);
  });

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
      catch: toFhirOracleRuntimeError,
      try: () =>
        withRequestTimeout(`${server.baseUrl}/validateResource`, {
          body: xml,
          headers: {
            Accept: "application/fhir+json",
            "Content-Type": "application/fhir+xml",
          },
          method: "POST",
        }),
    });
    const body = yield* Effect.tryPromise({
      catch: toFhirOracleRuntimeError,
      try: () => response.text(),
    });
    const payload = yield* Schema.decodeUnknown(
      Schema.parseJson(OperationOutcomePayloadFields),
    )(body).pipe(
      Effect.map((parsed) => (body.trim().length === 0 ? undefined : parsed)),
      Effect.catchAll(() =>
        Effect.as(
          Effect.void,
          undefined as OperationOutcomePayload | undefined,
        ),
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

const runExecutableFhirOracleCliEffect = Effect.fn(
  "oracles.runExecutableFhirOracleCli",
)(function* ({
  cacheDir,
  family,
  xml,
}: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xml: string;
}) {
  const effectiveCacheDir = cacheDir ?? process.env.KBV_UPDATE_CACHE_DIR;
  const resolvedCacheDir =
    effectiveCacheDir ?? path.join(process.cwd(), ".cache", "kbv-oracles");
  const runtimeKey = getFhirRuntimeKey("exec-server", family);
  const program = Effect.scoped(
    Effect.gen(function* () {
      const userHomeOverride = yield* ensureFhirValidatorRuntimeHome({
        cacheDir: resolvedCacheDir,
        runtimeKey,
      });
      const tempDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "kbv-fhir-oracle-",
      });
      const xmlPath = path.join(tempDir, `${family}.xml`);
      const supportDir = path.join(tempDir, "support");

      const assetsStart = Date.now();
      logDebug(`starting ensureFhirValidatorAssets(${family})`);
      const assets = yield* ensureFhirValidatorAssets({
        family,
        ...(cacheDir ? { cacheDir } : {}),
      });
      logTiming(`ensureFhirValidatorAssets(${family})`, assetsStart);

      const dependencyStart = Date.now();
      logDebug(`starting ensureFhirValidatorDependencyCache(${family})`);
      yield* ensureFhirValidatorDependencyCache({
        ...(effectiveCacheDir ? { cacheDir: effectiveCacheDir } : {}),
      });
      logTiming(
        `ensureFhirValidatorDependencyCache(${family})`,
        dependencyStart,
      );

      const writeStart = Date.now();
      logDebug(`starting writeInputXml(${family})`);
      yield* fileSystem.makeDirectory(userHomeOverride, { recursive: true });
      yield* fileSystem.writeFileString(xmlPath, xml);
      const offlineLanguageCodes = extractOfflineLanguageCodes(xml);
      yield* writeOfflineLanguageSupportResourcesEffect({
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
      const javaCommand = yield* resolveJavaCommand();
      const { exitCode, stderr, stdout } = yield* runValidatorCommandEffect({
        args: [
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
        command: javaCommand,
        timeoutMs: validatorCliTimeoutMs,
      });
      logTiming(`validatorCli(${family})`, execStart);

      const combined = `${stdout}\n${stderr}`;
      const findings = parseFhirValidatorFindings(combined);
      const passed =
        exitCode === 0 &&
        findings.every((finding) => finding.severity !== "error");

      return {
        family,
        findings,
        passed,
        summary: passed
          ? `${family} executable validator completed without error findings.`
          : `${family} executable validator reported errors.`,
      } satisfies OracleExecutionResult;
    }),
  );

  return yield* program.pipe(
    Effect.catchAll((error) => {
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

export const runExecutableFhirOracleWithServerEffect = Effect.fn(
  "oracles.runExecutableFhirOracleWithServer",
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
  const runtimeKey = getFhirRuntimeKey("exec-server", family);
  const cacheKey = `${resolvedCacheDir}:${runtimeKey}`;

  const serverProgram = Effect.gen(function* () {
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
  });

  return yield* runExecutableFhirOracleWithServerRecoveryEffect({
    executeServer: serverProgram,
    onServerRuntimeError: () =>
      invalidateValidatorServerCacheEffect({
        cacheKey,
      }),
  });
});

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

  return yield* runExecutableFhirOracleCliEffect({
    cacheDir,
    family,
    xml,
  });
});

export const runExecutableFhirOracle = (args: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xml?: string;
}): Promise<OracleExecutionResult> =>
  Effect.runPromise(runExecutableFhirOracleEffect(args));

export const runExecutableFhirOracleWithServer = (args: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xml?: string;
}): Promise<OracleExecutionResult> =>
  Effect.runPromise(runExecutableFhirOracleWithServerEffect(args));

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
  const program = Effect.scoped(
    Effect.gen(function* () {
      const userHomeOverride = yield* ensureFhirValidatorRuntimeHome({
        cacheDir: resolvedCacheDir,
        runtimeKey,
      });
      const tempDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "kbv-fhir-batch-oracle-",
      });
      const supportDir = path.join(tempDir, "support");

      const assets = yield* ensureFhirValidatorAssets({
        family,
        ...(cacheDir ? { cacheDir } : {}),
      });
      yield* ensureFhirValidatorDependencyCache({
        ...(effectiveCacheDir ? { cacheDir: effectiveCacheDir } : {}),
      });

      const xmlDocuments = yield* Effect.forEach(xmlPaths, (xmlPath) =>
        fileSystem.readFileString(xmlPath),
      );
      const offlineLanguageCodes = [
        ...new Set(
          xmlDocuments.flatMap((xml) => extractOfflineLanguageCodes(xml)),
        ),
      ].sort();

      yield* fileSystem.makeDirectory(userHomeOverride, { recursive: true });
      yield* writeOfflineLanguageSupportResourcesEffect({
        codes: offlineLanguageCodes,
        supportDir,
      });

      const mountedIgPaths =
        offlineLanguageCodes.length > 0
          ? [supportDir, ...assets.igPaths]
          : assets.igPaths;
      const igArgs = mountedIgPaths.flatMap((igPath) => ["-ig", igPath]);

      const javaCommand = yield* resolveJavaCommand();
      const { exitCode, stderr, stdout } = yield* runValidatorCommandEffect({
        args: [
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
        command: javaCommand,
        timeoutMs: validatorBatchCliTimeoutMs,
      });

      const summaries = alignBatchValidationSummarySourcePaths({
        summaries: parseBatchValidationSections(stdout),
        xmlPaths,
      });

      return {
        passed:
          exitCode === 0 &&
          summaries.length === xmlPaths.length &&
          summaries.every((summary) => summary.passed),
        stderr,
        stdout,
        summaries,
      } satisfies ExecutableFhirBatchValidationResult;
    }),
  );

  return yield* program.pipe(
    Effect.catchAll((error) => {
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

      return Effect.succeed<ExecutableFhirBatchValidationResult>({
        passed: false,
        stderr,
        stdout,
        summaries: alignBatchValidationSummarySourcePaths({
          summaries: parseBatchValidationSections(stdout),
          xmlPaths,
        }),
      });
    }),
  );
});

export const runExecutableFhirValidationBatch = (args: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
  xmlPaths: readonly string[];
}): Promise<ExecutableFhirBatchValidationResult> =>
  Effect.runPromise(runExecutableFhirValidationBatchEffect(args));
