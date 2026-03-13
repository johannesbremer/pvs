import { Effect } from "effect";

import type { OracleExecutionResult } from "../types";

import {
  cloneAssetWorkspace,
  ensureKvdtAssets,
  findFileRecursive,
} from "../assets";
import { fileSystem, path, runCommand } from "../platform";
import { resolveJavaCommand } from "../system";

const KVDT_HEADLESS_CLASS = "de.kbv.xpm.modul.kvdt.praxis.start.StartKonsole";
const KVDT_CLASSPATH =
  "Bin/jasperreports-fonts-6.12.2.jar:Bin/xpm-kvdt-praxis-2026.2.1.jar:Bin/xpm-core-4.2.39.jar";
const XKM_CLASSPATH =
  "Bin/jasperreports-fonts-6.12.2.jar:Bin/bcprov-jdk18on-1.81.jar:Bin/xkm-1.44.0.jar";
// The alternate "konfigAusgaben.xml" routes the error list to a physical printer.
// Use the default config so local runs and act stay fully file-based.
const KVDT_CONFIG_PATH = "Konfig/konfig.xml";

const parseLogFindings = (output: string) => {
  const findings: OracleExecutionResult["findings"][number][] = [];

  if (/Status:\s*Ok/i.test(output)) {
    findings.push({
      code: "KVDT_VALIDATION_OK",
      message: "KVDT XPM reported status Ok.",
      severity: "info",
    });
  }

  if (/Status:\s*Fehlerhaft/i.test(output)) {
    findings.push({
      code: "KVDT_VALIDATION_FAILED",
      message: "KVDT XPM reported status Fehlerhaft.",
      severity: "error",
    });
  }

  if (/Fehlercode:\s*(\d+)/i.test(output)) {
    findings.push({
      code: "KVDT_TOOL_ERROR",
      message: output.trim().slice(0, 500),
      severity: "error",
    });
  }

  if (/Abort trap|Exception|ERROR\s+\|/i.test(output)) {
    findings.push({
      code: "KVDT_TOOL_RUNTIME_ERROR",
      message: output.trim().slice(0, 500),
      severity: "error",
    });
  }

  return findings;
};

const listWorkspaceFilesEffect = Effect.fn("oracles.listWorkspaceFiles")(
  function* (directory: string) {
    const entries = yield* fileSystem.readDirectory(directory);
    const files = [];

    for (const entry of entries) {
      const entryPath = path.join(directory, entry);
      const entryInfo = yield* fileSystem.stat(entryPath);

      if (entryInfo.type === "File") {
        files.push(entryPath);
      }
    }

    return files;
  },
);

const resetWorkspaceDirectoryEffect = Effect.fn(
  "oracles.resetWorkspaceDirectory",
)(function* (directory: string) {
  yield* fileSystem.remove(directory, { force: true, recursive: true });
  yield* fileSystem.makeDirectory(directory, { recursive: true });
});

export const runKvdtOracle = ({
  payloadBytes,
  payloadPreview,
}: {
  payloadBytes?: Uint8Array;
  payloadPreview?: string;
}): OracleExecutionResult => {
  const findings = [];

  const hasStringPayload =
    typeof payloadPreview === "string" && payloadPreview.trim().length > 0;
  const hasBytePayload =
    payloadBytes instanceof Uint8Array && payloadBytes.byteLength > 0;

  if (!hasStringPayload && !hasBytePayload) {
    findings.push({
      code: "KVDT_PAYLOAD_PREVIEW_MISSING",
      message: "No KVDT payload preview was provided to the oracle runner.",
      severity: "error" as const,
    });
  }

  return {
    family: "KVDT",
    findings,
    passed: findings.length === 0,
    summary:
      findings.length === 0
        ? "KVDT preview satisfied the local oracle checks."
        : "KVDT preview failed the local oracle checks.",
  };
};

