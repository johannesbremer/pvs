import type { OracleExecutionResult } from "../types";
import { cloneAssetWorkspace, ensureKvdtAssets, findFileRecursive } from "../assets";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveJavaCommand } from "../system";

const execFileAsync = promisify(execFile);

const KVDT_HEADLESS_CLASS =
  "de.kbv.xpm.modul.kvdt.praxis.start.StartKonsole";
const KVDT_CLASSPATH =
  "Bin/jasperreports-fonts-6.12.2.jar:Bin/xpm-kvdt-praxis-2026.2.1.jar:Bin/xpm-core-4.2.39.jar";
const XKM_CLASSPATH =
  "Bin/jasperreports-fonts-6.12.2.jar:Bin/bcprov-jdk18on-1.81.jar:Bin/xkm-1.44.0.jar";
const KVDT_CONFIG_PATH = "Konfig/konfigAusgaben.xml";

const parseLogFindings = (output: string) => {
  const findings: Array<OracleExecutionResult["findings"][number]> = [];

  if (/Status:\s*Ok/i.test(output)) {
    findings.push({
      code: "KVDT_VALIDATION_OK",
      severity: "info",
      message: "KVDT XPM reported status Ok.",
    });
  }

  if (/Status:\s*Fehlerhaft/i.test(output)) {
    findings.push({
      code: "KVDT_VALIDATION_FAILED",
      severity: "error",
      message: "KVDT XPM reported status Fehlerhaft.",
    });
  }

  if (/Fehlercode:\s*([0-9]+)/i.test(output)) {
    findings.push({
      code: "KVDT_TOOL_ERROR",
      severity: "error",
      message: output.trim().slice(0, 500),
    });
  }

  if (/Abort trap|Exception|ERROR\s+\|/i.test(output)) {
    findings.push({
      code: "KVDT_TOOL_RUNTIME_ERROR",
      severity: "error",
      message: output.trim().slice(0, 500),
    });
  }

  return findings;
};

const listWorkspaceFiles = async (directory: string) => {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(directory, entry.name));
};

const resetWorkspaceDirectory = async (directory: string) => {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
};

export const runKvdtOracle = ({
  payloadPreview,
  payloadBytes,
}: {
  payloadPreview?: string;
  payloadBytes?: Uint8Array;
}): OracleExecutionResult => {
  const findings = [];

  const hasStringPayload =
    typeof payloadPreview === "string" && payloadPreview.trim().length > 0;
  const hasBytePayload =
    payloadBytes instanceof Uint8Array && payloadBytes.byteLength > 0;

  if (!hasStringPayload && !hasBytePayload) {
    findings.push({
      code: "KVDT_PAYLOAD_PREVIEW_MISSING",
      severity: "error" as const,
      message: "No KVDT payload preview was provided to the oracle runner.",
    });
  }

  return {
    family: "KVDT",
    passed: findings.length === 0,
    findings,
    summary:
      findings.length === 0
        ? "KVDT preview satisfied the local oracle checks."
        : "KVDT preview failed the local oracle checks.",
  };
};

