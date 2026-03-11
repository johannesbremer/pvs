import type { GenericId as Id } from "convex/values";

import { GenericId } from "@confect/core";
import { Effect, Schema } from "effect";
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
      addresses: [
        { city: "Koeln", line1: "Praxisring 12", postalCode: "50667" },
      ],
      identifiers: [],
      kind: "practice",
      name: "Praxis DiGA",
      sourceStamp: {
        capturedAt: "2026-03-11T09:00:00.000Z",
        sourceKind: "manual",
      },
      telecom: [],
    });
    const practitionerId = yield* writer.table("practitioners").insert({
      active: true,
      displayName: "Dr. DiGA",
      lanr: "987654321",
      names: [{ family: "DiGA", given: ["Dina"], prefixes: ["Dr."] }],
      nameSortKey: "DiGA,Dr.",
      qualifications: [],
      sourceStamp: {
        capturedAt: "2026-03-11T09:00:00.000Z",
        sourceKind: "manual",
      },
    });
    const coverageId = yield* writer.table("coverages").insert({
      kind: "gkv",
      kostentraegerkennung: "109500969",
      kostentraegerName: "AOK DiGA",
      patientId,
      sourceStamp: {
        capturedAt: "2026-03-11T09:00:00.000Z",
        sourceKind: "manual",
      },
    });

    return {
      coverageId,
      organizationId,
      practitionerId,
    };
  });

describe("diga and evdga workflows", () => {
  it("imports a DiGA catalog entry, finalizes an order, and renders an eVDGA bundle", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-11T09:00:00.000Z",
              names: [{ family: "Digital", given: ["Dora"], prefixes: [] }],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        const context = yield* test.run(
          seedDigaContext(patient.patientId),
          Schema.Struct({
            coverageId: GenericId.GenericId("coverages"),
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
          }),
        );

        const packageResult = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            artifact: {
              byteSize: 128,
              contentType: "application/zip",
              sha256: "diga-package",
              storageId: seedStorageId,
            },
            family: "DIGA",
            importedAt: "2026-03-11T09:01:00.000Z",
            sourcePath:
              "https://update.kbv.de/ita-update/DigitaleMuster/eVDGA/",
            status: "active",
            version: "Q3_2026",
          },
        );

        yield* test.mutation(refs.public.catalog.importDigaCatalogRefs, {
          entries: [
            {
              additionalCoCost: 0,
              ageGroups: ["adult"],
              digaModulName: "RueckenApp Basis",
              digaName: "RueckenApp",
              indikationen: [
                {
                  coding: [
                    {
                      code: "M54.5",
                      display: "Low back pain",
                      system: "urn:icd10gm",
                    },
                  ],
                  text: "Rueckenschmerz",
                },
              ],
              kontraindikationen: [],
              manufacturerName: "DiGA GmbH",
              notIndicatedGenders: [],
              price: 499.99,
              pzn: "19283746",
              statusImVerzeichnis: "gelistet",
              usageDurationText: "90 Tage",
              verordnungseinheitName: "DiGA Testmodul",
            },
          ],
          sourcePackageId: packageResult.packageId,
        });

        const catalogEntry = yield* test.query(
          refs.public.catalog.lookupDigaByPzn,
          {
            pzn: "19283746",
          },
        );
        if (!catalogEntry.found) {
          throw new Error("expected DiGA catalog entry");
        }

        const order = yield* test.mutation(refs.public.diga.createOrder, {
          authoredOn: "2026-03-11T09:05:00.000Z",
          coverageId: context.coverageId,
          digaCatalogRefId: catalogEntry.entry._id,
          organizationId: context.organizationId,
          patientId: patient.patientId,
          practitionerId: context.practitionerId,
          status: "draft",
        });

        const finalized = yield* test.mutation(refs.public.diga.finalizeOrder, {
          artifact: {
            attachment: {
              byteSize: 256,
              contentType: "application/fhir+xml",
              sha256: "evdga-xml",
              storageId: seedStorageId,
            },
            externalIdentifier: "evdga-1",
          },
          digaOrderId: order.digaOrderId,
          finalizedAt: "2026-03-11T09:10:00.000Z",
          patientPrint: {
            attachment: {
              byteSize: 64,
              contentType: "application/pdf",
              sha256: "evdga-print",
              storageId: seedStorageId,
            },
          },
          profileVersion: "1.2.2",
          tokenArtifact: {
            attachment: {
              byteSize: 32,
              contentType: "application/json",
              sha256: "evdga-token",
              storageId: seedStorageId,
            },
            externalIdentifier: "token-1",
          },
        });

        if (finalized.outcome !== "finalized") {
          throw new Error(
            `expected finalized outcome, got ${finalized.outcome}`,
          );
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
        const documents = yield* test.query(
          refs.public.documents.listByPatient,
          {
            kind: "evdga",
            patientId: patient.patientId,
          },
        );
        const documentView = yield* test.query(
          refs.public.documents.getDocument,
          {
            documentId: finalized.documentId,
          },
        );

        return {
          documents,
          documentView,
          finalized,
          orders,
          orderView,
          rendered,
        };
      }),
    );

    expect(result.orderView.found).toBe(true);
    if (!result.orderView.found) {
      throw new Error("expected Diga order view");
    }
    expect(result.orderView.order.status).toBe("final");
    expect(result.orders).toHaveLength(1);
    expect(result.rendered.found).toBe(true);
    if (!result.rendered.found) {
      throw new Error("expected rendered Diga bundle");
    }
    expect(result.rendered.payload.bundle.entry).toHaveLength(6);
    expect(
      result.rendered.payload.deviceRequest.codeCodeableConcept?.coding[0]
        ?.code,
    ).toBe("19283746");
    expect(result.rendered.xml.xml).toContain("<DeviceRequest");
    expect(result.documents).toHaveLength(1);
    expect(result.documentView.found).toBe(true);
    if (!result.documentView.found) {
      throw new Error("expected Diga document view");
    }
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
    expect(result.finalized.tokenArtifactId).toBeDefined();
  });
});
