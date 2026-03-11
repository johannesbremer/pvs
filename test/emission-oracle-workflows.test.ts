import type { GenericId as Id } from "convex/values";

import { GenericId } from "@confect/core";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { DatabaseWriter } from "../confect/_generated/services";
import { refs } from "../confect/refs";
import { runWithTestConfect, TestConfect } from "./TestConfect";

const seedStorageId = "seed;_storage" as Id<"_storage">;

const seedContext = (patientId: Id<"patients">) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const organizationId = yield* writer.table("organizations").insert({
      active: true,
      addresses: [
        { city: "Berlin", line1: "Musterweg 4", postalCode: "10115" },
      ],
      identifiers: [],
      kind: "practice",
      name: "Praxis Emit",
      sourceStamp: {
        capturedAt: "2026-03-10T07:00:00.000Z",
        sourceKind: "manual",
      },
      telecom: [],
    });
    const practitionerId = yield* writer.table("practitioners").insert({
      active: true,
      displayName: "Dr. Emit",
      lanr: "123456789",
      names: [{ family: "Emit", given: ["Eva"], prefixes: ["Dr."] }],
      nameSortKey: "Emit,Dr.",
      qualifications: [],
      sourceStamp: {
        capturedAt: "2026-03-10T07:00:00.000Z",
        sourceKind: "manual",
      },
    });
    const coverageId = yield* writer.table("coverages").insert({
      kind: "gkv",
      kostentraegerkennung: "109500969",
      kostentraegerName: "AOK Emit",
      patientId,
      sourceStamp: {
        capturedAt: "2026-03-10T07:05:00.000Z",
        sourceKind: "manual",
      },
    });
    const encounterId = yield* writer.table("encounters").insert({
      caseType: "regular",
      coverageId,
      end: "2026-03-10T08:10:00.000Z",
      organizationId,
      patientId,
      quarter: "2026Q1",
      start: "2026-03-10T08:00:00.000Z",
    });
    const diagnosisId = yield* writer.table("diagnoses").insert({
      category: "acute",
      encounterId,
      icd10gm: {
        code: "J06.9",
        display: "Acute upper respiratory infection",
        system: "urn:icd10gm",
      },
      icdCode: "J06.9",
      isPrimary: true,
      patientId,
      recordStatus: "active",
    });

    return {
      coverageId,
      diagnosisId,
      encounterId,
      organizationId,
      practitionerId,
    };
  });

