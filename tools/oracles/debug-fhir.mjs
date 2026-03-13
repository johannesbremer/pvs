import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const [family, xmlPathArg] = process.argv.slice(2);

if (!family || !xmlPathArg || !["eAU", "eRezept"].includes(family)) {
  console.error(
    "Usage: node tools/oracles/debug-fhir.mjs <eAU|eRezept> <xmlPath>",
  );
  process.exit(1);
}

const cwd = process.cwd();
const cacheDir = join(cwd, ".cache", "kbv-oracles");
const xmlPath = resolve(cwd, xmlPathArg);
const effectiveFamily = family;
const sharedPackageCacheRoot = join(cacheDir, "fhir-home", ".fhir", "packages");

const log = (message) => {
  console.error(`[kbv-oracle] ${message}`);
};

const ensureRuntimeHome = async () => {
  const runtimeHomeRoot = join(
    cacheDir,
    "fhir-home-runtimes",
    `debug-${process.ppid}-${effectiveFamily}`,
  );
  const runtimePackageCacheRoot = join(runtimeHomeRoot, ".fhir", "packages");
  const markerPath = join(runtimeHomeRoot, ".kbv-runtime-ready");

  if (existsSync(markerPath)) {
    return runtimeHomeRoot;
  }

  if (!existsSync(sharedPackageCacheRoot)) {
    throw new Error(
      `Shared FHIR package cache is missing at ${sharedPackageCacheRoot}.`,
    );
  }

  await fs.rm(runtimeHomeRoot, { recursive: true, force: true });
  await fs.mkdir(join(runtimeHomeRoot, ".fhir"), { recursive: true });
  await fs.cp(sharedPackageCacheRoot, runtimePackageCacheRoot, {
    force: true,
    recursive: true,
  });
  await fs.writeFile(
    markerPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        runtimePackageCacheRoot,
        sharedPackageCacheRoot,
      },
      null,
      2,
    ),
    "utf8",
  );

  return runtimeHomeRoot;
};

const extractOfflineLanguageCodes = (xml) => {
  const matches = xml.matchAll(
    /<extension\s+url="language">\s*<valueCode\s+value="([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)"\s*\/>\s*<\/extension>/g,
  );
  return [...new Set([...matches].map((match) => match[1]))].sort();
};

const buildOfflineLanguageCodeSystem = (codes) => ({
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

const buildOfflineAllLanguagesValueSet = (codes) => ({
  resourceType: "ValueSet",
  id: "all-languages",
  url: "http://hl7.org/fhir/ValueSet/all-languages",
  version: "4.0.1",
  name: "AllLanguages",
  title: "All Languages",
  status: "active",
  experimental: true,
  description:
    "Minimal offline ValueSet generated at validation time so validator_cli can validate GeneratedDosageInstructionsMeta.language without a terminology server.",
  compose: {
    include: [
      {
        system: "urn:ietf:bcp:47",
        concept: codes.map((code) => ({
          code,
          display: code,
        })),
      },
    ],
  },
  expansion: {
    identifier: "urn:uuid:kbv-offline-all-languages",
    timestamp: "2026-03-11T00:00:00Z",
    total: codes.length,
    offset: 0,
    contains: codes.map((code) => ({
      system: "urn:ietf:bcp:47",
      code,
      display: code,
    })),
  },
});

const resolveJavaCommand = () => {
  const candidates = [
    process.env.JAVA_BIN,
    "/opt/homebrew/opt/openjdk/bin/java",
    "java",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "java" || existsSync(candidate)) {
      return candidate;
    }
  }

  return "java";
};

const findFileRecursive = async (rootDir, matcher) => {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileRecursive(entryPath, matcher);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (matcher(entryPath)) {
      return entryPath;
    }
  }

  return undefined;
};