export const runExecutableKvdtOracleEffect = Effect.fn(
  "oracles.runExecutableKvdtOracle",
)(function* ({
  cacheDir,
  payloadBytes,
  payloadFileName,
  payloadPreview,
}: {
  cacheDir?: string;
  payloadBytes?: Uint8Array;
  payloadFileName?: string;
  payloadPreview?: string;
}) {
  const localResult = runKvdtOracle({ payloadBytes, payloadPreview });
  if (!localResult.passed) {
    return localResult;
  }
  const validatedPayloadBytes =
    payloadBytes instanceof Uint8Array
      ? payloadBytes
      : Buffer.from(payloadPreview!, "utf8");
  const effectiveFileName =
    payloadFileName && payloadFileName.trim().length > 0
      ? path.basename(payloadFileName)
      : "input.con";

  const program = Effect.scoped(
    Effect.gen(function* () {
      const tempRoot = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "kbv-kvdt-oracle-",
      });
      const assets = yield* Effect.tryPromise(() =>
        ensureKvdtAssets({
          ...(cacheDir ? { cacheDir } : {}),
        }),
      );
      const javaCommand = yield* Effect.tryPromise(() => resolveJavaCommand());
      const javaDir = path.dirname(javaCommand);

      const xpmWorkspace = yield* Effect.tryPromise(() =>
        cloneAssetWorkspace({
          sourceDir: path.join(assets.xpmDir, "XPM_KVDT.Praxis"),
          targetDir: path.join(tempRoot, "XPM_KVDT.Praxis"),
        }),
      );
      const xkmWorkspace = yield* Effect.tryPromise(() =>
        cloneAssetWorkspace({
          sourceDir: path.join(assets.xkmDir, "XKM"),
          targetDir: path.join(tempRoot, "XKM"),
        }),
      );

      yield* resetWorkspaceDirectoryEffect(path.join(xpmWorkspace, "Listen"));
      yield* resetWorkspaceDirectoryEffect(path.join(xpmWorkspace, "Temp"));
      yield* resetWorkspaceDirectoryEffect(path.join(xkmWorkspace, "Quelle"));
      yield* resetWorkspaceDirectoryEffect(
        path.join(xkmWorkspace, "Verschluesselt"),
      );
      yield* resetWorkspaceDirectoryEffect(
        path.join(xkmWorkspace, "Bearbeitet"),
      );

      const kvdtInputRelativePath = path.join("Daten", effectiveFileName);
      const kvdtInputPath = path.join(xpmWorkspace, kvdtInputRelativePath);
      yield* fileSystem.writeFile(kvdtInputPath, validatedPayloadBytes);

      const xpmLogPath = path.join(xpmWorkspace, "Listen", "XPM_Logfile.log");
      const xpmRun = yield* Effect.tryPromise(() =>
        runCommand({
          args: [
            "-Xmx500m",
            "-Djava.awt.headless=true",
            "-Dfile.encoding=UTF8",
            "-DXPM_QUARTAL_VERSION=2026.2.1",
            "-classpath",
            KVDT_CLASSPATH,
            KVDT_HEADLESS_CLASS,
            "-c",
            KVDT_CONFIG_PATH,
            "-f",
            kvdtInputRelativePath,
          ],
          command: javaCommand,
          cwd: xpmWorkspace,
          env: {
            ...process.env,
            JAVA_BIN: javaCommand,
            PATH: `${javaDir}:${process.env.PATH ?? ""}`,
          },
        }),
      );
      const xpmLog = yield* fileSystem
        .readFileString(xpmLogPath)
        .pipe(Effect.catchAll(() => Effect.succeed("")));
      const xpmExecOutput = `${xpmRun.stdout}\n${xpmRun.stderr}`;
      const xpmOutput = `${xpmExecOutput}\n${xpmLog}`;
      const xpmFindings = parseLogFindings(xpmOutput);
      const xpmArtifacts = yield* listWorkspaceFilesEffect(
        path.join(xpmWorkspace, "Listen"),
      ).pipe(Effect.catchAll(() => Effect.succeed([])));

      if (xpmRun.exitCode !== 0) {
        const findings = [
          ...xpmFindings,
          {
            code: "KVDT_XPM_ARTIFACT_COUNT",
            message: `KVDT XPM produced ${xpmArtifacts.length} file(s) in Listen/: ${xpmArtifacts.map((artifactPath) => path.basename(artifactPath)).join(", ") || "(none)"}.`,
            severity: "info" as const,
          },
        ];

        return {
          family: "KVDT",
          findings:
            findings.length > 0
              ? findings
              : [
                  {
                    code: "KVDT_EXECUTION_FAILED",
                    message: xpmOutput.trim().slice(0, 4000),
                    severity: "error",
                  },
                ],
          passed: false,
          summary: "KVDT executable validation reported XPM errors.",
        } satisfies OracleExecutionResult;
      }

      const publicKeyPath = yield* Effect.tryPromise(() =>
        findFileRecursive(assets.xkmPublicKeysDir, (entryPath) =>
          entryPath.endsWith("Oeffentlich_KV_V10.pub"),
        ),
      );
      if (!publicKeyPath) {
        return {
          family: "KVDT",
          findings: [
            {
              code: "KVDT_PUBLIC_KEY_MISSING",
              message:
                "Oeffentlich_KV_V10.pub was not found in the downloaded KBV key archive.",
              severity: "error",
            },
          ],
          passed: false,
          summary:
            "KVDT packaging could not start because the KBV public key was missing.",
        } satisfies OracleExecutionResult;
      }

      yield* fileSystem.copy(
        publicKeyPath,
        path.join(xkmWorkspace, "System", "keys", path.basename(publicKeyPath)),
      );
      const sourcePayloadPath = path.join(
        xkmWorkspace,
        "Quelle",
        effectiveFileName,
      );
      yield* fileSystem.writeFile(sourcePayloadPath, validatedPayloadBytes);

      const xkmRun = yield* Effect.tryPromise(() =>
        runCommand({
          args: [
            "-Xmx300m",
            "-Dfile.encoding=8859_1",
            "-Dlog4j.configurationFile=Bin/log4j2.xml",
            "-Djava.awt.headless=true",
            "-classpath",
            XKM_CLASSPATH,
            "de.kbv.xkm.Main",
            "-c",
            "Konfig/config.xml",
            "-s",
            "-e",
          ],
          command: javaCommand,
          cwd: xkmWorkspace,
          env: {
            ...process.env,
            JAVA_BIN: javaCommand,
            PATH: `${javaDir}:${process.env.PATH ?? ""}`,
          },
        }),
      );

      const xkmOutput = `${xkmRun.stdout}\n${xkmRun.stderr}`;
      const xkmFindings = parseLogFindings(xkmOutput);
      const encryptedArtifacts = yield* listWorkspaceFilesEffect(
        path.join(xkmWorkspace, "Verschluesselt"),
      );

      const findings = [
        ...xpmFindings,
        ...xkmFindings,
        {
          code: "KVDT_PRUEFASSISTENT_INSTALLER_READY",
          message: `KBV-Pruefassistent installer is cached at ${assets.pruefassistentJar}.`,
          severity: "info" as const,
        },
        {
          code: "KVDT_XPM_ARTIFACT_COUNT",
          message: `KVDT XPM produced ${xpmArtifacts.length} file(s) in Listen/: ${xpmArtifacts.map((artifactPath) => path.basename(artifactPath)).join(", ") || "(none)"}.`,
          severity: "info" as const,
        },
        {
          code: "KVDT_XKM_ARTIFACT_COUNT",
          message: `XKM produced ${encryptedArtifacts.length} file(s) in Verschluesselt/: ${encryptedArtifacts.map((artifactPath) => path.basename(artifactPath)).join(", ") || "(none)"}.`,
          severity: "info" as const,
        },
      ];

      if (!encryptedArtifacts.some((path) => path.endsWith(".XKM"))) {
        findings.push({
          code: "KVDT_XKM_OUTPUT_MISSING",
          message: "XKM did not produce an encrypted .XKM output artifact.",
          severity: "error",
        });
      }

      if (
        xkmRun.exitCode !== 0 &&
        !findings.some((finding) => finding.severity === "error")
      ) {
        findings.push({
          code: "KVDT_EXECUTION_FAILED",
          message: xkmOutput.trim().slice(0, 4000),
          severity: "error",
        });
      }

      const passed = findings.every((finding) => finding.severity !== "error");

      return {
        family: "KVDT",
        findings,
        passed,
        summary: passed
          ? `KVDT validation and XKM packaging completed. Produced ${xpmArtifacts.length} validator outputs and ${encryptedArtifacts.length} encrypted output(s).`
          : "KVDT executable validation or packaging reported errors.",
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
          ? `${String(error.stdout)}\n${String(error.stderr)}`
          : error instanceof Error
            ? error.message
            : String(error);

      const findings = parseLogFindings(errorOutput);

      return Effect.succeed({
        family: "KVDT",
        findings:
          findings.length > 0
            ? findings
            : [
                {
                  code: "KVDT_EXECUTION_FAILED",
                  message: errorOutput.slice(0, 4000),
                  severity: "error",
                },
              ],
        passed: false,
        summary: "KVDT executable-backed validation failed.",
      } satisfies OracleExecutionResult);
    }),
  );
});

export const runExecutableKvdtOracle = (args: {
  cacheDir?: string;
  payloadBytes?: Uint8Array;
  payloadFileName?: string;
  payloadPreview?: string;
}): Promise<OracleExecutionResult> =>
  Effect.runPromise(runExecutableKvdtOracleEffect(args));
