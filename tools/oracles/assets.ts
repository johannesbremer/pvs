import { Effect, Schema } from "effect";
import { createHash } from "node:crypto";

import { fileSystem, path, runCommand, runEffect } from "./platform";

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
const fhirRuntimeHomePruneCache = new Map<string, Promise<void>>();
const legacyFhirRuntimeHomePattern =
  /^exec-(?!batch-)[^-]+-\d+-(?:eAU|eRezept|eVDGA)$|^exec-batch-[^-]+-\d+-(?:eAU|eRezept|eVDGA)$/;

const fileExists = (filePath: string) => fileSystem.exists(filePath);

const withPromiseCache = <A, E>(
  cache: Map<string, Promise<A>>,
  cacheKey: string,
  effect: Effect.Effect<A, E, never>,
): Effect.Effect<A, E, never> => {
  const cached = cache.get(cacheKey);
  if (cached) {
    return Effect.promise(() => cached);
  }

  const pending = runEffect(effect);
  cache.set(cacheKey, pending);
  return Effect.promise(() => pending);
};

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

const KbvOracleAssetCacheEntryFields = Schema.Struct({
  assetId: Schema.String,
  downloadedAt: Schema.String,
  downloadPath: Schema.String,
  extractedPath: Schema.optional(Schema.String),
  fileName: Schema.String,
  sha256: Schema.optional(Schema.String),
  url: Schema.String,
});

const AssetCacheManifestFields = Schema.Record({
  key: Schema.String,
  value: KbvOracleAssetCacheEntryFields,
});

const FhirDependencyMarkerFields = Schema.Struct({
  prerequisites: Schema.Array(
    Schema.Struct({
      packageId: Schema.String,
      version: Schema.String,
    }),
  ),
  writtenAt: Schema.String,
});

const FhirRuntimeHomeMarkerFields = Schema.Struct({
  createdAt: Schema.String,
  runtimeKey: Schema.String,
  sharedPackageCacheRoot: Schema.String,
});

const PackageJsonFields = Schema.Struct({
  dependencies: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.String,
    }),
  ),
});

const encodeJsonString = <A, I, R>(schema: Schema.Schema<A, I, R>, value: A) =>
  Schema.encode(Schema.parseJson(schema))(value);

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
  path.join(process.cwd(), ".cache", "kbv-oracles");

export const getFhirPackageCacheRoot = (cacheDir = getKbvOracleCacheDir()) =>
  path.join(path.resolve(cacheDir), "fhir-home", ".fhir", "packages");

export const getFhirRuntimeHomeRoot = ({
  cacheDir = getKbvOracleCacheDir(),
  runtimeKey,
}: {
  cacheDir?: string;
  runtimeKey: string;
}) =>
  path.join(
    path.resolve(cacheDir),
    "fhir-home-runtimes",
    runtimeKey.replaceAll(/[^\w.-]/g, "_"),
  );

const getFhirDependencyMarkerPath = (cacheDir = getKbvOracleCacheDir()) =>
  path.join(getFhirPackageCacheRoot(cacheDir), ".kbv-prerequisites.json");

export const getKbvOracleCacheManifestPath = (
  cacheDir = getKbvOracleCacheDir(),
) => path.join(path.resolve(cacheDir), "asset-cache.json");

const pruneLegacyFhirRuntimeHomes = (cacheDir = getKbvOracleCacheDir()) => {
  const resolvedCacheDir = path.resolve(cacheDir);
  return withPromiseCache(
    fhirRuntimeHomePruneCache,
    resolvedCacheDir,
    Effect.gen(function* () {
      const runtimeHomesRoot = path.join(
        resolvedCacheDir,
        "fhir-home-runtimes",
      );
      if (!(yield* fileExists(runtimeHomesRoot))) {
        return;
      }

      const entries = yield* fileSystem.readDirectory(runtimeHomesRoot);
      yield* Effect.forEach(
        entries.filter((entry) => legacyFhirRuntimeHomePattern.test(entry)),
        (entry) =>
          fileSystem.remove(path.join(runtimeHomesRoot, entry), {
            force: true,
            recursive: true,
          }),
      );
    }),
  );
};

