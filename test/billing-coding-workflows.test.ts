import type { GenericId as Id } from "convex/values";

import { GenericId } from "@confect/core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { DatabaseWriter } from "../confect/_generated/services";
import { refs } from "../confect/refs";
import { provideTestConfect, TestConfect } from "./TestConfect";

const seedOrganization = () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const organizationId = yield* writer.table("organizations").insert({
      active: true,
      addresses: [
        {
          city: "Hamburg",
          line1: "Praxisweg 1",
          postalCode: "20095",
        },
      ],
      identifiers: [],
      kind: "practice",
      name: "Praxis Test",
      sourceStamp: {
        capturedAt: "2026-03-10T08:00:00.000Z",
        sourceKind: "manual",
      },
      telecom: [],
    });

    return { organizationId };
  });

const seedStorageId = "seed;_storage" as Id<"_storage">;

describe("billing and coding workflows", () => {
  it.effect(
    "imports ICD data, creates a billing case, and prepares a KVDT-ready view",
    () =>
      Effect.gen(function* () {
        const result = yield* provideTestConfect(
          Effect.gen(function* () {
            const test = yield* TestConfect;

            const { organizationId } = yield* test.run(
              seedOrganization(),
              Schema.Struct({
                organizationId: GenericId.GenericId("organizations"),
              }),
            );

            const patient = yield* test.mutation(
              refs.public.patients.createManual,
              {
                patient: {
                  addresses: [],
                  administrativeGender: {
                    code: "female",
                    system: "urn:gender",
                  },
                  birthDate: "1988-04-12",
                  capturedAt: "2026-03-10T09:00:00.000Z",
                  names: [
                    {
                      family: "Export",
                      given: ["Eva"],
                      prefixes: [],
                    },
                  ],
                  preferredLanguages: [],
                  telecom: [],
                },
              },
            );

            const pkg = yield* test.mutation(
              refs.public.coding.registerMasterDataPackage,
              {
                artifact: {
                  byteSize: 1,
                  contentType: "application/zip",
                  sha256: "deadbeef",
                  storageId: seedStorageId,
                },
                family: "SDICD",
                importedAt: "2026-03-10T09:01:00.000Z",
                sourcePath: "fixtures/sdicd",
                status: "active",
                version: "2026.1",
              },
            );

            yield* test.mutation(refs.public.coding.importIcdCatalogEntries, {
              entries: [
                {
                  code: "A00.0",
                  isBillable: true,
                  text: "Cholera due to Vibrio cholerae 01, biovar cholerae",
                },
              ],
              sourcePackageId: pkg.packageId,
            });

            const billingCase = yield* test.mutation(
              refs.public.billing.createCase,
              {
                organizationId,
                patientId: patient.patientId,
                quarter: "2026Q1",
                status: "open",
                tssRelevant: false,
              },
            );

            const diagnosis = yield* test.mutation(
              refs.public.coding.createDiagnosis,
              {
                billingCaseId: billingCase.billingCaseId,
                category: "acute",
                createdAt: "2026-03-10T09:05:00.000Z",
                icd10gm: {
                  code: "A00.0",
                  display: "Cholera",
                  system: "urn:icd10gm",
                },
                icdCode: "A00.0",
                isPrimary: true,
                patientId: patient.patientId,
              },
            );

            yield* test.mutation(refs.public.billing.addLineItem, {
              billingCaseId: billingCase.billingCaseId,
              chargeCode: "03000",
              chargeCodeSystem: "EBM",
              diagnosisIds: [diagnosis.diagnosisId],
              modifierCodes: [],
              originKind: "manual",
              quantity: 1,
              serviceDate: "2026-03-10",
            });

            const kvdtView = yield* test.query(
              refs.public.billing.getKvdtCaseView,
              {
                billingCaseId: billingCase.billingCaseId,
              },
            );

            const prepared = yield* test.mutation(
              refs.public.billing.prepareKvdtExport,
              {
                billingCaseId: billingCase.billingCaseId,
              },
            );

            const billingCases = yield* test.query(
              refs.public.billing.listCases,
              {
                patientId: patient.patientId,
                quarter: "2026Q1",
              },
            );

            return {
              billingCases,
              diagnosis,
              kvdtView,
              prepared,
            };
          }),
        );

        expect(result.diagnosis.evaluationIds).toHaveLength(0);
        expect(result.kvdtView.found).toBe(true);
        if (!result.kvdtView.found) {
          throw new Error("expected KVDT case view");
        }
        expect(result.kvdtView.exportReady).toBe(true);
        expect(result.kvdtView.issues).toHaveLength(0);
        expect(result.kvdtView.lineItems).toHaveLength(1);
        expect(result.prepared.outcome).toBe("ready");
        expect(result.billingCases).toHaveLength(1);
        expect(result.billingCases[0]?.status).toBe("ready-for-export");
      }),
  );

  it.effect(
    "persists blocking SDICD evaluations when a diagnosis violates catalog constraints",
    () =>
      Effect.gen(function* () {
        const result = yield* provideTestConfect(
          Effect.gen(function* () {
            const test = yield* TestConfect;
            const patient = yield* test.mutation(
              refs.public.patients.createManual,
              {
                patient: {
                  addresses: [],
                  administrativeGender: {
                    code: "male",
                    system: "urn:gender",
                  },
                  birthDate: "1990-01-01",
                  capturedAt: "2026-03-10T10:00:00.000Z",
                  names: [
                    {
                      family: "Mismatch",
                      given: ["Max"],
                      prefixes: [],
                    },
                  ],
                  preferredLanguages: [],
                  telecom: [],
                },
              },
            );

            const pkg = yield* test.mutation(
              refs.public.coding.registerMasterDataPackage,
              {
                artifact: {
                  byteSize: 1,
                  contentType: "application/zip",
                  sha256: "feedface",
                  storageId: seedStorageId,
                },
                family: "SDICD",
                importedAt: "2026-03-10T10:01:00.000Z",
                sourcePath: "fixtures/sdicd",
                status: "active",
                version: "2026.2",
              },
            );

            yield* test.mutation(refs.public.coding.importIcdCatalogEntries, {
              entries: [
                {
                  code: "B99.9",
                  genderConstraint: "female",
                  genderErrorType: "error",
                  isBillable: true,
                  text: "Test gender-bound diagnosis",
                },
              ],
              sourcePackageId: pkg.packageId,
            });

            const diagnosis = yield* test.mutation(
              refs.public.coding.createDiagnosis,
              {
                category: "acute",
                createdAt: "2026-03-10T10:05:00.000Z",
                icd10gm: {
                  code: "B99.9",
                  system: "urn:icd10gm",
                },
                icdCode: "B99.9",
                patientId: patient.patientId,
              },
            );

            const evaluations = yield* test.query(
              refs.public.coding.listEvaluationsByDiagnosis,
              {
                diagnosisId: diagnosis.diagnosisId,
              },
            );

            return {
              diagnosis,
              evaluations,
            };
          }),
        );

        expect(result.diagnosis.evaluationIds.length).toBeGreaterThan(0);
        expect(
          result.evaluations.some(
            (evaluation) => evaluation.ruleCode === "SDICD_GENDER_MISMATCH",
          ),
        ).toBe(true);
        expect(
          result.evaluations.some((evaluation) => evaluation.blocking),
        ).toBe(true);
      }),
  );

  it.effect(
    "blocks KVDT preparation when coding evaluations contain blocking errors",
    () =>
      Effect.gen(function* () {
        const result = yield* provideTestConfect(
          Effect.gen(function* () {
            const test = yield* TestConfect;
            const { organizationId } = yield* test.run(
              seedOrganization(),
              Schema.Struct({
                organizationId: GenericId.GenericId("organizations"),
              }),
            );

            const patient = yield* test.mutation(
              refs.public.patients.createManual,
              {
                patient: {
                  addresses: [],
                  capturedAt: "2026-03-10T11:00:00.000Z",
                  names: [
                    {
                      family: "Blocked",
                      given: ["Berta"],
                      prefixes: [],
                    },
                  ],
                  preferredLanguages: [],
                  telecom: [],
                },
              },
            );

            const billingCase = yield* test.mutation(
              refs.public.billing.createCase,
              {
                organizationId,
                patientId: patient.patientId,
                quarter: "2026Q1",
                status: "open",
                tssRelevant: false,
              },
            );

            const diagnosis = yield* test.mutation(
              refs.public.coding.createDiagnosis,
              {
                billingCaseId: billingCase.billingCaseId,
                category: "acute",
                createdAt: "2026-03-10T11:05:00.000Z",
                icd10gm: {
                  code: "UNKNOWN.CODE",
                  system: "urn:icd10gm",
                },
                icdCode: "UNKNOWN.CODE",
                patientId: patient.patientId,
              },
            );

            yield* test.mutation(refs.public.billing.addLineItem, {
              billingCaseId: billingCase.billingCaseId,
              chargeCode: "03000",
              chargeCodeSystem: "EBM",
              diagnosisIds: [diagnosis.diagnosisId],
              modifierCodes: [],
              originKind: "manual",
              quantity: 1,
              serviceDate: "2026-03-10",
            });

            const prepared = yield* test.mutation(
              refs.public.billing.prepareKvdtExport,
              {
                billingCaseId: billingCase.billingCaseId,
              },
            );

            const kvdtView = yield* test.query(
              refs.public.billing.getKvdtCaseView,
              {
                billingCaseId: billingCase.billingCaseId,
              },
            );

            return {
              kvdtView,
              prepared,
            };
          }),
        );

        expect(result.prepared.outcome).toBe("blocked");
        expect(result.kvdtView.found).toBe(true);
        if (!result.kvdtView.found) {
          throw new Error("expected KVDT case view");
        }
        expect(result.kvdtView.exportReady).toBe(false);
        expect(
          result.kvdtView.issues.some(
            (issue) => issue.code === "SDICD_CODE_UNKNOWN",
          ),
        ).toBe(true);
      }),
  );
});
