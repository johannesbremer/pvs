import { afterEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import fc from "fast-check";

import { ensureExtractedAsset, kbvOracleAssets } from "../tools/oracles/assets";
import {
  reconcileBatchValidationSummarySourcePaths,
  runExecutableFhirOracleEffect,
  runFhirOracle,
  toBatchValidationSourcePathKey,
} from "../tools/oracles/fhir/run";
import { fileSystem, path, runEffect } from "../tools/oracles/platform";
import { resolveOracleTestCache } from "./oracle-test-cache";
import { ORACLE_PROPERTY_NUM_RUNS, ORACLE_TEST_TIMEOUT } from "./timeouts";

const tempDirs: string[] = [];

afterEach(() =>
  runEffect(
    Effect.forEach(tempDirs.splice(0), (tempDir) =>
      fileSystem.remove(tempDir, { force: true, recursive: true }),
    ),
  ),
);

describe("executable FHIR oracle", () => {
  it.effect(
    "normalizes batch validation source paths so accented filenames match across platforms",
    () =>
      Effect.sync(() => {
        const macStyle = "/tmp/Beispiel_69_Kombipra\u0308parat.xml";
        const linuxStyle = "/tmp/Beispiel_69_Kombipr\u00E4parat.xml";

        expect(macStyle).not.toBe(linuxStyle);
        expect(toBatchValidationSourcePathKey(macStyle)).toBe(
          toBatchValidationSourcePathKey(linuxStyle),
        );
      }),
  );

  it.effect(
    "reconciles batch validation summary paths against the original input order",
    () =>
      Effect.sync(() => {
        const xmlPaths = ["/tmp/Beispiel_69_Kombipr\u00E4parat.xml"];

        const summaries = reconcileBatchValidationSummarySourcePaths({
          summaries: [
            {
              errorCount: 0,
              noteCount: 5,
              passed: true,
              rawSection: "Success: 0 errors, 9 warnings, 5 notes",
              sourcePath: "/tmp/Beispiel_69_Kombipr\uFFC3\uFFA4parat.xml",
              summaryLine: "Success: 0 errors, 9 warnings, 5 notes",
              warningCount: 9,
            },
          ],
          xmlPaths,
        });

        expect(summaries[0]?.sourcePath).toBe(
          toBatchValidationSourcePathKey(xmlPaths[0]),
        );
      }),
  );

  it.effect(
    "validates an official KBV eAU example with reusable validator assets",
    () =>
      Effect.gen(function* () {
        const { cacheDir, usesSharedCache } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvEauExamples_1_2",
            "kbvFhirEau_1_2_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-fhir-exec-test-",
        });
        if (!usesSharedCache) {
          tempDirs.push(cacheDir);
        }

        const examplesDir = yield* ensureExtractedAsset(
          kbvOracleAssets.kbvEauExamples_1_2,
          cacheDir,
        );
        const exampleXml = yield* fileSystem.readFileString(
          path.join(
            examplesDir,
            "EEAU0_3f6e664d-2bfc-4eb7-9dc1-29ab73259e92.xml",
          ),
        );

        const result = yield* runExecutableFhirOracleEffect({
          cacheDir,
          family: "eAU",
          xml: exampleXml,
        });

        expect(
          result.passed,
          `Executable eRezept validation should pass.\n${JSON.stringify(result, null, 2)}`,
        ).toBe(true);
        expect(
          result.findings.filter((finding) => finding.severity === "error"),
        ).toHaveLength(0);
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "validates an official KBV eRezept rendered-dosage example with reusable validator assets",
    () =>
      Effect.gen(function* () {
        const { cacheDir, usesSharedCache } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-fhir-erp-test-",
        });
        if (!usesSharedCache) {
          tempDirs.push(cacheDir);
        }

        const examplesDir = yield* ensureExtractedAsset(
          kbvOracleAssets.kbvErpExamples_1_4,
          cacheDir,
        );
        const exampleXml = yield* fileSystem.readFileString(
          path.join(examplesDir, "Beispiel_19.xml"),
        );

        const result = yield* runExecutableFhirOracleEffect({
          cacheDir,
          family: "eRezept",
          xml: exampleXml,
        });

        expect(result.passed).toBe(true);
        expect(
          result.findings.filter((finding) => finding.severity === "error"),
        ).toHaveLength(0);
      }),
    ORACLE_TEST_TIMEOUT,
  );

  for (const mutation of erpRequiredResourceMutations) {
    it.effect(
      `rejects eRezept required resource corruption ${mutation.id}`,
      () =>
        Effect.gen(function* () {
          const { cacheDir, usesSharedCache } = yield* resolveOracleTestCache({
            assetIds: [
              "fhirValidatorService_2_2_0",
              "kbvErpExamples_1_4",
              "kbvFhirErp_1_4_1",
            ],
            needsFhirDependencies: true,
            tempPrefix: "kbv-fhir-erp-prop-test-",
          });
          if (!usesSharedCache) {
            tempDirs.push(cacheDir);
          }

          const exampleXml = yield* loadErpExampleXmlEffect(cacheDir);

          yield* Effect.tryPromise(() =>
            fc.assert(
              fc.asyncProperty(fc.constant(null), () =>
                Effect.runPromise(
                  Effect.gen(function* () {
                    // Arrange
                    const mutatedXml = mutation.mutate(exampleXml);

                    // Act
                    const localResult = runFhirOracle({
                      family: "eRezept",
                      xml: mutatedXml,
                    });
                    const executableResult =
                      yield* runExecutableFhirOracleEffect({
                        cacheDir,
                        family: "eRezept",
                        xml: mutatedXml,
                      });

                    // Assert
                    expect(localResult.passed).toBe(false);
                    expect(
                      localResult.findings.some(
                        (finding) =>
                          finding.code === mutation.expectedLocalCode,
                      ),
                    ).toBe(true);
                    expect(
                      executableResult.passed,
                      `Executable oracle unexpectedly accepted ${mutation.id}.\n${JSON.stringify(executableResult, null, 2)}`,
                    ).toBe(false);
                  }),
                ),
              ),
              { numRuns: ORACLE_PROPERTY_NUM_RUNS },
            ),
          );
        }),
      ORACLE_TEST_TIMEOUT,
    );
  }

  for (const mutation of erpExecutableMutations) {
    it.effect(
      `rejects executable eRezept corruption ${mutation.id}`,
      () =>
        Effect.gen(function* () {
          const { cacheDir, usesSharedCache } = yield* resolveOracleTestCache({
            assetIds: [
              "fhirValidatorService_2_2_0",
              "kbvErpExamples_1_4",
              "kbvFhirErp_1_4_1",
            ],
            needsFhirDependencies: true,
            tempPrefix: "kbv-fhir-erp-java-prop-test-",
          });
          if (!usesSharedCache) {
            tempDirs.push(cacheDir);
          }

          const exampleXml = yield* loadErpExampleXmlEffect(cacheDir);

          yield* Effect.tryPromise(() =>
            fc.assert(
              fc.asyncProperty(fc.constant(null), () =>
                Effect.runPromise(
                  Effect.gen(function* () {
                    // Arrange
                    const mutatedXml = mutation.mutate(exampleXml);

                    // Act
                    const executableResult =
                      yield* runExecutableFhirOracleEffect({
                        cacheDir,
                        family: "eRezept",
                        xml: mutatedXml,
                      });

                    // Assert
                    expect(
                      executableResult.passed,
                      `Executable oracle unexpectedly accepted ${mutation.id}.\n${JSON.stringify(executableResult, null, 2)}`,
                    ).toBe(false);
                  }),
                ),
              ),
              { numRuns: ORACLE_PROPERTY_NUM_RUNS },
            ),
          );
        }),
      ORACLE_TEST_TIMEOUT,
    );
  }
});

