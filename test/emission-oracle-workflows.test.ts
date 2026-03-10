import { GenericId } from "@confect/core";
import { Schema, Effect } from "effect";
import type { GenericId as Id } from "convex/values";
import { describe, expect, it } from "vitest";

import { refs } from "../confect/refs";
import { DatabaseWriter } from "../confect/_generated/services";
import { runWithTestConfect, TestConfect } from "./TestConfect";

const seedStorageId = "seed;_storage" as Id<"_storage">;

const seedContext = (patientId: Id<"patients">) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const organizationId = yield* writer.table("organizations").insert({
      active: true,
      kind: "practice",
      name: "Praxis Emit",
      identifiers: [],
      addresses: [{ line1: "Musterweg 4", postalCode: "10115", city: "Berlin" }],
      telecom: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-10T07:00:00.000Z",
      },
    });
    const practitionerId = yield* writer.table("practitioners").insert({
      active: true,
      displayName: "Dr. Emit",
      nameSortKey: "Emit,Dr.",
      names: [{ family: "Emit", prefixes: ["Dr."], given: ["Eva"] }],
      lanr: "123456789",
      qualifications: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-10T07:00:00.000Z",
      },
    });
    const coverageId = yield* writer.table("coverages").insert({
      patientId,
      kind: "gkv",
      kostentraegerkennung: "109500969",
      kostentraegerName: "AOK Emit",
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-10T07:05:00.000Z",
      },
    });
    const encounterId = yield* writer.table("encounters").insert({
      patientId,
      organizationId,
      coverageId,
      quarter: "2026Q1",
      start: "2026-03-10T08:00:00.000Z",
      end: "2026-03-10T08:10:00.000Z",
      caseType: "regular",
    });
    const diagnosisId = yield* writer.table("diagnoses").insert({
      patientId,
      encounterId,
      icdCode: "J06.9",
      icd10gm: {
        system: "urn:icd10gm",
        code: "J06.9",
        display: "Acute upper respiratory infection",
      },
      category: "acute",
      recordStatus: "active",
      isPrimary: true,
    });

    return {
      organizationId,
      practitionerId,
      coverageId,
      encounterId,
      diagnosisId,
    };
  });

