import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const KBV_MIRROR_ROOT = "/Users/johannes/Code/kbv-mirror";
const fhirValidatorAssetsCache = new Map<
  string,
  Promise<{
    igPaths: string[];
    packageRoot: string;
    validatorJar: string;
  }>
>();
const fhirValidatorDependencyCache = new Map<
  string,
  Promise<
    {
      installDir: string;
      packageId: string;
      version: string;
    }[]
  >
>();
const fhirValidatorRuntimeHomeCache = new Map<string, Promise<string>>();

export interface ExternalFhirPackage {
  readonly packageId: string;
  readonly sha256?: string;
  readonly url?: string;
  readonly version: string;
}

export interface KbvOracleAsset {
  readonly assetId: string;
  readonly extract?: boolean;
  readonly fileName: string;
  readonly sha256?: string;
  readonly url: string;
}

export interface KbvOracleAssetCacheEntry {
  readonly assetId: string;
  readonly downloadedAt: string;
  readonly downloadPath: string;
  readonly extractedPath?: string;
  readonly fileName: string;
  readonly sha256?: string;
  readonly url: string;
}

export const kbvOracleAssets = {
  bfbDirectory_2026_03_10: {
    assetId: "bfbDirectory_2026_03_10",
    fileName: "KBV_ITA_SIEX_Verzeichnis_BFB.pdf",
    sha256: "abe78e966631460291f9f40f919a24b4dd6590c4768cb8d42b7e3e9e3888ce0b",
    url: "https://update.kbv.de/ita-update/Service-Informationen/Zulassungsverzeichnisse/KBV_ITA_SIEX_Verzeichnis_BFB.pdf",
  },
  bfbMuster_2025_11_14: {
    assetId: "bfbMuster_2025_11_14",
    extract: true,
    fileName: "Muster.zip",
    sha256: "cb96dc1d13f4c85dd19c6731e911d1054ece4480c670272236ed5ba78631032b",
    url: "https://update.kbv.de/ita-update/Blankoformulare/Muster.zip",
  },
  bfbPruefpaket_2024_10_04: {
    assetId: "bfbPruefpaket_2024_10_04",
    fileName: "KBV_ITA_AHEX_Pruefpaket_BFB.pdf",
    sha256: "4e19ee866da0e2983c443bd8b5f4cb0ed1ed5ee3c64dbdff0efd787704d0ff2a",
    url: "https://update.kbv.de/ita-update/Blankoformulare/KBV_ITA_AHEX_Pruefpaket_BFB.pdf",
  },
  bfbTechnicalHandbook_2025_11_14: {
    assetId: "bfbTechnicalHandbook_2025_11_14",
    fileName: "KBV_ITA_VGEX_Technisches_Handbuch_BFB.pdf",
    sha256: "239ceab2bece174bdc30cf90e706ea4448b01fbabb45c2d62adbd6c5a65c3458",
    url: "https://update.kbv.de/ita-update/Blankoformulare/KBV_ITA_VGEX_Technisches_Handbuch_BFB.pdf",
  },
  bmp_2_8_q3_2026: {
    assetId: "bmp_2_8_q3_2026",
    extract: true,
    fileName: "BMP_V2.8.zip",
    sha256: "fa47de8307a463e7737ded00559191b8deb9380dda4eabb2718ec1161880a6b3",
    url: "https://update.kbv.de/ita-update/Verordnungen/Arzneimittel/BMP/BMP_2.8_Q3_2026/BMP_V2.8.zip",
  },
  bmpExamples_2_8_q3_2026: {
    assetId: "bmpExamples_2_8_q3_2026",
    extract: true,
    fileName: "BMP_Beispieldateien_V2.8.zip",
    sha256: "32e7234426a6c3ab941e4cded67e9a8886aa530061ab8cfdcaa79777ac6429a0",
    url: "https://update.kbv.de/ita-update/Verordnungen/Arzneimittel/BMP/BMP_2.8_Q3_2026/BMP_Beispieldateien_V2.8.zip",
  },
  fhirValidatorService_2_2_0: {
    assetId: "fhirValidatorService_2_2_0",
    extract: true,
    fileName: "Service_zur_Validierung_2.2.0.zip",
    sha256: "43ab705304df7ecab6cafdcf1f42cb62da3138f7177dac0c6a1ba19469276487",
    url: "https://update.kbv.de/ita-update/371-Schnittstellen/Verordnungssoftware-Schnittstelle/Service_zur_Validierung_2.2.0.zip",
  },
  kbvEauExamples_1_2: {
    assetId: "kbvEauExamples_1_2",
    extract: true,
    fileName: "eAU_Beispiele_V1.2.zip",
    sha256: "aa17891cd9ac6b0959cc99f8276df835f7b8c6e14cd418d053f68f4c39490f49",
    url: "https://update.kbv.de/ita-update/DigitaleMuster/eAU/eAU_Beispiele_V1.2.zip",
  },
  kbvErpExamples_1_4: {
    assetId: "kbvErpExamples_1_4",
    extract: true,
    fileName: "eRP_Beispiele_V1.4.zip",
    sha256: "1f63589313841a9f7735b0ba28f861a8e9a97014f8e6a062ca50611ff89dfe62",
    url: "https://update.kbv.de/ita-update/DigitaleMuster/ERP/Q3_2026/eRP_Beispiele_V1.4.zip",
  },
  kbvFhirEau_1_2_1: {
    assetId: "kbvFhirEau_1_2_1",
    extract: true,
    fileName: "KBV_FHIR_eAU_V1.2.1_zur_Validierung.zip",
    sha256: "b3ceb402ca661c9c441a1cc0dbfc7fb0509bdf4466c7eeeca49c91c014b0c975",
    url: "https://update.kbv.de/ita-update/DigitaleMuster/eAU/KBV_FHIR_eAU_V1.2.1_zur_Validierung.zip",
  },
  kbvFhirErp_1_4_1: {
    assetId: "kbvFhirErp_1_4_1",
    extract: true,
    fileName: "KBV_FHIR_eRP_V1.4.1_zur_Validierung.zip",
    sha256: "cd61993d705cb538072f46a53eaa5545afd97bc4f48845ef953d19564914500d",
    url: "https://update.kbv.de/ita-update/DigitaleMuster/ERP/Q3_2026/KBV_FHIR_eRP_V1.4.1_zur_Validierung.zip",
  },
  kbvPruefassistent_2026_2_1: {
    assetId: "kbvPruefassistent_2026_2_1",
    fileName: "KBV-Pruefassistent_V2026.2.1.jar",
    sha256: "24242cc761b02929ba9092d420aa6c74decf840985cbc7bd3f0419cdff068c8a",
    url: "https://update.kbv.de/ita-update/KBV-Software/Pruefassistent/KBV-Pruefassistent_V2026.2.1.jar",
  },
  tssResponseExamples_7_2: {
    assetId: "tssResponseExamples_7_2",
    extract: true,
    fileName: "Daten_Terminservicestelle_V7.2.zip",
    sha256: "5641fbbc61cc327b029cbbc2696451dbe47da5b9c1d4bfdd559d5acf5063b84f",
    url: "https://update.kbv.de/ita-update/TSS/3_0_0/Daten_Terminservicestelle_V7.2.zip",
  },
  tssTestpatientXml_2025_07_14: {
    assetId: "tssTestpatientXml_2025_07_14",
    extract: true,
    fileName: "Testpatient_XML.zip",
    sha256: "bee6a54d695f1107f991d76968f6706b50ec18653b7aa3b264e245b6a8399f5c",
    url: "https://update.kbv.de/ita-update/TSS/3_0_0/Testpatient_XML.zip",
  },
  tssVsdTestfaelle_2_0: {
    assetId: "tssVsdTestfaelle_2_0",
    extract: true,
    fileName: "VSD_Testfaelle_TSS_ABR_V2.0.zip",
    sha256: "43f5688edcb3879962f4ea2655c61d1714b36a0e7db55dbb47668891e8edd76b",
    url: "https://update.kbv.de/ita-update/TSS/3_0_0/VSD_Testfaelle_TSS_ABR_V2.0.zip",
  },
  xkm_1_44_0: {
    assetId: "xkm_1_44_0",
    extract: true,
    fileName: "xkm-1.44.0.zip",
    sha256: "5570ef3b2077a125dfe1ce544b7fd79eca71f5781c02eb6d16b4e60fac2f2b6b",
    url: "https://update.kbv.de/ita-update/KBV-Software/Kryptomodul/xkm-1.44.0.zip",
  },
  xkmPublicKeys_2026_02: {
    assetId: "xkmPublicKeys_2026_02",
    extract: true,
    fileName: "Oeffentliche_Schluessel.zip",
    sha256: "27b81833fd854ff17ee4ef92017008f65678da018b8bacaff2302fe8b4bd99d6",
    url: "https://update.kbv.de/ita-update/KBV-Software/Kryptomodul/Oeffentliche_Schluessel.zip",
  },
  xkmTestKeys_2026_02: {
    assetId: "xkmTestKeys_2026_02",
    extract: true,
    fileName: "Testschluessel.zip",
    sha256: "472a507c0b98646b5f3286b2a4e6aad5ba9cd85944d7dd057a1cc15bbc1124ce",
    url: "https://update.kbv.de/ita-update/KBV-Software/Kryptomodul/Testschluessel.zip",
  },
  xpmKvdtPraxis_2026_2_1: {
    assetId: "xpmKvdtPraxis_2026_2_1",
    extract: true,
    fileName: "xpm-kvdt-praxis-2026.2.1.zip",
    sha256: "593f32b39f017cf5d6d71488134139e0668ad6a3ba2b7f0323fd1433a7789b9f",
    url: "https://update.kbv.de/ita-update/Abrechnung/xpm-kvdt-praxis-2026.2.1.zip",
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
    packageId: "hl7.terminology",
    version: "7.1.0",
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
    packageId: "hl7.terminology.r5",
    version: "6.5.0",
  },
  {
    packageId: "hl7.fhir.uv.extensions",
    version: "5.2.0",
  },
  {
    packageId: "hl7.fhir.uv.extensions",
    version: "5.3.0-ballot-tc1",
  },
  {
    packageId: "hl7.fhir.uv.extensions.r4",
    version: "1.0.0",
  },
  {
    packageId: "hl7.fhir.uv.extensions.r4",
    version: "5.2.0",
  },
  {
    packageId: "hl7.fhir.uv.extensions.r5",
    version: "5.2.0",
  },
] as const satisfies readonly ExternalFhirPackage[];

