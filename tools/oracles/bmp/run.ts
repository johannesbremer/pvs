import { Effect } from "effect";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { OracleExecutionResult } from "../types";

import { ensureBmpAssets } from "../assets";
import { resolveJavacCommand, resolveJavaCommand } from "../system";

const execFileAsync = promisify(execFile);
const bmpValidatorSourcePath = fileURLToPath(
  new URL("../java/BmpSchemaValidator.java", import.meta.url),
);

const ensureBmpJavaValidatorEffect = Effect.fn(
  "oracles.ensureBmpJavaValidator",
)(function* (cacheDir?: string) {
  const resolvedCacheDir = resolve(cacheDir ?? process.cwd());
  const buildDir = join(resolvedCacheDir, "java-tools", "bmp");
  const classFile = join(buildDir, "BmpSchemaValidator.class");

  if (existsSync(classFile)) {
    return {
      buildDir,
      className: "BmpSchemaValidator",
    };
  }

  yield* Effect.tryPromise(() => mkdir(buildDir, { recursive: true }));
  yield* Effect.tryPromise(() =>
    execFileAsync(
      resolveJavacCommand(),
      ["-d", buildDir, bmpValidatorSourcePath],
      {
        cwd: dirname(bmpValidatorSourcePath),
        maxBuffer: 5 * 1024 * 1024,
      },
    ),
  );

  return {
    buildDir,
    className: "BmpSchemaValidator",
  };
});

const parseBmpFindings = (output: string) => {
  const findings: OracleExecutionResult["findings"][number][] = [];
  const trimmedOutput = output.trim();

  if (trimmedOutput.length === 0) {
    return findings;
  }

  if (/validates/i.test(trimmedOutput)) {
    findings.push({
      code: "BMP_XSD_VALID",
      message: trimmedOutput.slice(0, 500),
      severity: "info",
    });
  }

  if (/error|fails to validate|Schemas parser error/i.test(trimmedOutput)) {
    findings.push({
      code: "BMP_XSD_ERROR",
      message: trimmedOutput.slice(0, 500),
      severity: "error",
    });
  }

  return findings;
};

export const runBmpOracle = ({
  xml,
  xmlBytes,
}: {
  xml?: string;
  xmlBytes?: Uint8Array;
}): OracleExecutionResult => {
  const findings = [];
  const hasStringXml = typeof xml === "string" && xml.includes("<?xml");
  const hasByteXml = xmlBytes instanceof Uint8Array && xmlBytes.byteLength > 0;

  if (!hasStringXml && !hasByteXml) {
    findings.push({
      code: "BMP_XML_MISSING",
      message: "BMP XML input is missing or malformed.",
      severity: "error" as const,
    });
  }

  return {
    family: "BMP",
    findings,
    passed: findings.length === 0,
    summary:
      findings.length === 0
        ? "BMP XML satisfied the local oracle checks."
        : "BMP XML failed the local oracle checks.",
  };
};

export const runExecutableBmpOracleEffect = Effect.fn(
  "oracles.runExecutableBmpOracle",
)(function* ({
  cacheDir,
  xml,
  xmlBytes,
}: {
  cacheDir?: string;
  xml?: string;
  xmlBytes?: Uint8Array;
}) {
  const localResult = runBmpOracle({ xml, xmlBytes });
  if (!localResult.passed) {
    return localResult;
  }
  const validatedXmlBytes =
    xmlBytes instanceof Uint8Array ? xmlBytes : Buffer.from(xml!, "utf8");

  const program = Effect.scoped(
    Effect.gen(function* () {
      const assets = yield* Effect.tryPromise(() =>
        ensureBmpAssets({
          ...(cacheDir ? { cacheDir } : {}),
        }),
      );
      const validator = yield* ensureBmpJavaValidatorEffect(cacheDir);
      const tempDir = yield* Effect.acquireRelease(
        Effect.tryPromise(() => mkdtemp(join(tmpdir(), "kbv-bmp-oracle-"))),
        (tempDir) =>
          Effect.tryPromise(() =>
            rm(tempDir, { force: true, recursive: true }),
          ).pipe(Effect.orDie),
      );
      const xmlPath = join(tempDir, "payload.xml");

      yield* Effect.tryPromise(() => writeFile(xmlPath, validatedXmlBytes));
      yield* Effect.tryPromise(() =>
        execFileAsync(
          resolveJavaCommand(),
          [
            "-cp",
            validator.buildDir,
            validator.className,
            assets.bmpXsd,
            xmlPath,
          ],
          {
            maxBuffer: 5 * 1024 * 1024,
          },
        ),
      );

      return {
        family: "BMP",
        findings: [],
        passed: true,
        summary: `BMP XML validated successfully against ${assets.bmpXsd}.`,
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
      const findings = parseBmpFindings(errorOutput);
      return Effect.succeed({
        family: "BMP",
        findings:
          findings.length > 0
            ? findings
            : [
                {
                  code: "BMP_EXECUTION_FAILED",
                  message: errorOutput.slice(0, 500),
                  severity: "error",
                },
              ],
        passed: false,
        summary: "BMP executable validation failed.",
      } satisfies OracleExecutionResult);
    }),
  );
});

export const runExecutableBmpOracle = (args: {
  cacheDir?: string;
  xml?: string;
  xmlBytes?: Uint8Array;
}): Promise<OracleExecutionResult> =>
  Effect.runPromise(runExecutableBmpOracleEffect(args));
