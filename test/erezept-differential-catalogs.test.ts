import { describe, it } from "@effect/vitest";
import { Effect } from "effect";

import type { ErpEmitterCase } from "./overnight/erezept-oracle-helpers";

import {
  runExecutableFhirValidationBatchEffect,
  runFhirOracle,
  toBatchValidationSourcePathKey,
} from "../tools/oracles/fhir/run";
import { fileSystem, path } from "../tools/oracles/platform";
import { assertExpectedComparisonEffect } from "./erezept-differential-shared";
import { resolveOracleTestCache } from "./oracle-test-cache";
import {
  emittedMismatchMutations,
  emittedParityMutations,
  loadOfficialErpExampleXmlEffect,
  officialMismatchMutations,
  officialParityMutations,
  renderGeneratedErpXmlEffect,
} from "./overnight/erezept-oracle-helpers";
import { ORACLE_TEST_TIMEOUT } from "./timeouts";

const representativePznCase: ErpEmitterCase = {
  authoredOn: "2026-03-10T09:05:00.000Z",
  dosageText: "1-0-1",
  medicationDisplay: "Diclofenac Test",
  orderKind: "pzn",
  patientFamily: "Keller",
  patientGiven: "Lina",
  pzn: "99999993",
};

const representativeFreetextCase: ErpEmitterCase = {
  authoredOn: "2026-03-10T09:05:00.000Z",
  dosageText: "1 Tablette morgens",
  medicationDisplay: "Rezeptur Salbe 2%",
  orderKind: "freetext",
  patientFamily: "Meyer",
  patientGiven: "Eva",
};

const assertDifferentialCatalogBatchEffect = ({
  cacheDir,
  cases,
  scenario,
}: {
  cacheDir: string;
  cases: readonly {
    baseXml: string;
    lanePayload:
      | {
          input: ErpEmitterCase;
          mutation: (typeof emittedMismatchMutations)[number];
          sourceKind: "emitted";
        }
      | {
          mutation: (typeof emittedParityMutations)[number];
          sourceKind: "official";
        };
  }[];
  scenario: string;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const tempDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "kbv-erp-diff-catalog-",
      });
      const preparedCases = yield* Effect.forEach(cases, (testCase, index) =>
        Effect.gen(function* () {
          const mutatedXml = testCase.lanePayload.mutation.mutate(
            testCase.baseXml,
          );
          const xmlPath = path.join(
            tempDir,
            `${String(index).padStart(2, "0")}-${testCase.lanePayload.mutation.id}.xml`,
          );
          yield* fileSystem.writeFileString(xmlPath, mutatedXml);

          return {
            lanePayload: testCase.lanePayload,
            localResult: runFhirOracle({
              family: "eRezept",
              xml: mutatedXml,
            }),
            mutation: testCase.lanePayload.mutation,
            xmlPath,
          } as const;
        }),
      );

      const result = yield* runExecutableFhirValidationBatchEffect({
        cacheDir,
        family: "eRezept",
        xmlPaths: preparedCases.map((testCase) => testCase.xmlPath),
      });
      const summaries = new Map(
        result.summaries.map((summary) => [
          toBatchValidationSourcePathKey(summary.sourcePath),
          summary,
        ]),
      );

      for (const testCase of preparedCases) {
        const summary = summaries.get(
          toBatchValidationSourcePathKey(testCase.xmlPath),
        );
        if (!summary) {
          throw new Error(
            [
              `Missing batch summary for ${testCase.mutation.id}.`,
              `path=${testCase.xmlPath}`,
              `stdout=${result.stdout}`,
              `stderr=${result.stderr}`,
            ].join("\n"),
          );
        }

        yield* assertExpectedComparisonEffect({
          executableResult: {
            family: "eRezept",
            findings: [],
            passed: summary.passed,
            summary: summary.summaryLine,
          },
          lanePayload: testCase.lanePayload,
          localResult: testCase.localResult,
          mutation: testCase.mutation,
          scenario,
        });
      }
    }),
  );

describe("eRezept differential mutation catalogs", () => {
  it.effect(
    "keeps the declared official ERP differential mutation catalog classified as expected",
    () =>
      Effect.gen(function* () {
        const { cacheDir } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-erp-diff-official-catalog-",
        });

        const baseXml = yield* loadOfficialErpExampleXmlEffect(cacheDir);
        yield* assertDifferentialCatalogBatchEffect({
          cacheDir,
          cases: [...officialParityMutations, ...officialMismatchMutations].map(
            (mutation) => ({
              baseXml,
              lanePayload: {
                mutation,
                sourceKind: "official" as const,
              },
            }),
          ),
          scenario: "official-catalog-case",
        });
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "keeps the declared emitted ERP differential mutation catalog classified as expected for representative PZN and freetext bundles",
    () =>
      Effect.gen(function* () {
        const { cacheDir } = yield* resolveOracleTestCache({
          assetIds: [
            "fhirValidatorService_2_2_0",
            "kbvErpExamples_1_4",
            "kbvFhirErp_1_4_1",
          ],
          needsFhirDependencies: true,
          tempPrefix: "kbv-erp-diff-emitted-catalog-",
        });

        const emittedCases = [
          representativePznCase,
          representativeFreetextCase,
        ] as const;
        const mutations = [
          ...emittedParityMutations,
          ...emittedMismatchMutations,
        ] as const;

        const cases = [];
        for (const input of emittedCases) {
          const baseXml = (yield* renderGeneratedErpXmlEffect(input)).xml;
          for (const mutation of mutations) {
            cases.push({
              baseXml,
              lanePayload: {
                input,
                mutation,
                sourceKind: "emitted" as const,
              },
            });
          }
        }

        yield* assertDifferentialCatalogBatchEffect({
          cacheDir,
          cases,
          scenario: "emitted-catalog-case",
        });
      }),
    ORACLE_TEST_TIMEOUT,
  );
});