export const getKbvOracleCacheDir = () =>
  process.env.KBV_UPDATE_CACHE_DIR ??
  join(process.cwd(), ".cache", "kbv-oracles");

export const getFhirPackageCacheRoot = (cacheDir = getKbvOracleCacheDir()) =>
  join(resolve(cacheDir), "fhir-home", ".fhir", "packages");

export const getFhirRuntimeHomeRoot = ({
  cacheDir = getKbvOracleCacheDir(),
  runtimeKey,
}: {
  cacheDir?: string;
  runtimeKey: string;
}) =>
  join(
    resolve(cacheDir),
    "fhir-home-runtimes",
    runtimeKey.replaceAll(/[^\w.-]/g, "_"),
  );

const getFhirDependencyMarkerPath = (cacheDir = getKbvOracleCacheDir()) =>
  join(getFhirPackageCacheRoot(cacheDir), ".kbv-prerequisites.json");

export const getKbvOracleCacheManifestPath = (
  cacheDir = getKbvOracleCacheDir(),
) => join(resolve(cacheDir), "asset-cache.json");

export const computeBufferSha256 = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");

export const computeFileSha256 = async (filePath: string) => {
  const content = await readFile(filePath);
  return computeBufferSha256(content);
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
  try {
    return JSON.parse(content) as Record<string, KbvOracleAssetCacheEntry>;
  } catch {
    return {};
  }
};

