import { GenericId } from "@confect/core";
import { Schema, Effect } from "effect";
import type { GenericId as Id } from "convex/values";
import { describe, expect, it } from "vitest";

import { refs } from "../confect/refs";
import { DatabaseWriter } from "../confect/_generated/services";
import { runWithTestConfect, TestConfect } from "./TestConfect";

const seedOrganization = () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const organizationId = yield* writer.table("organizations").insert({
      active: true,
      kind: "practice",
      name: "Praxis Test",
      identifiers: [],
      addresses: [
        {
          line1: "Praxisweg 1",
          postalCode: "20095",
          city: "Hamburg",
        },
      ],
      telecom: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-10T08:00:00.000Z",
      },
    });

    return { organizationId };
  });

const seedStorageId = "seed;_storage" as Id<"_storage">;

describe("billing and coding workflows", () => {
  it("imports ICD data, creates a billing case, and prepares a KVDT-ready view", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const { organizationId } = yield* test.run(
          seedOrganization(),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
          }),
        );

        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Export",
                prefixes: [],
                given: ["Eva"],
              },
            ],
            birthDate: "1988-04-12",
            administrativeGender: {
              system: "urn:gender",
              code: "female",
            },
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T09:00:00.000Z",
          },
        });

        const pkg = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            family: "SDICD",
            version: "2026.1",
            sourcePath: "fixtures/sdicd",
            artifact: {
              storageId: seedStorageId,
              contentType: "application/zip",
              byteSize: 1,
              sha256: "deadbeef",
            },
            importedAt: "2026-03-10T09:01:00.000Z",
            status: "active",
          },
        );

        yield* test.mutation(refs.public.coding.importIcdCatalogEntries, {
          sourcePackageId: pkg.packageId,
          entries: [
            {
              code: "A00.0",
              text: "Cholera due to Vibrio cholerae 01, biovar cholerae",
              isBillable: true,
            },
          ],
        });

        const billingCase = yield* test.mutation(refs.public.billing.createCase, {
          patientId: patient.patientId,
          organizationId,
          quarter: "2026Q1",
          tssRelevant: false,
          status: "open",
        });

        const diagnosis = yield* test.mutation(refs.public.coding.createDiagnosis, {
          patientId: patient.patientId,
          billingCaseId: billingCase.billingCaseId,
          icdCode: "A00.0",
          icd10gm: {
            system: "urn:icd10gm",
            code: "A00.0",
            display: "Cholera",
          },
          category: "acute",
          isPrimary: true,
          createdAt: "2026-03-10T09:05:00.000Z",
        });

        yield* test.mutation(refs.public.billing.addLineItem, {
          billingCaseId: billingCase.billingCaseId,
          chargeCodeSystem: "EBM",
          chargeCode: "03000",
          serviceDate: "2026-03-10",
          quantity: 1,
          diagnosisIds: [diagnosis.diagnosisId],
          modifierCodes: [],
          originKind: "manual",
        });

        const kvdtView = yield* test.query(refs.public.billing.getKvdtCaseView, {
          billingCaseId: billingCase.billingCaseId,
        });

        const prepared = yield* test.mutation(
          refs.public.billing.prepareKvdtExport,
          {
            billingCaseId: billingCase.billingCaseId,
          },
        );

        const billingCases = yield* test.query(refs.public.billing.listCases, {
          patientId: patient.patientId,
          quarter: "2026Q1",
        });

        return {
          diagnosis,
          kvdtView,
          prepared,
          billingCases,
        };
      }),
    );

    expect(result.diagnosis.evaluationIds).toHaveLength(0);
    expect(result.kvdtView.found).toBe(true);
    if (result.kvdtView.found) {
      expect(result.kvdtView.exportReady).toBe(true);
      expect(result.kvdtView.issues).toHaveLength(0);
      expect(result.kvdtView.lineItems).toHaveLength(1);
    }
    expect(result.prepared.outcome).toBe("ready");
    expect(result.billingCases).toHaveLength(1);
    expect(result.billingCases[0]?.status).toBe("ready-for-export");
  });

  it("persists blocking SDICD evaluations when a diagnosis violates catalog constraints", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Mismatch",
                prefixes: [],
                given: ["Max"],
              },
            ],
            birthDate: "1990-01-01",
            administrativeGender: {
              system: "urn:gender",
              code: "male",
            },
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T10:00:00.000Z",
          },
        });

        const pkg = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            family: "SDICD",
            version: "2026.2",
            sourcePath: "fixtures/sdicd",
            artifact: {
              storageId: seedStorageId,
              contentType: "application/zip",
              byteSize: 1,
              sha256: "feedface",
            },
            importedAt: "2026-03-10T10:01:00.000Z",
            status: "active",
          },
        );

        yield* test.mutation(refs.public.coding.importIcdCatalogEntries, {
          sourcePackageId: pkg.packageId,
          entries: [
            {
              code: "B99.9",
              text: "Test gender-bound diagnosis",
              isBillable: true,
              genderConstraint: "female",
              genderErrorType: "error",
            },
          ],
        });

        const diagnosis = yield* test.mutation(refs.public.coding.createDiagnosis, {
          patientId: patient.patientId,
          icdCode: "B99.9",
          icd10gm: {
            system: "urn:icd10gm",
            code: "B99.9",
          },
          category: "acute",
          createdAt: "2026-03-10T10:05:00.000Z",
        });

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
    expect(result.evaluations.some((evaluation) => evaluation.ruleCode === "SDICD_GENDER_MISMATCH")).toBe(true);
    expect(result.evaluations.some((evaluation) => evaluation.blocking)).toBe(true);
  });

  it("blocks KVDT preparation when coding evaluations contain blocking errors", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const { organizationId } = yield* test.run(
          seedOrganization(),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
          }),
        );

        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Blocked",
                prefixes: [],
                given: ["Berta"],
              },
            ],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T11:00:00.000Z",
          },
        });

        const billingCase = yield* test.mutation(refs.public.billing.createCase, {
          patientId: patient.patientId,
          organizationId,
          quarter: "2026Q1",
          tssRelevant: false,
          status: "open",
        });

        const diagnosis = yield* test.mutation(refs.public.coding.createDiagnosis, {
          patientId: patient.patientId,
          billingCaseId: billingCase.billingCaseId,
          icdCode: "UNKNOWN.CODE",
          icd10gm: {
            system: "urn:icd10gm",
            code: "UNKNOWN.CODE",
          },
          category: "acute",
          createdAt: "2026-03-10T11:05:00.000Z",
        });

        yield* test.mutation(refs.public.billing.addLineItem, {
          billingCaseId: billingCase.billingCaseId,
          chargeCodeSystem: "EBM",
          chargeCode: "03000",
          serviceDate: "2026-03-10",
          quantity: 1,
          diagnosisIds: [diagnosis.diagnosisId],
          modifierCodes: [],
          originKind: "manual",
        });

        const prepared = yield* test.mutation(
          refs.public.billing.prepareKvdtExport,
          {
            billingCaseId: billingCase.billingCaseId,
          },
        );

        const kvdtView = yield* test.query(refs.public.billing.getKvdtCaseView, {
          billingCaseId: billingCase.billingCaseId,
        });

        return {
          prepared,
          kvdtView,
        };
      }),
    );

    expect(result.prepared.outcome).toBe("blocked");
    expect(result.kvdtView.found).toBe(true);
    if (result.kvdtView.found) {
      expect(result.kvdtView.exportReady).toBe(false);
      expect(result.kvdtView.issues.some((issue) => issue.code === "SDICD_CODE_UNKNOWN")).toBe(true);
    }
  });
});