describe("emission and oracle workflows", () => {
  it("renders ERP XML and returns an oracle plan for a finalized medication order", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [{ family: "ERP", prefixes: [], given: ["Erna"] }],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T09:00:00.000Z",
          },
        });

        const { organizationId, practitionerId, coverageId } = yield* test.run(
          seedContext(patient.patientId),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
            coverageId: GenericId.GenericId("coverages"),
            encounterId: GenericId.GenericId("encounters"),
            diagnosisId: GenericId.GenericId("diagnoses"),
          }),
        );

        const pkg = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            family: "AMDB",
            version: "2026.1",
            sourcePath: "fixtures/amdb",
            artifact: {
              storageId: seedStorageId,
              contentType: "application/zip",
              byteSize: 1,
              sha256: "emit-amdb",
            },
            importedAt: "2026-03-10T09:01:00.000Z",
            status: "active",
          },
        );

        yield* test.mutation(refs.public.catalog.importMedicationCatalogRefs, {
          sourcePackageId: pkg.packageId,
          entries: [
            {
              pzn: "99999999",
              displayName: "Emitol",
              regionalArvFlags: [],
            },
          ],
        });
        const medication = yield* test.query(
          refs.public.catalog.lookupMedicationByPzn,
          { pzn: "99999999" },
        );
        if (!medication.found) {
          throw new Error("expected medication");
        }

        const order = yield* test.mutation(refs.public.prescriptions.createOrder, {
          patientId: patient.patientId,
          coverageId,
          practitionerId,
          organizationId,
          orderKind: "pzn",
          prescriptionMode: "electronic",
          prescriptionContext: "regular",
          status: "draft",
          authoredOn: "2026-03-10T09:05:00.000Z",
          medicationCatalogRefId: medication.entry._id,
        });

        const finalized = yield* test.mutation(
          refs.public.prescriptions.finalizeOrder,
          {
            medicationOrderId: order.medicationOrderId,
            finalizedAt: "2026-03-10T09:10:00.000Z",
            artifact: {
              attachment: {
                storageId: seedStorageId,
                contentType: "application/fhir+xml",
                byteSize: 128,
                sha256: "erp-payload",
              },
            },
          },
        );
        if (finalized.outcome !== "finalized") {
          throw new Error(`expected finalized outcome, got ${finalized.outcome}`);
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
            family: "eRezept",
            documentId: finalized.documentId,
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

        return { rendered, plan, validationRun, validation };
      }),
    );

    expect(result.rendered.found).toBe(true);
    if (result.rendered.found) {
      expect(result.rendered.payload.bundle.entry).toHaveLength(7);
      expect(result.rendered.xml.xml).toContain("<Bundle");
      expect(result.rendered.validationPlan?.family).toBe("eRezept");
    }
    expect(result.plan.found).toBe(true);
    if (result.plan.found) {
      expect(result.plan.plan.inputKind).toBe("fhir-xml");
    }
    expect(result.validationRun.outcome).toBe("completed");
    if (result.validationRun.outcome === "completed") {
      expect(result.validationRun.validationStatus).toBe("valid");
      expect(result.validationRun.report.passed).toBe(true);
    }
    expect(result.validation.found).toBe(true);
    if (result.validation.found) {
      expect(result.validation.validationStatus).toBe("valid");
    }
  });

  it("creates and renders eAU documents and exposes the eAU oracle plugin", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [{ family: "EAU", prefixes: [], given: ["Else"] }],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T10:00:00.000Z",
          },
        });

        const context = yield* test.run(
          seedContext(patient.patientId),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
            coverageId: GenericId.GenericId("coverages"),
            encounterId: GenericId.GenericId("encounters"),
            diagnosisId: GenericId.GenericId("diagnoses"),
          }),
        );

        const created = yield* test.mutation(refs.public.documents.createEauDocument, {
          patientId: patient.patientId,
          encounterId: context.encounterId,
          diagnosisIds: [context.diagnosisId],
          attesterPractitionerId: context.practitionerId,
          organizationId: context.organizationId,
          coverageId: context.coverageId,
          finalizedAt: "2026-03-10T10:10:00.000Z",
          artifact: {
            attachment: {
              storageId: seedStorageId,
              contentType: "application/fhir+xml",
              byteSize: 256,
              sha256: "eau-main",
            },
          },
          patientView: {
            attachment: {
              storageId: seedStorageId,
              contentType: "application/pdf",
              byteSize: 32,
              sha256: "eau-patient",
            },
          },
          employerView: {
            attachment: {
              storageId: seedStorageId,
              contentType: "application/pdf",
              byteSize: 32,
              sha256: "eau-employer",
            },
          },
          insurerView: {
            attachment: {
              storageId: seedStorageId,
              contentType: "application/pdf",
              byteSize: 32,
              sha256: "eau-insurer",
            },
          },
        });

        const rendered = yield* test.query(refs.public.documents.renderEauDocument, {
          documentId: created.documentId,
          encounterId: context.encounterId,
          diagnosisIds: [context.diagnosisId],
          attesterPractitionerId: context.practitionerId,
          organizationId: context.organizationId,
          coverageId: context.coverageId,
        });

        const plugins = yield* test.query(refs.public.integration.listOraclePlugins, {
          family: "eAU",
        });

        return { created, rendered, plugins };
      }),
    );

    expect(result.rendered.found).toBe(true);
    if (result.rendered.found) {
      expect(result.rendered.payload.conditions).toHaveLength(1);
      expect(result.rendered.xml.xml).toContain("<Condition");
      expect(result.rendered.validationPlan?.family).toBe("eAU");
    }
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
              ownerKind: "documentRevision",
              ownerId: "revision-1",
              direction: "outbound",
              artifactFamily: "ERP",
              artifactSubtype: "kbv-bundle-xml",
              transportKind: "fhir-bundle-xml",
              contentType: "application/fhir+xml",
              attachment: {
                storageId: seedStorageId,
                contentType: "application/fhir+xml",
                byteSize: 1,
                sha256: "broken-erp",
              },
              validationStatus: "pending",
              immutableAt: "2026-03-10T11:00:00.000Z",
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
          validationRun,
          validation,
        };
      }),
    );

    expect(result.validationRun.outcome).toBe("completed");
    if (result.validationRun.outcome === "completed") {
      expect(result.validationRun.validationStatus).toBe("invalid");
      expect(result.validationRun.report.passed).toBe(false);
    }
    expect(result.validation.found).toBe(true);
    if (result.validation.found) {
      expect(result.validation.validationStatus).toBe("invalid");
    }
  });
});
