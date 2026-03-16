import { describe, it } from "@effect/vitest";
import { Effect } from "effect";

import type { ErpEmitterCase } from "./overnight/erezept-oracle-helpers";

import { runExecutableFhirOracleEffect } from "../tools/oracles/fhir/run";
import { assertDifferentialClassificationEffect } from "./erezept-differential-shared";
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
        for (const mutation of [
          ...officialParityMutations,
          ...officialMismatchMutations,
        ]) {
          yield* assertDifferentialClassificationEffect({
            baseXml,
            cacheDir,
            execute: runExecutableFhirOracleEffect,
            lanePayload: {
              mutation,
              sourceKind: "official",
            },
            scenario: "official-catalog-case",
          });
        }
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

        for (const input of emittedCases) {
          const baseXml = (yield* renderGeneratedErpXmlEffect(input)).xml;
          for (const mutation of mutations) {
            yield* assertDifferentialClassificationEffect({
              baseXml,
              cacheDir,
              execute: runExecutableFhirOracleEffect,
              lanePayload: {
                input,
                mutation,
                sourceKind: "emitted",
              },
              scenario: "emitted-catalog-case",
            });
          }
        }
      }),
    ORACLE_TEST_TIMEOUT,
  );
});