const writeAssetCacheManifest = async ({
  cacheDir,
  manifest,
}: {
  cacheDir: string;
  manifest: Record<string, KbvOracleAssetCacheEntry>;
}) => {
  await mkdir(cacheDir, { recursive: true });
  const manifestPath = getKbvOracleCacheManifestPath(cacheDir);
  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(manifest, null, 2), "utf8");
  await rename(tempPath, manifestPath);
};

const updateAssetCacheManifest = async ({
  asset,
  cacheDir,
  downloadPath,
  extractedPath,
}: {
  asset: KbvOracleAsset;
  cacheDir: string;
  downloadPath: string;
  extractedPath?: string;
}) => {
  const manifest = await readAssetCacheManifest(cacheDir);
  manifest[asset.assetId] = {
    assetId: asset.assetId,
    downloadPath,
    fileName: asset.fileName,
    url: asset.url,
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
  const resolvedCacheDir = resolve(cacheDir);
  const downloadDir = join(resolvedCacheDir, "downloads");
  const downloadPath = join(downloadDir, asset.fileName);

  await mkdir(downloadDir, { recursive: true });

  if (existsSync(downloadPath)) {
    try {
      await verifyFileHash(downloadPath, asset.sha256);
      await updateAssetCacheManifest({
        asset,
        cacheDir: resolvedCacheDir,
        downloadPath,
      });
      return downloadPath;
    } catch {
      await rm(downloadPath, { force: true });
    }
  }

  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${asset.url}: ${response.status}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (asset.sha256) {
    const actualSha256 = computeBufferSha256(content);
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
    asset,
    cacheDir: resolvedCacheDir,
    downloadPath,
  });
  return downloadPath;
};

