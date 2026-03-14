import { Effect } from "effect";
import { fileURLToPath } from "node:url";

import type { OracleExecutionResult } from "../types";

import { ensureBmpAssets } from "../assets";
import { fileSystem, path, runCommand } from "../platform";
import { resolveJavacCommand, resolveJavaCommand } from "../system";

const bmpValidatorSourcePath = fileURLToPath(
  new URL("../java/BmpSchemaValidator.java", import.meta.url),
);

const ensureBmpJavaValidatorEffect = Effect.fn(
  "oracles.ensureBmpJavaValidator",
)(function* (cacheDir?: string) {
  const resolvedCacheDir = path.resolve(cacheDir ?? process.cwd());
  const buildDir = path.join(resolvedCacheDir, "java-tools", "bmp");
  const classFile = path.join(buildDir, "BmpSchemaValidator.class");

  if (yield* fileSystem.exists(classFile)) {
    return {
      buildDir,
      className: "BmpSchemaValidator",
    };
  }

  yield* fileSystem.makeDirectory(buildDir, { recursive: true });

  const javacCommand = yield* resolveJavacCommand();
  const javacResult = yield* Effect.tryPromise(() =>
    runCommand({
      args: ["-d", buildDir, bmpValidatorSourcePath],
      command: javacCommand,
      cwd: path.dirname(bmpValidatorSourcePath),
    }),
  );
  if (javacResult.exitCode !== 0) {
    throw new Error(
      `Failed to compile BMP validator: ${(javacResult.stderr || javacResult.stdout).trim()}`,
    );
  }

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
      const assets = yield* ensureBmpAssets({
        ...(cacheDir ? { cacheDir } : {}),
      });
      const validator = yield* ensureBmpJavaValidatorEffect(cacheDir);
      const tempDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "kbv-bmp-oracle-",
      });
      const xmlPath = path.join(tempDir, "payload.xml");

      yield* fileSystem.writeFile(xmlPath, validatedXmlBytes);

      const javaCommand = yield* resolveJavaCommand();
      const result = yield* Effect.tryPromise(() =>
        runCommand({
          args: [
            "-cp",
            validator.buildDir,
            validator.className,
            assets.bmpXsd,
            xmlPath,
          ],
          command: javaCommand,
        }),
      );

      if (result.exitCode !== 0) {
        const errorOutput = `${result.stdout}\n${result.stderr}`;
        const findings = parseBmpFindings(errorOutput);
        return {
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
        } satisfies OracleExecutionResult;
      }

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
