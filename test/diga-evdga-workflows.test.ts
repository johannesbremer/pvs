import { GenericId } from "@confect/core";
import { Effect, Schema } from "effect";
import type { GenericId as Id } from "convex/values";
import { describe, expect, it } from "vitest";

import { DatabaseWriter } from "../confect/_generated/services";
import { refs } from "../confect/refs";
import { runWithTestConfect, TestConfect } from "./TestConfect";

const seedStorageId = "seed;_storage" as Id<"_storage">;

const seedDigaContext = (patientId: Id<"patients">) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const organizationId = yield* writer.table("organizations").insert({
      active: true,
      kind: "practice",
      name: "Praxis DiGA",
      identifiers: [],
      addresses: [{ line1: "Praxisring 12", postalCode: "50667", city: "Koeln" }],
      telecom: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-11T09:00:00.000Z",
      },
    });
    const practitionerId = yield* writer.table("practitioners").insert({
      active: true,
      displayName: "Dr. DiGA",
      nameSortKey: "DiGA,Dr.",
      names: [{ family: "DiGA", prefixes: ["Dr."], given: ["Dina"] }],
      lanr: "987654321",
      qualifications: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-11T09:00:00.000Z",
      },
    });
    const coverageId = yield* writer.table("coverages").insert({
      patientId,
      kind: "gkv",
      kostentraegerkennung: "109500969",
      kostentraegerName: "AOK DiGA",
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-11T09:00:00.000Z",
      },
    });

    return {
      organizationId,
      practitionerId,
      coverageId,
    };
  });

describe("diga and evdga workflows", () => {
  it("imports a DiGA catalog entry, finalizes an order, and renders an eVDGA bundle", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [{ family: "Digital", prefixes: [], given: ["Dora"] }],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-11T09:00:00.000Z",
          },
        });

        const context = yield* test.run(
          seedDigaContext(patient.patientId),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
            coverageId: GenericId.GenericId("coverages"),
          }),
        );

        const packageResult = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            family: "DIGA",
            version: "Q3_2026",
            sourcePath: "https://update.kbv.de/ita-update/DigitaleMuster/eVDGA/",
            artifact: {
              storageId: seedStorageId,
              contentType: "application/zip",
              byteSize: 128,
              sha256: "diga-package",
            },
            importedAt: "2026-03-11T09:01:00.000Z",
            status: "active",
          },
        );

        yield* test.mutation(refs.public.catalog.importDigaCatalogRefs, {
          sourcePackageId: packageResult.packageId,
          entries: [
            {
              pzn: "19283746",
              verordnungseinheitName: "DiGA Testmodul",
              digaName: "RueckenApp",
              digaModulName: "RueckenApp Basis",
              statusImVerzeichnis: "gelistet",
              indikationen: [
                {
                  coding: [
                    {
                      system: "urn:icd10gm",
                      code: "M54.5",
                      display: "Low back pain",
                    },
                  ],
                  text: "Rueckenschmerz",
                },
              ],
              kontraindikationen: [],
              notIndicatedGenders: [],
              ageGroups: ["adult"],
              usageDurationText: "90 Tage",
              price: 499.99,
              additionalCoCost: 0,
              manufacturerName: "DiGA GmbH",
            },
          ],
        });

        const catalogEntry = yield* test.query(refs.public.catalog.lookupDigaByPzn, {
          pzn: "19283746",
        });
        if (!catalogEntry.found) {
          throw new Error("expected DiGA catalog entry");
        }

        const order = yield* test.mutation(refs.public.diga.createOrder, {
          patientId: patient.patientId,
          coverageId: context.coverageId,
          practitionerId: context.practitionerId,
          organizationId: context.organizationId,
          digaCatalogRefId: catalogEntry.entry._id,
          authoredOn: "2026-03-11T09:05:00.000Z",
          status: "draft",
        });

        const finalized = yield* test.mutation(refs.public.diga.finalizeOrder, {
          digaOrderId: order.digaOrderId,
          finalizedAt: "2026-03-11T09:10:00.000Z",
          profileVersion: "1.2.2",
          artifact: {
            attachment: {
              storageId: seedStorageId,
              contentType: "application/fhir+xml",
              byteSize: 256,
              sha256: "evdga-xml",
            },
            externalIdentifier: "evdga-1",
          },
          patientPrint: {
            attachment: {
              storageId: seedStorageId,
              contentType: "application/pdf",
              byteSize: 64,
              sha256: "evdga-print",
            },
          },
          tokenArtifact: {
            attachment: {
              storageId: seedStorageId,
              contentType: "application/json",
              byteSize: 32,
              sha256: "evdga-token",
            },
            externalIdentifier: "token-1",
          },
        });

        if (finalized.outcome !== "finalized") {
          throw new Error(`expected finalized outcome, got ${finalized.outcome}`);
        }

        const orderView = yield* test.query(refs.public.diga.getOrder, {
          digaOrderId: order.digaOrderId,
        });
        const orders = yield* test.query(refs.public.diga.listOrdersByPatient, {
          patientId: patient.patientId,
          status: "final",
        });
        const rendered = yield* test.query(refs.public.diga.renderEvdgaBundle, {
          digaOrderId: order.digaOrderId,
        });
        const documents = yield* test.query(refs.public.documents.listByPatient, {
          patientId: patient.patientId,
          kind: "evdga",
        });
        const documentView = yield* test.query(refs.public.documents.getDocument, {
          documentId: finalized.documentId,
        });

        return {
          orderView,
          orders,
          rendered,
          documents,
          documentView,
          finalized,
        };
      }),
    );

    expect(result.orderView.found).toBe(true);
    if (result.orderView.found) {
      expect(result.orderView.order.status).toBe("final");
    }
    expect(result.orders).toHaveLength(1);
    expect(result.rendered.found).toBe(true);
    if (result.rendered.found) {
      expect(result.rendered.payload.bundle.entry).toHaveLength(6);
      expect(result.rendered.payload.deviceRequest.codeCodeableConcept?.coding[0]?.code).toBe(
        "19283746",
      );
      expect(result.rendered.xml.xml).toContain("<DeviceRequest");
    }
    expect(result.documents).toHaveLength(1);
    expect(result.documentView.found).toBe(true);
    if (result.documentView.found) {
      expect(result.documentView.document.kind).toBe("evdga");
      expect(result.documentView.artifacts).toHaveLength(3);
      expect(
        result.documentView.artifacts.some(
          (artifact) => artifact.artifactSubtype === "token",
        ),
      ).toBe(true);
      expect(
        result.documentView.artifacts.some(
          (artifact) => artifact.artifactSubtype === "patient-print",
        ),
      ).toBe(true);
    }
    expect(result.finalized.tokenArtifactId).toBeDefined();
  });
});