export const computeBufferSha256 = (buffer: Uint8Array) =>
  createHash("sha256").update(buffer).digest("hex");

export const computeFileSha256 = Effect.fn("oracles.computeFileSha256")(
  function* (filePath: string) {
    const content = yield* fileSystem.readFile(filePath);
    return computeBufferSha256(content);
  },
);

const verifyFileHash = Effect.fn("oracles.verifyFileHash")(function* ({
  expectedSha256,
  filePath,
}: {
  expectedSha256?: string;
  filePath: string;
}) {
  if (!expectedSha256) {
    return;
  }

  const actualSha256 = yield* computeFileSha256(filePath);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `SHA-256 mismatch for ${filePath}: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }
});

const readAssetCacheManifest = Effect.fn("oracles.readAssetCacheManifest")(
  function* (cacheDir = getKbvOracleCacheDir()) {
    const manifestPath = getKbvOracleCacheManifestPath(cacheDir);
    if (!(yield* fileExists(manifestPath))) {
      return {} satisfies Record<string, KbvOracleAssetCacheEntry>;
    }

    const content = yield* fileSystem.readFileString(manifestPath);
    return yield* Schema.decodeUnknown(
      Schema.parseJson(AssetCacheManifestFields),
    )(content).pipe(
      Effect.catchAll(() =>
        Effect.succeed({} satisfies Record<string, KbvOracleAssetCacheEntry>),
      ),
    );
  },
);

const writeAssetCacheManifest = Effect.fn("oracles.writeAssetCacheManifest")(
  function* ({
    cacheDir,
    manifest,
  }: {
    cacheDir: string;
    manifest: Record<string, KbvOracleAssetCacheEntry>;
  }) {
    yield* fileSystem.makeDirectory(cacheDir, { recursive: true });
    const manifestPath = getKbvOracleCacheManifestPath(cacheDir);
    const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
    const manifestJson = yield* encodeJsonString(
      AssetCacheManifestFields,
      manifest,
    );
    yield* fileSystem.writeFileString(tempPath, manifestJson);
    yield* fileSystem.rename(tempPath, manifestPath);
  },
);

const updateAssetCacheManifest = Effect.fn("oracles.updateAssetCacheManifest")(
  function* ({
    asset,
    cacheDir,
    downloadPath,
    extractedPath,
  }: {
    asset: KbvOracleAsset;
    cacheDir: string;
    downloadPath: string;
    extractedPath?: string;
  }) {
    const manifest = { ...(yield* readAssetCacheManifest(cacheDir)) };
    manifest[asset.assetId] = {
      assetId: asset.assetId,
      downloadPath,
      fileName: asset.fileName,
      url: asset.url,
      ...(asset.sha256 ? { sha256: asset.sha256 } : {}),
      downloadedAt: new Date().toISOString(),
      ...(extractedPath ? { extractedPath } : {}),
    };
    yield* writeAssetCacheManifest({
      cacheDir,
      manifest,
    });
  },
);

export const getAssetCacheEntry = Effect.fn("oracles.getAssetCacheEntry")(
  function* ({
    assetId,
    cacheDir = getKbvOracleCacheDir(),
  }: {
    assetId: string;
    cacheDir?: string;
  }) {
    const manifest = yield* readAssetCacheManifest(cacheDir);
    return manifest[assetId];
  },
);

export const downloadManagedAsset = Effect.fn("oracles.downloadManagedAsset")(
  function* (asset: KbvOracleAsset, cacheDir = getKbvOracleCacheDir()) {
    const resolvedCacheDir = path.resolve(cacheDir);
    const downloadDir = path.join(resolvedCacheDir, "downloads");
    const downloadPath = path.join(downloadDir, asset.fileName);

    yield* fileSystem.makeDirectory(downloadDir, { recursive: true });

    if (yield* fileExists(downloadPath)) {
      const verifiedDownload = yield* verifyFileHash({
        expectedSha256: asset.sha256,
        filePath: downloadPath,
      }).pipe(
        Effect.zipRight(
          updateAssetCacheManifest({
            asset,
            cacheDir: resolvedCacheDir,
            downloadPath,
          }),
        ),
        Effect.as(downloadPath),
        Effect.catchAllCause(() =>
          fileSystem
            .remove(downloadPath, { force: true })
            .pipe(Effect.as(undefined)),
        ),
      );

      if (verifiedDownload) {
        return verifiedDownload;
      }
    }

    const response = yield* Effect.tryPromise(() => fetch(asset.url));
    if (!response.ok) {
      throw new Error(`Failed to download ${asset.url}: ${response.status}`);
    }

    const content = Buffer.from(
      yield* Effect.tryPromise(() => response.arrayBuffer()),
    );
    if (asset.sha256) {
      const actualSha256 = computeBufferSha256(content);
      if (actualSha256 !== asset.sha256) {
        throw new Error(
          `SHA-256 mismatch for ${asset.url}: expected ${asset.sha256}, got ${actualSha256}`,
        );
      }
    }

    const tempPath = path.join(
      downloadDir,
      `${asset.fileName}.${process.pid}.${Date.now()}.tmp`,
    );
    yield* fileSystem.writeFile(tempPath, content);
    yield* fileSystem.makeDirectory(path.dirname(downloadPath), {
      recursive: true,
    });
    yield* fileSystem.remove(downloadPath, { force: true });
    yield* fileSystem.writeFile(downloadPath, content);
    yield* fileSystem.remove(tempPath, { force: true });
    yield* updateAssetCacheManifest({
      asset,
      cacheDir: resolvedCacheDir,
      downloadPath,
    });
    return downloadPath;
  },
);

export const ensureExtractedAsset = Effect.fn("oracles.ensureExtractedAsset")(
  function* (asset: KbvOracleAsset, cacheDir = getKbvOracleCacheDir()) {
    const resolvedCacheDir = path.resolve(cacheDir);
    if (asset.extract !== true) {
      return yield* downloadManagedAsset(asset, resolvedCacheDir);
    }

    const extractDir = path.join(resolvedCacheDir, "extracted", asset.assetId);
    const markerPath = path.join(extractDir, ".ok");
    if (yield* fileExists(markerPath)) {
      return extractDir;
    }

    if (yield* fileExists(extractDir)) {
      const entries = yield* fileSystem.readDirectory(extractDir);
      const hasExtractedContent = entries.some((entry) => entry !== ".ok");
      if (hasExtractedContent) {
        yield* fileSystem.writeFileString(markerPath, "ok");
        return extractDir;
      }
    }

    const archivePath = yield* downloadManagedAsset(asset, resolvedCacheDir);

    yield* fileSystem.remove(extractDir, { force: true, recursive: true });
    yield* fileSystem.makeDirectory(extractDir, { recursive: true });

    const unzipResult = yield* Effect.tryPromise(() =>
      runCommand({
        args: ["-oq", archivePath, "-d", extractDir],
        command: "unzip",
      }),
    );
    if (unzipResult.exitCode !== 0) {
      throw new Error(
        `Failed to extract ${archivePath}: ${(unzipResult.stderr || unzipResult.stdout).trim()}`,
      );
    }

    yield* fileSystem.writeFileString(markerPath, "ok");
    yield* updateAssetCacheManifest({
      asset,
      cacheDir: resolvedCacheDir,
      downloadPath: archivePath,
      extractedPath: extractDir,
    });
    return extractDir;
  },
);

export const findFileRecursive: (
  rootDir: string,
  matcher: (entryPath: string) => boolean,
) => Effect.Effect<string | undefined, unknown, never> = Effect.fn(
  "oracles.findFileRecursive",
)(function* (rootDir: string, matcher: (entryPath: string) => boolean) {
  const entries = yield* fileSystem.readDirectory(rootDir);
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry);
    const entryStat = yield* fileSystem.stat(entryPath);
    if (entryStat.type === "Directory") {
      const nested = yield* findFileRecursive(entryPath, matcher);
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
});

const collectIgDirectories: (
  rootDir: string,
) => Effect.Effect<string[], unknown, never> = Effect.fn(
  "oracles.collectIgDirectories",
)(function* (rootDir: string) {
  const directories = new Set<string>();

  const visit: (currentDir: string) => Effect.Effect<void, unknown, never> =
    Effect.fn("oracles.collectIgDirectories.visit")(function* (
      currentDir: string,
    ) {
      const entries = yield* fileSystem.readDirectory(currentDir);
      let hasResourceLikeFiles = false;

      for (const entry of entries) {
        const entryPath = path.join(currentDir, entry);
        const entryStat = yield* fileSystem.stat(entryPath);

        if (entryStat.type === "Directory") {
          yield* visit(entryPath);
          continue;
        }

        if (
          entry.endsWith(".xml") ||
          entry.endsWith(".json") ||
          entry.endsWith(".map")
        ) {
          hasResourceLikeFiles = true;
        }
      }

      if (hasResourceLikeFiles) {
        directories.add(currentDir);
      }
    });

  yield* visit(rootDir);
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
});

export const ensureFhirValidatorAssets = Effect.fn(
  "oracles.ensureFhirValidatorAssets",
)(function* ({
  cacheDir = getKbvOracleCacheDir(),
  family,
}: {
  cacheDir?: string;
  family: "eAU" | "eRezept" | "eVDGA";
}) {
  const resolvedCacheDir = path.resolve(cacheDir);
  const cacheKey = `${family}:${resolvedCacheDir}`;
  return yield* withPromiseCache(
    fhirValidatorAssetsCache,
    cacheKey,
    Effect.gen(function* () {
      const serviceDir = yield* ensureExtractedAsset(
        kbvOracleAssets.fhirValidatorService_2_2_0,
        resolvedCacheDir,
      );
      const validatorJar = yield* findFileRecursive(
        serviceDir,
        (entryPath: string) =>
          entryPath.includes("validator_cli") && entryPath.endsWith(".jar"),
      );
      if (!validatorJar) {
        throw new Error(
          "validator_cli jar not found in extracted KBV validator service",
        );
      }

      const packageRoot =
        family === "eAU"
          ? yield* ensureExtractedAsset(
              kbvOracleAssets.kbvFhirEau_1_2_1,
              resolvedCacheDir,
            )
          : family === "eRezept"
            ? yield* ensureExtractedAsset(
                kbvOracleAssets.kbvFhirErp_1_4_1,
                resolvedCacheDir,
              )
            : path.resolve(
                KBV_MIRROR_ROOT,
                "DigitaleMuster/eVDGA/KBV_FHIR_eVDGA_V1.2.2_zur_Validierung.zip.extracted",
              );

      if (!(yield* fileExists(packageRoot))) {
        throw new Error(
          family === "eVDGA"
            ? "eVDGA validator package was not found in /Users/johannes/Code/kbv-mirror"
            : `FHIR validator package root for ${family} was not found`,
        );
      }

      const nestedIgPaths = (yield* collectIgDirectories(packageRoot)).filter(
        (entryPath) => entryPath !== packageRoot,
      );

      return {
        igPaths: [...nestedIgPaths, packageRoot],
        packageRoot,
        validatorJar,
      };
    }),
  );
});

export const ensureKvdtAssets = Effect.fn("oracles.ensureKvdtAssets")(
  function* ({ cacheDir = getKbvOracleCacheDir() }: { cacheDir?: string }) {
    const resolvedCacheDir = path.resolve(cacheDir);
    const xpmDir = yield* ensureExtractedAsset(
      kbvOracleAssets.xpmKvdtPraxis_2026_2_1,
      resolvedCacheDir,
    );
    const xkmDir = yield* ensureExtractedAsset(
      kbvOracleAssets.xkm_1_44_0,
      resolvedCacheDir,
    );
    const xkmPublicKeysDir = yield* ensureExtractedAsset(
      kbvOracleAssets.xkmPublicKeys_2026_02,
      resolvedCacheDir,
    );
    const xkmTestKeysDir = yield* ensureExtractedAsset(
      kbvOracleAssets.xkmTestKeys_2026_02,
      resolvedCacheDir,
    );
    const pruefassistentJar = yield* downloadManagedAsset(
      kbvOracleAssets.kbvPruefassistent_2026_2_1,
      resolvedCacheDir,
    );

    const xpmStartScript = yield* findFileRecursive(
      xpmDir,
      (entryPath: string) => entryPath.endsWith("StartPruefung.sh"),
    );
    const xkmStartScript = yield* findFileRecursive(
      xkmDir,
      (entryPath: string) => entryPath.endsWith("StartKryptomodul.sh"),
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
  },
);

export const ensureBmpAssets = Effect.fn("oracles.ensureBmpAssets")(function* ({
  cacheDir = getKbvOracleCacheDir(),
}: {
  cacheDir?: string;
}) {
  const resolvedCacheDir = path.resolve(cacheDir);
  const bmpDir = yield* ensureExtractedAsset(
    kbvOracleAssets.bmp_2_8_q3_2026,
    resolvedCacheDir,
  );
  const bmpExamplesDir = yield* ensureExtractedAsset(
    kbvOracleAssets.bmpExamples_2_8_q3_2026,
    resolvedCacheDir,
  );
  const bmpXsd = yield* findFileRecursive(bmpDir, (entryPath: string) =>
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
});

export const ensureTssAssets = Effect.fn("oracles.ensureTssAssets")(function* ({
  cacheDir = getKbvOracleCacheDir(),
}: {
  cacheDir?: string;
}) {
  const resolvedCacheDir = path.resolve(cacheDir);
  const responseExamplesDir = yield* ensureExtractedAsset(
    kbvOracleAssets.tssResponseExamples_7_2,
    resolvedCacheDir,
  );
  const vsdTestfaelleDir = yield* ensureExtractedAsset(
    kbvOracleAssets.tssVsdTestfaelle_2_0,
    resolvedCacheDir,
  );
  const testpatientXmlDir = yield* ensureExtractedAsset(
    kbvOracleAssets.tssTestpatientXml_2025_07_14,
    resolvedCacheDir,
  );

  return {
    responseExamplesDir,
    testpatientXmlDir,
    vsdTestfaelleDir,
  };
});

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
  path.join(
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
}) => path.join(getFhirPackageCacheRoot(cacheDir), `${packageId}#${version}`);

const ensureFhirPackageCacheMetadata = Effect.fn(
  "oracles.ensureFhirPackageCacheMetadata",
)(function* (cacheDir: string) {
  const packageCacheRoot = getFhirPackageCacheRoot(cacheDir);
  yield* fileSystem.makeDirectory(packageCacheRoot, { recursive: true });
  const packagesIniPath = path.join(packageCacheRoot, "packages.ini");

  if (!(yield* fileExists(packagesIniPath))) {
    yield* fileSystem.writeFileString(
      packagesIniPath,
      "[cache]\nversion = 3\n",
    );
  }

  return packageCacheRoot;
});

const areFhirPrerequisitesInstalled = Effect.fn(
  "oracles.areFhirPrerequisitesInstalled",
)(function* (cacheDir: string) {
  const packageChecks = yield* Effect.forEach(
    fhirValidatorPrerequisitePackages,
    (externalPackage) => {
      const installDir = getExternalFhirPackageInstallDir({
        cacheDir,
        packageId: externalPackage.packageId,
        version: externalPackage.version,
      });
      const packageJsonPath = path.join(installDir, "package", "package.json");
      return fileExists(packageJsonPath);
    },
  );

  return packageChecks.every(Boolean);
});

const writeFhirDependencyMarker = Effect.fn(
  "oracles.writeFhirDependencyMarker",
)(function* (cacheDir: string) {
  const markerPath = getFhirDependencyMarkerPath(cacheDir);
  const markerJson = yield* encodeJsonString(FhirDependencyMarkerFields, {
    prerequisites: fhirValidatorPrerequisitePackages.map(
      ({ packageId, version }) => ({
        packageId,
        version,
      }),
    ),
    writtenAt: new Date().toISOString(),
  });
  yield* fileSystem.writeFileString(markerPath, markerJson);
});

const downloadExternalFhirPackage = Effect.fn(
  "oracles.downloadExternalFhirPackage",
)(function* ({
  cacheDir,
  packageId,
  sha256,
  url,
  version,
}: ExternalFhirPackage & {
  cacheDir: string;
}) {
  const archivePath = getExternalFhirPackageArchivePath({
    cacheDir,
    packageId,
    version,
  });

  yield* fileSystem.makeDirectory(path.dirname(archivePath), {
    recursive: true,
  });

  if (yield* fileExists(archivePath)) {
    const verifiedArchivePath = yield* verifyFileHash({
      expectedSha256: sha256,
      filePath: archivePath,
    }).pipe(
      Effect.as(archivePath),
      Effect.catchAllCause(() =>
        fileSystem
          .remove(archivePath, { force: true })
          .pipe(Effect.as(undefined)),
      ),
    );

    if (verifiedArchivePath) {
      return verifiedArchivePath;
    }
  }

  const packageUrl =
    url ?? `https://packages2.fhir.org/web/${packageId}-${version}.tgz`;
  const response = yield* Effect.tryPromise(() => fetch(packageUrl));
  if (!response.ok) {
    throw new Error(`Failed to download ${packageUrl}: ${response.status}`);
  }

  const content = Buffer.from(
    yield* Effect.tryPromise(() => response.arrayBuffer()),
  );
  if (sha256) {
    const actualSha256 = computeBufferSha256(content);
    if (actualSha256 !== sha256) {
      throw new Error(
        `SHA-256 mismatch for ${packageUrl}: expected ${sha256}, got ${actualSha256}`,
      );
    }
  }

  yield* fileSystem.writeFile(archivePath, content);
  return archivePath;
});

export const ensureExternalFhirPackageInstalled: (
  args: ExternalFhirPackage & {
    cacheDir?: string;
  },
) => Effect.Effect<string, unknown, never> = Effect.fn(
  "oracles.ensureExternalFhirPackageInstalled",
)(function* ({
  cacheDir = getKbvOracleCacheDir(),
  packageId,
  sha256,
  url,
  version,
}: ExternalFhirPackage & {
  cacheDir?: string;
}) {
  const resolvedCacheDir = path.resolve(cacheDir);
  const installDir = getExternalFhirPackageInstallDir({
    cacheDir: resolvedCacheDir,
    packageId,
    version,
  });
  const packageJsonPath = path.join(installDir, "package", "package.json");

  yield* ensureFhirPackageCacheMetadata(resolvedCacheDir);

  if (!(yield* fileExists(packageJsonPath))) {
    const archivePath = yield* downloadExternalFhirPackage({
      cacheDir: resolvedCacheDir,
      packageId,
      sha256,
      url,
      version,
    });
    const extractDir = path.join(
      resolvedCacheDir,
      "fhir-package-cache",
      "extract",
      `${sanitizePackageId(packageId)}-${version}`,
    );
    yield* fileSystem.remove(extractDir, { force: true, recursive: true });
    yield* fileSystem.makeDirectory(extractDir, { recursive: true });
    const tarResult = yield* Effect.tryPromise(() =>
      runCommand({
        args: ["-xzf", archivePath, "-C", extractDir],
        command: "tar",
      }),
    );
    if (tarResult.exitCode !== 0) {
      throw new Error(
        `Failed to extract ${archivePath}: ${(tarResult.stderr || tarResult.stdout).trim()}`,
      );
    }
    yield* fileSystem.remove(installDir, { force: true, recursive: true });
    yield* fileSystem.makeDirectory(path.dirname(installDir), {
      recursive: true,
    });
    yield* fileSystem.copy(
      path.join(extractDir, "package"),
      path.join(installDir, "package"),
      { overwrite: true },
    );
  }

  const packageJson = yield* Effect.flatMap(
    fileSystem.readFileString(packageJsonPath),
    Schema.decodeUnknown(Schema.parseJson(PackageJsonFields)),
  );

  for (const [dependencyId, dependencyVersion] of Object.entries(
    packageJson.dependencies ?? {},
  )) {
    yield* ensureExternalFhirPackageInstalled({
      cacheDir: resolvedCacheDir,
      packageId: dependencyId,
      version: dependencyVersion,
    });
  }

  return installDir;
});

export const ensureFhirValidatorDependencyCache = Effect.fn(
  "oracles.ensureFhirValidatorDependencyCache",
)(function* ({ cacheDir = getKbvOracleCacheDir() }: { cacheDir?: string }) {
  const resolvedCacheDir = path.resolve(cacheDir);
  return yield* withPromiseCache(
    fhirValidatorDependencyCache,
    resolvedCacheDir,
    Effect.gen(function* () {
      yield* ensureFhirPackageCacheMetadata(resolvedCacheDir);
      if (yield* areFhirPrerequisitesInstalled(resolvedCacheDir)) {
        yield* writeFhirDependencyMarker(resolvedCacheDir);
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
        const installDir = yield* ensureExternalFhirPackageInstalled({
          ...externalPackage,
          cacheDir: resolvedCacheDir,
        });
        installedPackages.push({
          installDir,
          packageId: externalPackage.packageId,
          version: externalPackage.version,
        });
      }

      yield* writeFhirDependencyMarker(resolvedCacheDir);
      return installedPackages;
    }),
  );
});

export const ensureFhirValidatorRuntimeHome = Effect.fn(
  "oracles.ensureFhirValidatorRuntimeHome",
)(function* ({
  cacheDir = getKbvOracleCacheDir(),
  runtimeKey,
}: {
  cacheDir?: string;
  runtimeKey: string;
}) {
  const resolvedCacheDir = path.resolve(cacheDir);
  const cacheKey = `${resolvedCacheDir}:${runtimeKey}`;
  return yield* withPromiseCache(
    fhirValidatorRuntimeHomeCache,
    cacheKey,
    Effect.gen(function* () {
      yield* pruneLegacyFhirRuntimeHomes(resolvedCacheDir);
      yield* ensureFhirValidatorDependencyCache({
        cacheDir: resolvedCacheDir,
      });

      const sharedPackageCacheRoot = getFhirPackageCacheRoot(resolvedCacheDir);
      const runtimeHomeRoot = getFhirRuntimeHomeRoot({
        cacheDir: resolvedCacheDir,
        runtimeKey,
      });
      const runtimePackageCacheRoot = path.join(
        runtimeHomeRoot,
        ".fhir",
        "packages",
      );
      const markerPath = path.join(runtimeHomeRoot, ".kbv-runtime-ready");

      if (yield* fileExists(markerPath)) {
        return runtimeHomeRoot;
      }

      yield* fileSystem.remove(runtimeHomeRoot, {
        force: true,
        recursive: true,
      });
      yield* fileSystem.makeDirectory(path.join(runtimeHomeRoot, ".fhir"), {
        recursive: true,
      });
      yield* fileSystem.copy(sharedPackageCacheRoot, runtimePackageCacheRoot, {
        overwrite: true,
      });
      const markerJson = yield* encodeJsonString(FhirRuntimeHomeMarkerFields, {
        createdAt: new Date().toISOString(),
        runtimeKey,
        sharedPackageCacheRoot,
      });
      yield* fileSystem.writeFileString(markerPath, markerJson);

      return runtimeHomeRoot;
    }),
  );
});

export const prefetchKbvOracleAssets = Effect.fn(
  "oracles.prefetchKbvOracleAssets",
)(function* ({
  assetIds,
  cacheDir = getKbvOracleCacheDir(),
}: {
  assetIds?: readonly (keyof typeof kbvOracleAssets)[];
  cacheDir?: string;
}) {
  const resolvedCacheDir = path.resolve(cacheDir);
  const selectedAssetIds =
    assetIds ??
    (Object.keys(kbvOracleAssets) as (keyof typeof kbvOracleAssets)[]);
  const results = [];

  for (const assetId of selectedAssetIds) {
    const asset = kbvOracleAssets[assetId];
    const assetPath =
      "extract" in asset && asset.extract
        ? yield* ensureExtractedAsset(asset, resolvedCacheDir)
        : yield* downloadManagedAsset(asset, resolvedCacheDir);
    results.push({
      assetId,
      path: assetPath,
    });
  }

  return results;
});

export const cloneAssetWorkspace = Effect.fn("oracles.cloneAssetWorkspace")(
  function* ({
    sourceDir,
    targetDir,
  }: {
    sourceDir: string;
    targetDir: string;
  }) {
    yield* fileSystem.remove(targetDir, { force: true, recursive: true });
    yield* fileSystem.makeDirectory(path.dirname(targetDir), {
      recursive: true,
    });
    yield* fileSystem.copy(sourceDir, targetDir, { overwrite: true });
    return targetDir;
  },
);