const collectIgDirectories = async (rootDir) => {
  const directories = new Set();

  const visit = async (currentDir) => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    let hasResourceLikeFiles = false;

    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (
        entry.name.endsWith(".xml") ||
        entry.name.endsWith(".json") ||
        entry.name.endsWith(".map")
      ) {
        hasResourceLikeFiles = true;
      }
    }

    if (hasResourceLikeFiles) {
      directories.add(currentDir);
    }
  };

  await visit(rootDir);

  return [...directories].sort((left, right) => {
    const leftBase = left.split("/").at(-1) ?? left;
    const rightBase = right.split("/").at(-1) ?? right;
    const leftPriority = leftBase.startsWith("_") ? 0 : 1;
    const rightPriority = rightBase.startsWith("_") ? 0 : 1;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const depthDelta = left.split("/").length - right.split("/").length;
    if (depthDelta !== 0) {
      return depthDelta;
    }

    return left.localeCompare(right);
  });
};

const serviceDir = join(cacheDir, "extracted", "fhirValidatorService_2_2_0");
const packageRoot = join(
  cacheDir,
  "extracted",
  effectiveFamily === "eAU" ? "kbvFhirEau_1_2_1" : "kbvFhirErp_1_4_1",
);

const start = Date.now();
log(`debug start family=${effectiveFamily} xml=${xmlPath}`);

log(`starting validator jar discovery`);
const jarStart = Date.now();
const validatorJar = await findFileRecursive(
  serviceDir,
  (entryPath) =>
    entryPath.includes("validator_cli") && entryPath.endsWith(".jar"),
);
if (!validatorJar) {
  throw new Error("validator_cli jar not found");
}
log(`validator jar discovery: ${Date.now() - jarStart}ms`);
log(`validatorJar=${validatorJar}`);

log(`starting IG discovery`);
const igStart = Date.now();
const igPaths = (await collectIgDirectories(packageRoot)).filter(
  (entryPath) => entryPath !== packageRoot,
);
igPaths.push(packageRoot);
log(`IG discovery: ${Date.now() - igStart}ms`);
log(`igPaths=${igPaths.length}`);

log(`starting input read`);
const readStart = Date.now();
const xml = await fs.readFile(xmlPath, "utf8");
log(`input read: ${Date.now() - readStart}ms`);
const offlineLanguageCodes = extractOfflineLanguageCodes(xml);

log(`starting temp workspace`);
const tmpStart = Date.now();
const tempDir = await fs.mkdtemp(join(tmpdir(), "kbv-fhir-debug-"));
const tempXmlPath = join(tempDir, `${effectiveFamily}.xml`);
const supportDir = join(tempDir, "support");
const userHomeOverride = await ensureRuntimeHome();
await fs.mkdir(userHomeOverride, { recursive: true });
await fs.writeFile(tempXmlPath, xml, "utf8");
if (offlineLanguageCodes.length > 0) {
  await fs.mkdir(supportDir, { recursive: true });
  await fs.writeFile(
    join(supportDir, "CodeSystem-kbv-offline-ietf-bcp-47.json"),
    JSON.stringify(
      buildOfflineLanguageCodeSystem(offlineLanguageCodes),
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    join(supportDir, "ValueSet-all-languages.json"),
    JSON.stringify(
      buildOfflineAllLanguagesValueSet(offlineLanguageCodes),
      null,
      2,
    ),
    "utf8",
  );
}
log(`temp workspace: ${Date.now() - tmpStart}ms`);

try {
  const mountedIgPaths =
    offlineLanguageCodes.length > 0 ? [supportDir, ...igPaths] : igPaths;
  const igArgs = mountedIgPaths.flatMap((igPath) => ["-ig", igPath]);
  log(`starting validator cli`);
  const cliStart = Date.now();
  const { stdout, stderr } = await execFileAsync(
    resolveJavaCommand(),
    [
      `-Duser.home=${userHomeOverride}`,
      "-jar",
      validatorJar,
      "-version",
      "4.0.1",
      tempXmlPath,
      ...igArgs,
      "-tx",
      "n/a",
    ],
    {
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  log(`validator cli: ${Date.now() - cliStart}ms`);
  log(`debug done total=${Date.now() - start}ms`);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
} catch (error) {
  log(`debug failed total=${Date.now() - start}ms`);
  if (error && typeof error === "object") {
    if ("stdout" in error && typeof error.stdout === "string") {
      process.stdout.write(error.stdout);
    }
    if ("stderr" in error && typeof error.stderr === "string") {
      process.stderr.write(error.stderr);
    }
  }
  throw error;
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
