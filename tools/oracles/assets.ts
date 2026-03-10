import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface KbvOracleAsset {
  readonly assetId: string;
  readonly url: string;
  readonly fileName: string;
  readonly sha256?: string;
  readonly extract?: boolean;
}

export interface KbvOracleAssetCacheEntry {
  readonly assetId: string;
  readonly url: string;
  readonly fileName: string;
  readonly downloadPath: string;
  readonly sha256?: string;
  readonly downloadedAt: string;
  readonly extractedPath?: string;
}

export interface ExternalFhirPackage {
  readonly packageId: string;
  readonly version: string;
  readonly url?: string;
  readonly sha256?: string;
}

export const kbvOracleAssets = {
  fhirValidatorService_2_2_0: {
    assetId: "fhirValidatorService_2_2_0",
    url: "https://update.kbv.de/ita-update/371-Schnittstellen/Verordnungssoftware-Schnittstelle/Service_zur_Validierung_2.2.0.zip",
    fileName: "Service_zur_Validierung_2.2.0.zip",
    extract: true,
  },
  kbvFhirEau_1_2_1: {
    assetId: "kbvFhirEau_1_2_1",
    url: "https://update.kbv.de/ita-update/DigitaleMuster/eAU/KBV_FHIR_eAU_V1.2.1_zur_Validierung.zip",
    fileName: "KBV_FHIR_eAU_V1.2.1_zur_Validierung.zip",
    extract: true,
  },
  kbvEauExamples_1_2: {
    assetId: "kbvEauExamples_1_2",
    url: "https://update.kbv.de/ita-update/DigitaleMuster/eAU/eAU_Beispiele_V1.2.zip",
    fileName: "eAU_Beispiele_V1.2.zip",
    extract: true,
  },
  kbvFhirErp_1_3_3: {
    assetId: "kbvFhirErp_1_3_3",
    url: "https://update.kbv.de/ita-update/DigitaleMuster/ERP/KBV_FHIR_eRP_V1.3.3_zur_Validierung.zip",
    fileName: "KBV_FHIR_eRP_V1.3.3_zur_Validierung.zip",
    extract: true,
  },
  xpmKvdtPraxis_2026_2_1: {
    assetId: "xpmKvdtPraxis_2026_2_1",
    url: "https://update.kbv.de/ita-update/Abrechnung/xpm-kvdt-praxis-2026.2.1.zip",
    fileName: "xpm-kvdt-praxis-2026.2.1.zip",
    extract: true,
  },
  kbvPruefassistent_2026_2_1: {
    assetId: "kbvPruefassistent_2026_2_1",
    url: "https://update.kbv.de/ita-update/KBV-Software/Pruefassistent/KBV-Pruefassistent_V2026.2.1.jar",
    fileName: "KBV-Pruefassistent_V2026.2.1.jar",
  },
  xkm_1_44_0: {
    assetId: "xkm_1_44_0",
    url: "https://update.kbv.de/ita-update/KBV-Software/Kryptomodul/xkm-1.44.0.zip",
    fileName: "xkm-1.44.0.zip",
    extract: true,
  },
  xkmPublicKeys_2026_02: {
    assetId: "xkmPublicKeys_2026_02",
    url: "https://update.kbv.de/ita-update/KBV-Software/Kryptomodul/Oeffentliche_Schluessel.zip",
    fileName: "Oeffentliche_Schluessel.zip",
    extract: true,
  },
  xkmTestKeys_2026_02: {
    assetId: "xkmTestKeys_2026_02",
    url: "https://update.kbv.de/ita-update/KBV-Software/Kryptomodul/Testschluessel.zip",
    fileName: "Testschluessel.zip",
    extract: true,
  },
  bmp_2_8_q3_2026: {
    assetId: "bmp_2_8_q3_2026",
    url: "https://update.kbv.de/ita-update/Verordnungen/Arzneimittel/BMP/BMP_2.8_Q3_2026/BMP_V2.8.zip",
    fileName: "BMP_V2.8.zip",
    extract: true,
  },
} as const satisfies Record<string, KbvOracleAsset>;

export const fhirValidatorPrerequisitePackages = [
  {
    packageId: "hl7.fhir.r4.core",
    version: "4.0.1",
  },
  {
    packageId: "hl7.fhir.xver-extensions",
    version: "0.1.0",
  },
  {
    packageId: "hl7.terminology",
    version: "5.5.0",
  },
  {
    packageId: "hl7.terminology.r4",
    version: "6.2.0",
  },
  {
    packageId: "hl7.terminology.r5",
    version: "6.2.0",
  },
  {
    packageId: "hl7.fhir.uv.extensions",
    version: "5.2.0",
  },
  {
    packageId: "hl7.fhir.uv.extensions.r4",
    version: "1.0.0",
  },
  {
    packageId: "hl7.fhir.uv.extensions.r4",
    version: "5.2.0",
  },
] as const satisfies ReadonlyArray<ExternalFhirPackage>;