// Helpers

type ExecutableErpMutation = {
  readonly id: string;
  readonly mutate: (xml: string) => string;
};
type RequiredErpMutation = {
  readonly expectedLocalCode: string;
  readonly id: string;
  readonly mutate: (xml: string) => string;
};

const erpExecutableMutations: readonly ExecutableErpMutation[] = [
  {
    id: "missing-bundle-tag",
    mutate: (xml) => removeRequiredTag(xml, "Bundle", "Missing"),
  },
  {
    id: "missing-composition-tag",
    mutate: (xml) => removeRequiredTag(xml, "Composition", "Missing"),
  },
  {
    id: "invalid-composition-profile",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Composition|1.4",
        "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Composition_Broken|1.4",
      ),
  },
  {
    id: "invalid-prescription-profile",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Prescription|1.4",
        "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Prescription_Broken|1.4",
      ),
  },
  {
    id: "broken-medication-reference",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        "http://pvs.praxis.local/fhir/Medication/a3ccc266-b033-47cc-9361-98ec450f7db9",
        "http://pvs.praxis.local/fhir/Medication/does-not-exist",
      ),
  },
  {
    id: "broken-coverage-reference",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        "http://pvs.praxis.local/fhir/Coverage/da80211e-61ee-458e-a651-87370b6ec30c",
        "http://pvs.praxis.local/fhir/Coverage/does-not-exist",
      ),
  },
];