export const ensureExtractedAsset = async (
  asset: KbvOracleAsset,
  cacheDir = getKbvOracleCacheDir(),
) => {
  const resolvedCacheDir = resolve(cacheDir);
  if (asset.extract !== true) {
    const archivePath = await downloadManagedAsset(asset, resolvedCacheDir);
    return archivePath;
  }

  const archivePath = await downloadManagedAsset(asset, resolvedCacheDir);
  const extractDir = join(resolvedCacheDir, "extracted", asset.assetId);
  const markerPath = join(extractDir, ".ok");
  if (existsSync(markerPath)) {
    await updateAssetCacheManifest({
      asset,
      cacheDir: resolvedCacheDir,
      downloadPath: archivePath,
      extractedPath: extractDir,
    });
    return extractDir;
  }

  if (existsSync(extractDir)) {
    const entries = await readdir(extractDir);
    const hasExtractedContent = entries.some((entry) => entry !== ".ok");
    if (hasExtractedContent) {
      await writeFile(markerPath, "ok");
      await updateAssetCacheManifest({
        asset,
        cacheDir: resolvedCacheDir,
        downloadPath: archivePath,
        extractedPath: extractDir,
      });
      return extractDir;
    }
  }

  await rm(extractDir, { force: true, recursive: true });
  await mkdir(extractDir, { recursive: true });

  await execFileAsync("unzip", ["-oq", archivePath, "-d", extractDir], {
    cwd: tmpdir(),
  });
  await writeFile(markerPath, "ok");
  await updateAssetCacheManifest({
    asset,
    cacheDir: resolvedCacheDir,
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

const collectIgDirectories = async (rootDir: string): Promise<string[]> => {
  const directories = new Set<string>();

  const visit = async (currentDir: string) => {
    const entries = await readdir(currentDir, {
      withFileTypes: true,
    });
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

export const ensureFhirValidatorAssets = async ({
  cacheDir = getKbvOracleCacheDir(),
  family,
}: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
}) => {
  const resolvedCacheDir = resolve(cacheDir);
  const cacheKey = `${family}:${resolvedCacheDir}`;
  const cached = fhirValidatorAssetsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const serviceDir = await ensureExtractedAsset(
      kbvOracleAssets.fhirValidatorService_2_2_0,
      resolvedCacheDir,
    );
    const validatorJar = await findFileRecursive(
      serviceDir,
      (entryPath) =>
        entryPath.includes("validator_cli") && entryPath.endsWith(".jar"),
    );
    if (!validatorJar) {
      throw new Error(
        "validator_cli jar not found in extracted KBV validator service",
      );
    }

    const packageRoot =
      family === "eAU"
        ? await ensureExtractedAsset(
            kbvOracleAssets.kbvFhirEau_1_2_1,
            resolvedCacheDir,
          )
        : family === "eRezept"
          ? await ensureExtractedAsset(
              kbvOracleAssets.kbvFhirErp_1_4_1,
              resolvedCacheDir,
            )
          : resolve(
              KBV_MIRROR_ROOT,
              "DigitaleMuster/eVDGA/KBV_FHIR_eVDGA_V1.2.2_zur_Validierung.zip.extracted",
            );

    if (!existsSync(packageRoot)) {
      throw new Error(
        family === "eVDGA"
          ? "eVDGA validator package was not found in /Users/johannes/Code/kbv-mirror"
          : `FHIR validator package root for ${family} was not found`,
      );
    }

    const nestedIgPaths = (await collectIgDirectories(packageRoot)).filter(
      (entryPath) => entryPath !== packageRoot,
    );

    return {
      igPaths: [...nestedIgPaths, packageRoot],
      packageRoot,
      validatorJar,
    };
  })();

  fhirValidatorAssetsCache.set(cacheKey, pending);
  return pending;
};

export const ensureKvdtAssets = async ({
  cacheDir = getKbvOracleCacheDir(),
}: {
  cacheDir?: string;
}) => {
  const resolvedCacheDir = resolve(cacheDir);
  const xpmDir = await ensureExtractedAsset(
    kbvOracleAssets.xpmKvdtPraxis_2026_2_1,
    resolvedCacheDir,
  );
  const xkmDir = await ensureExtractedAsset(
    kbvOracleAssets.xkm_1_44_0,
    resolvedCacheDir,
  );
  const xkmPublicKeysDir = await ensureExtractedAsset(
    kbvOracleAssets.xkmPublicKeys_2026_02,
    resolvedCacheDir,
  );
  const xkmTestKeysDir = await ensureExtractedAsset(
    kbvOracleAssets.xkmTestKeys_2026_02,
    resolvedCacheDir,
  );
  const pruefassistentJar = await downloadManagedAsset(
    kbvOracleAssets.kbvPruefassistent_2026_2_1,
    resolvedCacheDir,
  );

  const xpmStartScript = await findFileRecursive(xpmDir, (entryPath) =>
    entryPath.endsWith("StartPruefung.sh"),
  );
  const xkmStartScript = await findFileRecursive(xkmDir, (entryPath) =>
    entryPath.endsWith("StartKryptomodul.sh"),
  );

  if (!xpmStartScript) {
    throw new Error("KVDT XPM start script not found in downloaded package");
  }
  if (!xkmStartScript) {
    throw new Error("XKM start script not found in downloaded package");
  }

  return {
    pruefassistentJar,
    xkmDir,
    xkmPublicKeysDir,
    xkmStartScript,
    xkmTestKeysDir,
    xpmDir,
    xpmStartScript,
  };
};

export const ensureBmpAssets = async ({
  cacheDir = getKbvOracleCacheDir(),
}: {
  cacheDir?: string;
}) => {
  const resolvedCacheDir = resolve(cacheDir);
  const bmpDir = await ensureExtractedAsset(
    kbvOracleAssets.bmp_2_8_q3_2026,
    resolvedCacheDir,
  );
  const bmpExamplesDir = await ensureExtractedAsset(
    kbvOracleAssets.bmpExamples_2_8_q3_2026,
    resolvedCacheDir,
  );
  const bmpXsd = await findFileRecursive(bmpDir, (entryPath) =>
    entryPath.endsWith(".xsd"),
  );

  if (!bmpXsd) {
    throw new Error("BMP XSD was not found in downloaded BMP package");
  }

  return {
    bmpDir,
    bmpExamplesDir,
    bmpXsd,
  };
};

export const ensureTssAssets = async ({
  cacheDir = getKbvOracleCacheDir(),
}: {
  cacheDir?: string;
}) => {
  const resolvedCacheDir = resolve(cacheDir);
  const responseExamplesDir = await ensureExtractedAsset(
    kbvOracleAssets.tssResponseExamples_7_2,
    resolvedCacheDir,
  );
  const vsdTestfaelleDir = await ensureExtractedAsset(
    kbvOracleAssets.tssVsdTestfaelle_2_0,
    resolvedCacheDir,
  );
  const testpatientXmlDir = await ensureExtractedAsset(
    kbvOracleAssets.tssTestpatientXml_2025_07_14,
    resolvedCacheDir,
  );

  return {
    responseExamplesDir,
    testpatientXmlDir,
    vsdTestfaelleDir,
  };
};

const sanitizePackageId = (packageId: string) => packageId.replaceAll("/", "_");

const getExternalFhirPackageArchivePath = ({
  cacheDir,
  packageId,
  version,
}: {
  cacheDir: string;
  packageId: string;
  version: string;
}) =>
  join(
    cacheDir,
    "fhir-package-cache",
    `${sanitizePackageId(packageId)}-${version}.tgz`,
  );

const getExternalFhirPackageInstallDir = ({
  cacheDir,
  packageId,
  version,
}: {
  cacheDir: string;
  packageId: string;
  version: string;
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

const areFhirPrerequisitesInstalled = async (cacheDir: string) => {
  const packageChecks = await Promise.all(
    fhirValidatorPrerequisitePackages.map(async (externalPackage) => {
      const installDir = getExternalFhirPackageInstallDir({
        cacheDir,
        packageId: externalPackage.packageId,
        version: externalPackage.version,
      });
      const packageJsonPath = join(installDir, "package", "package.json");
      return existsSync(packageJsonPath);
    }),
  );

  return packageChecks.every(Boolean);
};

const writeFhirDependencyMarker = async (cacheDir: string) => {
  const markerPath = getFhirDependencyMarkerPath(cacheDir);
  await writeFile(
    markerPath,
    JSON.stringify(
      {
        prerequisites: fhirValidatorPrerequisitePackages.map(
          ({ packageId, version }) => ({
            packageId,
            version,
          }),
        ),
        writtenAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
};

const downloadExternalFhirPackage = async ({
  cacheDir,
  packageId,
  sha256,
  url,
  version,
}: ExternalFhirPackage & {
  cacheDir: string;
}) => {
  const archivePath = getExternalFhirPackageArchivePath({
    cacheDir,
    packageId,
    version,
  });

  await mkdir(dirname(archivePath), { recursive: true });

  if (existsSync(archivePath)) {
    try {
      await verifyFileHash(archivePath, sha256);
      return archivePath;
    } catch {
      await rm(archivePath, { force: true });
    }
  }

  const packageUrl =
    url ?? `https://packages2.fhir.org/web/${packageId}-${version}.tgz`;
  const response = await fetch(packageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${packageUrl}: ${response.status}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (sha256) {
    const actualSha256 = computeBufferSha256(content);
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
  cacheDir = getKbvOracleCacheDir(),
  packageId,
  sha256,
  url,
  version,
}: ExternalFhirPackage & {
  cacheDir?: string;
}) => {
  const resolvedCacheDir = resolve(cacheDir);
  const installDir = getExternalFhirPackageInstallDir({
    cacheDir: resolvedCacheDir,
    packageId,
    version,
  });
  const packageJsonPath = join(installDir, "package", "package.json");

  await ensureFhirPackageCacheMetadata(resolvedCacheDir);

  if (!existsSync(packageJsonPath)) {
    const archivePath = await downloadExternalFhirPackage({
      cacheDir: resolvedCacheDir,
      packageId,
      sha256,
      url,
      version,
    });
    const extractDir = join(
      resolvedCacheDir,
      "fhir-package-cache",
      "extract",
      `${sanitizePackageId(packageId)}-${version}`,
    );
    await rm(extractDir, { force: true, recursive: true });
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir], {
      cwd: tmpdir(),
    });
    await rm(installDir, { force: true, recursive: true });
    await mkdir(dirname(installDir), { recursive: true });
    await cp(join(extractDir, "package"), join(installDir, "package"), {
      force: true,
      recursive: true,
    });
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };

  for (const [dependencyId, dependencyVersion] of Object.entries(
    packageJson.dependencies ?? {},
  )) {
    await ensureExternalFhirPackageInstalled({
      cacheDir: resolvedCacheDir,
      packageId: dependencyId,
      version: dependencyVersion,
    });
  }

  return installDir;
};

export const ensureFhirValidatorDependencyCache = async ({
  cacheDir = getKbvOracleCacheDir(),
}: {
  cacheDir?: string;
}) => {
  const resolvedCacheDir = resolve(cacheDir);
  const cached = fhirValidatorDependencyCache.get(resolvedCacheDir);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    await ensureFhirPackageCacheMetadata(resolvedCacheDir);
    if (await areFhirPrerequisitesInstalled(resolvedCacheDir)) {
      await writeFhirDependencyMarker(resolvedCacheDir);
      return fhirValidatorPrerequisitePackages.map((externalPackage) => ({
        installDir: getExternalFhirPackageInstallDir({
          cacheDir: resolvedCacheDir,
          packageId: externalPackage.packageId,
          version: externalPackage.version,
        }),
        packageId: externalPackage.packageId,
        version: externalPackage.version,
      }));
    }

    const installedPackages = [];

    for (const externalPackage of fhirValidatorPrerequisitePackages) {
      const installDir = await ensureExternalFhirPackageInstalled({
        ...externalPackage,
        cacheDir: resolvedCacheDir,
      });
      installedPackages.push({
        installDir,
        packageId: externalPackage.packageId,
        version: externalPackage.version,
      });
    }

    await writeFhirDependencyMarker(resolvedCacheDir);
    return installedPackages;
  })();

  fhirValidatorDependencyCache.set(resolvedCacheDir, pending);
  return pending;
};

export const ensureFhirValidatorRuntimeHome = async ({
  cacheDir = getKbvOracleCacheDir(),
  runtimeKey,
}: {
  cacheDir?: string;
  runtimeKey: string;
}) => {
  const resolvedCacheDir = resolve(cacheDir);
  const cacheKey = `${resolvedCacheDir}:${runtimeKey}`;
  const cached = fhirValidatorRuntimeHomeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    await ensureFhirValidatorDependencyCache({
      cacheDir: resolvedCacheDir,
    });

    const sharedPackageCacheRoot = getFhirPackageCacheRoot(resolvedCacheDir);
    const runtimeHomeRoot = getFhirRuntimeHomeRoot({
      cacheDir: resolvedCacheDir,
      runtimeKey,
    });
    const runtimePackageCacheRoot = join(runtimeHomeRoot, ".fhir", "packages");
    const markerPath = join(runtimeHomeRoot, ".kbv-runtime-ready");

    if (existsSync(markerPath)) {
      return runtimeHomeRoot;
    }

    await rm(runtimeHomeRoot, { force: true, recursive: true });
    await mkdir(join(runtimeHomeRoot, ".fhir"), { recursive: true });
    await cp(sharedPackageCacheRoot, runtimePackageCacheRoot, {
      force: true,
      recursive: true,
    });
    await writeFile(
      markerPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          runtimeKey,
          sharedPackageCacheRoot,
        },
        null,
        2,
      ),
      "utf8",
    );

    return runtimeHomeRoot;
  })();

  fhirValidatorRuntimeHomeCache.set(cacheKey, pending);
  return pending;
};

export const prefetchKbvOracleAssets = async ({
  assetIds,
  cacheDir = getKbvOracleCacheDir(),
}: {
  assetIds?: readonly (keyof typeof kbvOracleAssets)[];
  cacheDir?: string;
}) => {
  const resolvedCacheDir = resolve(cacheDir);
  const selectedAssetIds =
    assetIds ??
    (Object.keys(kbvOracleAssets) as (keyof typeof kbvOracleAssets)[]);
  const results = [];

  for (const assetId of selectedAssetIds) {
    const asset = kbvOracleAssets[assetId];
    const path =
      "extract" in asset && asset.extract
        ? await ensureExtractedAsset(asset, resolvedCacheDir)
        : await downloadManagedAsset(asset, resolvedCacheDir);
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
  await rm(targetDir, { force: true, recursive: true });
  await mkdir(dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, {
    force: true,
    recursive: true,
  });
  return targetDir;
};