export const getKbvOracleCacheDir = () =>
  process.env.KBV_UPDATE_CACHE_DIR ??
  join(process.cwd(), ".cache", "kbv-oracles");

export const getFhirPackageCacheRoot = (
  cacheDir = getKbvOracleCacheDir(),
) => join(cacheDir, "fhir-home", ".fhir", "packages");

export const getKbvOracleCacheManifestPath = (
  cacheDir = getKbvOracleCacheDir(),
) => join(cacheDir, "asset-cache.json");

const hashBuffer = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");

export const computeFileSha256 = async (filePath: string) => {
  const content = await readFile(filePath);
  return hashBuffer(content);
};

const verifyFileHash = async (filePath: string, expectedSha256?: string) => {
  if (!expectedSha256) {
    return;
  }
  const actualSha256 = await computeFileSha256(filePath);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `SHA-256 mismatch for ${filePath}: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }
};

const readAssetCacheManifest = async (
  cacheDir = getKbvOracleCacheDir(),
): Promise<Record<string, KbvOracleAssetCacheEntry>> => {
  const manifestPath = getKbvOracleCacheManifestPath(cacheDir);
  if (!existsSync(manifestPath)) {
    return {};
  }

  const content = await readFile(manifestPath, "utf8");
  return JSON.parse(content) as Record<string, KbvOracleAssetCacheEntry>;
};

const writeAssetCacheManifest = async ({
  cacheDir,
  manifest,
}: {
  cacheDir: string;
  manifest: Record<string, KbvOracleAssetCacheEntry>;
}) => {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    getKbvOracleCacheManifestPath(cacheDir),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
};

const updateAssetCacheManifest = async ({
  cacheDir,
  asset,
  downloadPath,
  extractedPath,
}: {
  cacheDir: string;
  asset: KbvOracleAsset;
  downloadPath: string;
  extractedPath?: string;
}) => {
  const manifest = await readAssetCacheManifest(cacheDir);
  manifest[asset.assetId] = {
    assetId: asset.assetId,
    url: asset.url,
    fileName: asset.fileName,
    downloadPath,
    ...(asset.sha256 ? { sha256: asset.sha256 } : {}),
    downloadedAt: new Date().toISOString(),
    ...(extractedPath ? { extractedPath } : {}),
  };
  await writeAssetCacheManifest({
    cacheDir,
    manifest,
  });
};

export const getAssetCacheEntry = async ({
  assetId,
  cacheDir = getKbvOracleCacheDir(),
}: {
  assetId: string;
  cacheDir?: string;
}) => {
  const manifest = await readAssetCacheManifest(cacheDir);
  return manifest[assetId];
};

export const downloadManagedAsset = async (
  asset: KbvOracleAsset,
  cacheDir = getKbvOracleCacheDir(),
) => {
  const downloadDir = join(cacheDir, "downloads");
  const downloadPath = join(downloadDir, asset.fileName);

  await mkdir(downloadDir, { recursive: true });

  if (existsSync(downloadPath)) {
    await verifyFileHash(downloadPath, asset.sha256);
    await updateAssetCacheManifest({
      cacheDir,
      asset,
      downloadPath,
    });
    return downloadPath;
  }

  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${asset.url}: ${response.status}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (asset.sha256) {
    const actualSha256 = hashBuffer(content);
    if (actualSha256 !== asset.sha256) {
      throw new Error(
        `SHA-256 mismatch for ${asset.url}: expected ${asset.sha256}, got ${actualSha256}`,
      );
    }
  }

  const tempPath = join(
    downloadDir,
    `${asset.fileName}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(tempPath, content);
  await mkdir(dirname(downloadPath), { recursive: true });
  await rm(downloadPath, { force: true });
  await writeFile(downloadPath, content);
  await rm(tempPath, { force: true });
  await updateAssetCacheManifest({
    cacheDir,
    asset,
    downloadPath,
  });
  return downloadPath;
};

export const ensureExtractedAsset = async (
  asset: KbvOracleAsset,
  cacheDir = getKbvOracleCacheDir(),
) => {
  const archivePath = await downloadManagedAsset(asset, cacheDir);
  if (asset.extract !== true) {
    return archivePath;
  }

  const extractDir = join(cacheDir, "extracted", asset.assetId);
  const markerPath = join(extractDir, ".ok");
  if (existsSync(markerPath)) {
    return extractDir;
  }

  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });

  await execFileAsync("unzip", ["-oq", archivePath, "-d", extractDir], {
    cwd: tmpdir(),
  });
  await writeFile(markerPath, "ok");
  await updateAssetCacheManifest({
    cacheDir,
    asset,
    downloadPath: archivePath,
    extractedPath: extractDir,
  });
  return extractDir;
};