// The official executable validator currently accepts a mutated ERP Bundle
// profile on Beispiel_19.xml, so we only keep mutations here that are
// observed to produce executable validation errors.

const erpRequiredResourceMutations: readonly RequiredErpMutation[] = [
  {
    expectedLocalCode: "FHIR_TAG_BUNDLE_MISSING",
    id: "missing-bundle-tag",
    mutate: (xml) => removeRequiredTag(xml, "Bundle", "Missing"),
  },
  {
    expectedLocalCode: "FHIR_TAG_BUNDLE_MISSING",
    id: "broken-bundle-tag",
    mutate: (xml) => removeRequiredTag(xml, "Bundle", "Broken"),
  },
  {
    expectedLocalCode: "FHIR_TAG_BUNDLE_MISSING",
    id: "removed-bundle-tag",
    mutate: (xml) => removeRequiredTag(xml, "Bundle", "Removed"),
  },
  {
    expectedLocalCode: "FHIR_TAG_COMPOSITION_MISSING",
    id: "missing-composition-tag",
    mutate: (xml) => removeRequiredTag(xml, "Composition", "Missing"),
  },
  {
    expectedLocalCode: "FHIR_TAG_COMPOSITION_MISSING",
    id: "broken-composition-tag",
    mutate: (xml) => removeRequiredTag(xml, "Composition", "Broken"),
  },
  {
    expectedLocalCode: "FHIR_TAG_COMPOSITION_MISSING",
    id: "removed-composition-tag",
    mutate: (xml) => removeRequiredTag(xml, "Composition", "Removed"),
  },
];

const loadErpExampleXmlEffect = (cacheDir: string) =>
  Effect.gen(function* () {
    const examplesDir = yield* ensureExtractedAsset(
      kbvOracleAssets.kbvErpExamples_1_4,
      cacheDir,
    );
    return yield* fileSystem.readFileString(
      path.join(examplesDir, "Beispiel_19.xml"),
    );
  });

const removeRequiredTag = (
  xml: string,
  tagName: "Bundle" | "Composition",
  replacementPrefix: string,
) => {
  const tagPattern = new RegExp(`<${tagName}(?=[\\s>])`, "g");

  if (!tagPattern.test(xml)) {
    throw new Error(`expected official eRezept XML to contain <${tagName}`);
  }

  return xml.replace(tagPattern, `<${replacementPrefix}${tagName}`);
};

const replaceRequiredSubstring = (
  xml: string,
  expected: string,
  replacement: string,
) => {
  if (!xml.includes(expected)) {
    throw new Error(`expected official eRezept XML to contain ${expected}`);
  }

  return xml.replace(expected, replacement);
};