describe("emission and oracle workflows", () => {
  it("renders ERP XML and returns an oracle plan for a finalized medication order", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-10T09:00:00.000Z",
              names: [{ family: "ERP", given: ["Erna"], prefixes: [] }],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        const { coverageId, organizationId, practitionerId } = yield* test.run(
          seedContext(patient.patientId),
          Schema.Struct({
            coverageId: GenericId.GenericId("coverages"),
            diagnosisId: GenericId.GenericId("diagnoses"),
            encounterId: GenericId.GenericId("encounters"),
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
          }),
        );

        const pkg = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            artifact: {
              byteSize: 1,
              contentType: "application/zip",
              sha256: "emit-amdb",
              storageId: seedStorageId,
            },
            family: "AMDB",
            importedAt: "2026-03-10T09:01:00.000Z",
            sourcePath: "fixtures/amdb",
            status: "active",
            version: "2026.1",
          },
        );

        yield* test.mutation(refs.public.catalog.importMedicationCatalogRefs, {
          entries: [
            {
              displayName: "Emitol",
              pzn: "99999999",
              regionalArvFlags: [],
            },
          ],
          sourcePackageId: pkg.packageId,
        });
        const medication = yield* test.query(
          refs.public.catalog.lookupMedicationByPzn,
          { pzn: "99999999" },
        );
        if (!medication.found) {
          throw new Error("expected medication");
        }

        const order = yield* test.mutation(
          refs.public.prescriptions.createOrder,
          {
            authoredOn: "2026-03-10T09:05:00.000Z",
            coverageId,
            medicationCatalogRefId: medication.entry._id,
            orderKind: "pzn",
            organizationId,
            patientId: patient.patientId,
            practitionerId,
            prescriptionContext: "regular",
            prescriptionMode: "electronic",
            status: "draft",
          },
        );

        const finalized = yield* test.mutation(
          refs.public.prescriptions.finalizeOrder,
          {
            artifact: {
              attachment: {
                byteSize: 128,
                contentType: "application/fhir+xml",
                sha256: "erp-payload",
                storageId: seedStorageId,
              },
            },
            finalizedAt: "2026-03-10T09:10:00.000Z",
            medicationOrderId: order.medicationOrderId,
          },
        );
        if (finalized.outcome !== "finalized") {
          throw new Error(
            `expected finalized outcome, got ${finalized.outcome}`,
          );
        }

        const rendered = yield* test.query(
          refs.public.prescriptions.renderErpBundle,
          {
            medicationOrderId: order.medicationOrderId,
          },
        );
        const plan = yield* test.query(
          refs.public.integration.buildValidationPlan,
          {
            documentId: finalized.documentId,
            family: "eRezept",
          },
        );
        const validationRun = yield* test.mutation(
          refs.public.integration.runValidation,
          {
            artifactId: finalized.artifactId,
            payloadPreviewXml: rendered.found ? rendered.xml.xml : undefined,
          },
        );
        const validation = yield* test.query(
          refs.public.integration.getValidationSummary,
          {
            artifactId: finalized.artifactId,
          },
        );

        return { plan, rendered, validation, validationRun };
      }),
    );

    expect(result.rendered.found).toBe(true);
    if (!result.rendered.found) {
      throw new Error("expected rendered ERP bundle");
    }
    expect(result.rendered.payload.bundle.entry).toHaveLength(7);
    expect(result.rendered.xml.xml).toContain("<Bundle");
    expect(result.rendered.validationPlan?.family).toBe("eRezept");
    expect(result.plan.found).toBe(true);
    if (!result.plan.found) {
      throw new Error("expected ERP validation plan");
    }
    expect(result.plan.plan.inputKind).toBe("fhir-xml");
    expect(result.validationRun.outcome).toBe("completed");
    if (result.validationRun.outcome !== "completed") {
      throw new Error("expected completed ERP validation run");
    }
    expect(result.validationRun.validationStatus).toBe("valid");
    expect(result.validationRun.report.passed).toBe(true);
    expect(result.validation.found).toBe(true);
    if (!result.validation.found) {
      throw new Error("expected persisted ERP validation");
    }
    expect(result.validation.validationStatus).toBe("valid");
  });

  it("creates and renders eAU documents and exposes the eAU oracle plugin", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-10T10:00:00.000Z",
              names: [{ family: "EAU", given: ["Else"], prefixes: [] }],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        const context = yield* test.run(
          seedContext(patient.patientId),
          Schema.Struct({
            coverageId: GenericId.GenericId("coverages"),
            diagnosisId: GenericId.GenericId("diagnoses"),
            encounterId: GenericId.GenericId("encounters"),
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
          }),
        );

        const created = yield* test.mutation(
          refs.public.documents.createEauDocument,
          {
            artifact: {
              attachment: {
                byteSize: 256,
                contentType: "application/fhir+xml",
                sha256: "eau-main",
                storageId: seedStorageId,
              },
            },
            attesterPractitionerId: context.practitionerId,
            coverageId: context.coverageId,
            diagnosisIds: [context.diagnosisId],
            employerView: {
              attachment: {
                byteSize: 32,
                contentType: "application/pdf",
                sha256: "eau-employer",
                storageId: seedStorageId,
              },
            },
            encounterId: context.encounterId,
            finalizedAt: "2026-03-10T10:10:00.000Z",
            insurerView: {
              attachment: {
                byteSize: 32,
                contentType: "application/pdf",
                sha256: "eau-insurer",
                storageId: seedStorageId,
              },
            },
            organizationId: context.organizationId,
            patientId: patient.patientId,
            patientView: {
              attachment: {
                byteSize: 32,
                contentType: "application/pdf",
                sha256: "eau-patient",
                storageId: seedStorageId,
              },
            },
          },
        );

        const rendered = yield* test.query(
          refs.public.documents.renderEauDocument,
          {
            attesterPractitionerId: context.practitionerId,
            coverageId: context.coverageId,
            diagnosisIds: [context.diagnosisId],
            documentId: created.documentId,
            encounterId: context.encounterId,
            organizationId: context.organizationId,
          },
        );

        const plugins = yield* test.query(
          refs.public.integration.listOraclePlugins,
          {
            family: "eAU",
          },
        );

        return { created, plugins, rendered };
      }),
    );

    expect(result.rendered.found).toBe(true);
    if (!result.rendered.found) {
      throw new Error("expected rendered eAU bundle");
    }
    expect(result.rendered.payload.conditions).toHaveLength(1);
    expect(result.rendered.xml.xml).toContain("<Condition");
    expect(result.rendered.validationPlan?.family).toBe("eAU");
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]?.family).toBe("eAU");
    expect(result.created.patientViewArtifactId).toBeDefined();
    expect(result.created.employerViewArtifactId).toBeDefined();
    expect(result.created.insurerViewArtifactId).toBeDefined();
  });

  it("marks artifacts invalid when oracle validation receives broken XML", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const artifactId = yield* test.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;
            return yield* writer.table("artifacts").insert({
              artifactFamily: "ERP",
              artifactSubtype: "kbv-bundle-xml",
              attachment: {
                byteSize: 1,
                contentType: "application/fhir+xml",
                sha256: "broken-erp",
                storageId: seedStorageId,
              },
              contentType: "application/fhir+xml",
              direction: "outbound",
              immutableAt: "2026-03-10T11:00:00.000Z",
              ownerId: "revision-1",
              ownerKind: "documentRevision",
              transportKind: "fhir-bundle-xml",
              validationStatus: "pending",
            });
          }),
          GenericId.GenericId("artifacts"),
        );

        const validationRun = yield* test.mutation(
          refs.public.integration.runValidation,
          {
            artifactId,
            payloadPreviewXml: "<Bundle></Bundle>",
          },
        );
        const validation = yield* test.query(
          refs.public.integration.getValidationSummary,
          {
            artifactId,
          },
        );

        return {
          validation,
          validationRun,
        };
      }),
    );

    expect(result.validationRun.outcome).toBe("completed");
    if (result.validationRun.outcome !== "completed") {
      throw new Error("expected completed invalid validation run");
    }
    expect(result.validationRun.validationStatus).toBe("invalid");
    expect(result.validationRun.report.passed).toBe(false);
    expect(result.validation.found).toBe(true);
    if (!result.validation.found) {
      throw new Error("expected persisted invalid validation");
    }
    expect(result.validation.validationStatus).toBe("invalid");
  });
});