export const findFileRecursive = async (
  rootDir: string,
  matcher: (entryPath: string) => boolean,
): Promise<string | undefined> => {
  const { readdir } = await import("node:fs/promises");
  const { stat } = await import("node:fs/promises");

  const entries = await readdir(rootDir);
  for (const entry of entries) {
    const entryPath = join(rootDir, entry);
    const entryStat = await stat(entryPath);
    if (entryStat.isDirectory()) {
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

export const ensureFhirValidatorAssets = async ({
  family,
  cacheDir = getKbvOracleCacheDir(),
}: {
  family: "eRezept" | "eAU";
  cacheDir?: string;
}) => {
  const serviceDir = await ensureExtractedAsset(
    kbvOracleAssets.fhirValidatorService_2_2_0,
    cacheDir,
  );
  const validatorJar = await findFileRecursive(
    serviceDir,
    (entryPath) => entryPath.includes("validator_cli") && entryPath.endsWith(".jar"),
  );
  if (!validatorJar) {
    throw new Error("validator_cli jar not found in extracted KBV validator service");
  }

  const packageRoot =
    family === "eAU"
      ? await ensureExtractedAsset(kbvOracleAssets.kbvFhirEau_1_2_1, cacheDir)
      : await ensureExtractedAsset(kbvOracleAssets.kbvFhirErp_1_3_3, cacheDir);

  const packageEntries = await readdir(packageRoot, {
    withFileTypes: true,
  });
  const nestedIgPaths = packageEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packageRoot, entry.name))
    .sort((left, right) => {
      const leftBase = left.split("/").at(-1) ?? left;
      const rightBase = right.split("/").at(-1) ?? right;
      const leftPriority = leftBase.startsWith("_") ? 0 : 1;
      const rightPriority = rightBase.startsWith("_") ? 0 : 1;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return leftBase.localeCompare(rightBase);
    });

  return {
    validatorJar,
    packageRoot,
    igPaths: [...nestedIgPaths, packageRoot],
  };
};

export const ensureKvdtAssets = async ({
  cacheDir = getKbvOracleCacheDir(),
}: {
  cacheDir?: string;
}) => {
  const xpmDir = await ensureExtractedAsset(kbvOracleAssets.xpmKvdtPraxis_2026_2_1, cacheDir);
  const xkmDir = await ensureExtractedAsset(kbvOracleAssets.xkm_1_44_0, cacheDir);
  const xkmPublicKeysDir = await ensureExtractedAsset(
    kbvOracleAssets.xkmPublicKeys_2026_02,
    cacheDir,
  );
  const xkmTestKeysDir = await ensureExtractedAsset(
    kbvOracleAssets.xkmTestKeys_2026_02,
    cacheDir,
  );
  const pruefassistentJar = await downloadManagedAsset(
    kbvOracleAssets.kbvPruefassistent_2026_2_1,
    cacheDir,
  );

  const xpmStartScript = await findFileRecursive(
    xpmDir,
    (entryPath) => entryPath.endsWith("StartPruefung.sh"),
  );
  const xkmStartScript = await findFileRecursive(
    xkmDir,
    (entryPath) => entryPath.endsWith("StartKryptomodul.sh"),
  );

  if (!xpmStartScript) {
    throw new Error("KVDT XPM start script not found in downloaded package");
  }
  if (!xkmStartScript) {
    throw new Error("XKM start script not found in downloaded package");
  }

  return {
    xpmDir,
    xpmStartScript,
    pruefassistentJar,
    xkmDir,
    xkmStartScript,
    xkmPublicKeysDir,
    xkmTestKeysDir,
  };
};

export const ensureBmpAssets = async ({
  cacheDir = getKbvOracleCacheDir(),
}: {
  cacheDir?: string;
}) => {
  const bmpDir = await ensureExtractedAsset(kbvOracleAssets.bmp_2_8_q3_2026, cacheDir);
  const bmpXsd = await findFileRecursive(
    bmpDir,
    (entryPath) => entryPath.endsWith(".xsd"),
  );

  if (!bmpXsd) {
    throw new Error("BMP XSD was not found in downloaded BMP package");
  }

  return {
    bmpDir,
    bmpXsd,
  };
};

const sanitizePackageId = (packageId: string) =>
  packageId.replaceAll("/", "_");

const getExternalFhirPackageArchivePath = ({
  packageId,
  version,
  cacheDir,
}: {
  packageId: string;
  version: string;
  cacheDir: string;
}) =>
  join(
    cacheDir,
    "fhir-package-cache",
    `${sanitizePackageId(packageId)}-${version}.tgz`,
  );

const getExternalFhirPackageInstallDir = ({
  packageId,
  version,
  cacheDir,
}: {
  packageId: string;
  version: string;
  cacheDir: string;
}) => join(getFhirPackageCacheRoot(cacheDir), `${packageId}#${version}`);

const ensureFhirPackageCacheMetadata = async (cacheDir: string) => {
  const packageCacheRoot = getFhirPackageCacheRoot(cacheDir);
  await mkdir(packageCacheRoot, { recursive: true });
  const packagesIniPath = join(packageCacheRoot, "packages.ini");

  if (!existsSync(packagesIniPath)) {
    await writeFile(packagesIniPath, "[cache]\nversion = 3\n", "utf8");
  }

  return packageCacheRoot;
};

const downloadExternalFhirPackage = async ({
  packageId,
  version,
  url,
  sha256,
  cacheDir,
}: ExternalFhirPackage & {
  cacheDir: string;
}) => {
  const archivePath = getExternalFhirPackageArchivePath({
    packageId,
    version,
    cacheDir,
  });

  await mkdir(dirname(archivePath), { recursive: true });

  if (existsSync(archivePath)) {
    await verifyFileHash(archivePath, sha256);
    return archivePath;
  }

  const packageUrl =
    url ?? `https://packages2.fhir.org/web/${packageId}-${version}.tgz`;
  const response = await fetch(packageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${packageUrl}: ${response.status}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (sha256) {
    const actualSha256 = hashBuffer(content);
    if (actualSha256 !== sha256) {
      throw new Error(
        `SHA-256 mismatch for ${packageUrl}: expected ${sha256}, got ${actualSha256}`,
      );
    }
  }

  await writeFile(archivePath, content);
  return archivePath;
};

export const ensureExternalFhirPackageInstalled = async ({
  packageId,
  version,
  url,
  sha256,
  cacheDir = getKbvOracleCacheDir(),
}: ExternalFhirPackage & {
  cacheDir?: string;
}) => {
  const installDir = getExternalFhirPackageInstallDir({
    packageId,
    version,
    cacheDir,
  });
  const packageJsonPath = join(installDir, "package", "package.json");

  await ensureFhirPackageCacheMetadata(cacheDir);

  if (!existsSync(packageJsonPath)) {
    const archivePath = await downloadExternalFhirPackage({
      packageId,
      version,
      url,
      sha256,
      cacheDir,
    });
    const extractDir = join(
      cacheDir,
      "fhir-package-cache",
      "extract",
      `${sanitizePackageId(packageId)}-${version}`,
    );
    await rm(extractDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir], {
      cwd: tmpdir(),
    });
    await rm(installDir, { recursive: true, force: true });
    await mkdir(dirname(installDir), { recursive: true });
    await cp(join(extractDir, "package"), join(installDir, "package"), {
      recursive: true,
      force: true,
    });
  }

  const packageJson = JSON.parse(
    await readFile(packageJsonPath, "utf8"),
  ) as {
    dependencies?: Record<string, string>;
  };

  for (const [dependencyId, dependencyVersion] of Object.entries(
    packageJson.dependencies ?? {},
  )) {
    await ensureExternalFhirPackageInstalled({
      packageId: dependencyId,
      version: dependencyVersion,
      cacheDir,
    });
  }

  return installDir;
};

export const ensureFhirValidatorDependencyCache = async ({
  cacheDir = getKbvOracleCacheDir(),
}: {
  cacheDir?: string;
}) => {
  const installedPackages = [];

  for (const externalPackage of fhirValidatorPrerequisitePackages) {
    const installDir = await ensureExternalFhirPackageInstalled({
      ...externalPackage,
      cacheDir,
    });
    installedPackages.push({
      packageId: externalPackage.packageId,
      version: externalPackage.version,
      installDir,
    });
  }

  return installedPackages;
};

export const prefetchKbvOracleAssets = async ({
  assetIds,
  cacheDir = getKbvOracleCacheDir(),
}: {
  assetIds?: ReadonlyArray<keyof typeof kbvOracleAssets>;
  cacheDir?: string;
}) => {
  const selectedAssetIds =
    assetIds ?? (Object.keys(kbvOracleAssets) as Array<keyof typeof kbvOracleAssets>);
  const results = [];

  for (const assetId of selectedAssetIds) {
    const asset = kbvOracleAssets[assetId];
    const path = "extract" in asset && asset.extract === true
      ? await ensureExtractedAsset(asset, cacheDir)
      : await downloadManagedAsset(asset, cacheDir);
    results.push({
      assetId,
      path,
    });
  }

  return results;
};

export const cloneAssetWorkspace = async ({
  sourceDir,
  targetDir,
}: {
  sourceDir: string;
  targetDir: string;
}) => {
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
  });
  return targetDir;
};