export const runExecutableKvdtOracle = async ({
  payloadPreview,
  payloadBytes,
  payloadFileName,
  cacheDir,
}: {
  payloadPreview?: string;
  payloadBytes?: Uint8Array;
  payloadFileName?: string;
  cacheDir?: string;
}): Promise<OracleExecutionResult> => {
  const localResult = runKvdtOracle({ payloadPreview, payloadBytes });
  if (!localResult.passed) {
    return localResult;
  }
  const validatedPayloadBytes =
    payloadBytes instanceof Uint8Array
      ? payloadBytes
      : Buffer.from(payloadPreview as string, "utf8");
  const effectiveFileName =
    payloadFileName && payloadFileName.trim().length > 0
      ? basename(payloadFileName)
      : "input.con";

  const tempRoot = await mkdtemp(join(tmpdir(), "kbv-kvdt-oracle-"));

  try {
    const assets = await ensureKvdtAssets({
      ...(cacheDir ? { cacheDir } : {}),
    });
    const javaCommand = resolveJavaCommand();
    const javaDir = dirname(javaCommand);

    const xpmWorkspace = await cloneAssetWorkspace({
      sourceDir: join(assets.xpmDir, "XPM_KVDT.Praxis"),
      targetDir: join(tempRoot, "XPM_KVDT.Praxis"),
    });
    const xkmWorkspace = await cloneAssetWorkspace({
      sourceDir: join(assets.xkmDir, "XKM"),
      targetDir: join(tempRoot, "XKM"),
    });

    await resetWorkspaceDirectory(join(xpmWorkspace, "Listen"));
    await resetWorkspaceDirectory(join(xpmWorkspace, "Temp"));
    await resetWorkspaceDirectory(join(xkmWorkspace, "Quelle"));
    await resetWorkspaceDirectory(join(xkmWorkspace, "Verschluesselt"));
    await resetWorkspaceDirectory(join(xkmWorkspace, "Bearbeitet"));

    const kvdtInputRelativePath = join("Daten", effectiveFileName);
    const kvdtInputPath = join(xpmWorkspace, kvdtInputRelativePath);
    await writeFile(kvdtInputPath, validatedPayloadBytes);

    const xpmRun = await execFileAsync(
      javaCommand,
      [
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
      {
        cwd: xpmWorkspace,
        env: {
          ...process.env,
          PATH: `${javaDir}:${process.env.PATH ?? ""}`,
          JAVA_BIN: javaCommand,
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const xpmLogPath = join(xpmWorkspace, "Listen", "XPM_Logfile.log");
    const xpmLog = await readFile(xpmLogPath, "utf8").catch(() => "");
    const xpmOutput = `${xpmRun.stdout}\n${xpmRun.stderr}\n${xpmLog}`;
    const xpmFindings = parseLogFindings(xpmOutput);
    const xpmArtifacts = await listWorkspaceFiles(join(xpmWorkspace, "Listen"));

    const publicKeyPath = await findFileRecursive(
      assets.xkmPublicKeysDir,
      (entryPath) => entryPath.endsWith("Oeffentlich_KV_V10.pub"),
    );
    if (!publicKeyPath) {
      return {
        family: "KVDT",
        passed: false,
        findings: [
          {
            code: "KVDT_PUBLIC_KEY_MISSING",
            severity: "error",
            message: "Oeffentlich_KV_V10.pub was not found in the downloaded KBV key archive.",
          },
        ],
        summary: "KVDT packaging could not start because the KBV public key was missing.",
      };
    }

    await cp(publicKeyPath, join(xkmWorkspace, "System", "keys", basename(publicKeyPath)));
    const sourcePayloadPath = join(xkmWorkspace, "Quelle", effectiveFileName);
    await writeFile(sourcePayloadPath, validatedPayloadBytes);

    const xkmRun = await execFileAsync(
      javaCommand,
      [
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
      {
        cwd: xkmWorkspace,
        env: {
          ...process.env,
          PATH: `${javaDir}:${process.env.PATH ?? ""}`,
          JAVA_BIN: javaCommand,
        },
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const xkmOutput = `${xkmRun.stdout}\n${xkmRun.stderr}`;
    const xkmFindings = parseLogFindings(xkmOutput);
    const encryptedArtifacts = await listWorkspaceFiles(
      join(xkmWorkspace, "Verschluesselt"),
    );

    const findings = [
      ...xpmFindings,
      ...xkmFindings,
      {
        code: "KVDT_PRUEFASSISTENT_INSTALLER_READY",
        severity: "info" as const,
        message: `KBV-Pruefassistent installer is cached at ${assets.pruefassistentJar}.`,
      },
      {
        code: "KVDT_XPM_ARTIFACT_COUNT",
        severity: "info" as const,
        message: `KVDT XPM produced ${xpmArtifacts.length} file(s) in Listen/: ${xpmArtifacts.map((path) => basename(path)).join(", ") || "(none)"}.`,
      },
      {
        code: "KVDT_XKM_ARTIFACT_COUNT",
        severity: "info" as const,
        message: `XKM produced ${encryptedArtifacts.length} file(s) in Verschluesselt/: ${encryptedArtifacts.map((path) => basename(path)).join(", ") || "(none)"}.`,
      },
    ];

    if (!encryptedArtifacts.some((path) => path.endsWith(".XKM"))) {
      findings.push({
        code: "KVDT_XKM_OUTPUT_MISSING",
        severity: "error",
        message: "XKM did not produce an encrypted .XKM output artifact.",
      });
    }

    const passed =
      findings.every((finding) => finding.severity !== "error");

    return {
      family: "KVDT",
      passed,
      findings,
      summary: passed
        ? `KVDT validation and XKM packaging completed. Produced ${xpmArtifacts.length} validator outputs and ${encryptedArtifacts.length} encrypted output(s).`
        : "KVDT executable validation or packaging reported errors.",
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

    const findings = parseLogFindings(errorOutput);

    return {
      family: "KVDT",
      passed: false,
      findings:
        findings.length > 0
          ? findings
          : [
              {
                code: "KVDT_EXECUTION_FAILED",
                severity: "error",
                message: errorOutput.slice(0, 4000),
              },
            ],
      summary: "KVDT executable-backed validation failed.",
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
};
