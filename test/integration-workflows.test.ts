import type { GenericId as Id } from "convex/values";

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { refs } from "../confect/refs";
import { PatientIdentifierSystem } from "../src/domain/patients";
import { provideTestConfect, TestConfect } from "./TestConfect";

const seedStorageId = "seed;_storage" as Id<"_storage">;

describe("integration eeb workflows", () => {
  it.effect(
    "should receive a verified eEB inbox item, match the patient, and report quarter card-read status",
    () =>
      Effect.gen(function* () {
        const result = yield* provideTestConfect(
          Effect.gen(function* () {
            const test = yield* TestConfect;

            // Arrange
            const { mailboxId } = yield* test.mutation(
              refs.public.integration.registerKimMailbox,
              {
                address: "eeb-inbox@test.example",
                isDefaultInbound: true,
                ownerId: "practice-1",
                ownerKind: "organization",
                serviceTags: ["eeb"],
                status: "active",
              },
            );
            const patient = yield* test.mutation(
              refs.public.patients.createManual,
              {
                patient: {
                  addresses: [],
                  capturedAt: "2026-03-03T08:00:00.000Z",
                  names: [{ family: "Sommer", given: ["Eva"], prefixes: [] }],
                  preferredLanguages: [],
                  telecom: [],
                },
                primaryIdentifier: {
                  system: PatientIdentifierSystem.Kvid10,
                  use: "official",
                  value: "A000000101",
                },
              },
            );
            yield* test.mutation(refs.public.vsd.recordSnapshot, {
              coveragePayload: {
                kostentraegerkennung4133: "109500969",
                kostentraegername4134: "AOK Nordost",
                versichertenId3119: "A000000101",
              },
              patientId: patient.patientId,
              readAt: "2026-03-04T09:00:00.000Z",
              readSource: "egk",
              versichertenId3119: "A000000101",
            });

            // Act
            const received = yield* test.mutation(
              refs.public.integration.receiveEebInboxItem,
              {
                attachment: {
                  byteSize: 256,
                  contentType: "application/xml",
                  sha256: "eeb-message-1",
                  storageId: seedStorageId,
                },
                coveragePayload: {
                  kostentraegerkennung4133: "109500969",
                  kostentraegername4134: "AOK Nordost",
                  versichertenId3119: "A000000101",
                  versichertennummer3105: "4711001",
                },
                kimMailboxId: mailboxId,
                kimMessageId: "kim-msg-1",
                receivedAt: "2026-03-10T10:15:00.000Z",
                senderDisplay: "AOK Nordost",
                senderVerified: true,
                serviceIdentifier: "eeb-insured-master-data",
                versichertenId3119: "A000000101",
              },
            );
            const view =
              received.outcome === "received"
                ? yield* test.query(refs.public.integration.getEebInboxItem, {
                    eebInboxItemId: received.inboxItemId,
                  })
                : received;
            const items = yield* test.query(
              refs.public.integration.listEebInboxItems,
              {
                adoptionState: "pending",
              },
            );

            // Assert
            return {
              items,
              received,
              view,
            };
          }),
        );

        expect(result.received.outcome).toBe("received");
        if (result.received.outcome !== "received") {
          throw new Error(
            `expected received outcome, got ${result.received.outcome}`,
          );
        }

        expect(result.received.quarterCardRead.hasCardRead).toBe(true);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.inboxItem.matchState).toBe("matched-existing");

        expect("found" in result.view && result.view.found).toBe(true);
        if (!("found" in result.view) || !result.view.found) {
          throw new Error("expected eEB inbox item view");
        }

        expect(result.view.view.inboxItem.senderVerified).toBe(true);
        expect(result.view.view.inboxItem.adoptionState).toBe("pending");
        expect(result.view.view.matchedPatient?.displayName).toBe("Eva Sommer");
        expect(result.view.view.snapshot?.rawArtifactId).toBe(
          result.received.payloadArtifactId,
        );
      }),
  );

  it.effect(
    "should block eEB adoption when the quarter has no prior card read",
    () =>
      Effect.gen(function* () {
        const result = yield* provideTestConfect(
          Effect.gen(function* () {
            const test = yield* TestConfect;

            // Arrange
            const { mailboxId } = yield* test.mutation(
              refs.public.integration.registerKimMailbox,
              {
                address: "eeb-inbox@test.example",
                isDefaultInbound: true,
                ownerId: "practice-1",
                ownerKind: "organization",
                serviceTags: ["eeb"],
                status: "active",
              },
            );
            const patient = yield* test.mutation(
              refs.public.patients.createManual,
              {
                patient: {
                  addresses: [],
                  capturedAt: "2026-03-03T08:00:00.000Z",
                  names: [{ family: "Winter", given: ["Lena"], prefixes: [] }],
                  preferredLanguages: [],
                  telecom: [],
                },
                primaryIdentifier: {
                  system: PatientIdentifierSystem.Kvid10,
                  use: "official",
                  value: "A000000202",
                },
              },
            );
            const received = yield* test.mutation(
              refs.public.integration.receiveEebInboxItem,
              {
                attachment: {
                  byteSize: 256,
                  contentType: "application/xml",
                  sha256: "eeb-message-2",
                  storageId: seedStorageId,
                },
                coveragePayload: {
                  kostentraegerkennung4133: "104212505",
                  kostentraegername4134: "TK",
                  versichertenId3119: "A000000202",
                },
                kimMailboxId: mailboxId,
                kimMessageId: "kim-msg-2",
                receivedAt: "2026-03-10T10:15:00.000Z",
                senderDisplay: "Techniker Krankenkasse",
                senderVerified: true,
                serviceIdentifier: "eeb-insured-master-data",
                versichertenId3119: "A000000202",
              },
            );
            if (received.outcome !== "received") {
              throw new Error(
                `expected received outcome, got ${received.outcome}`,
              );
            }

            // Act
            const adopted = yield* test.mutation(
              refs.public.integration.adoptEebInboxItem,
              {
                eebInboxItemId: received.inboxItemId,
              },
            );
            const view = yield* test.query(
              refs.public.integration.getEebInboxItem,
              {
                eebInboxItemId: received.inboxItemId,
              },
            );

            // Assert
            return {
              adopted,
              patientId: patient.patientId,
              view,
            };
          }),
        );

        expect(result.adopted.outcome).toBe("quarter-card-read-required");
        if (result.adopted.outcome !== "quarter-card-read-required") {
          throw new Error(
            `expected card-read guard, got ${result.adopted.outcome}`,
          );
        }

        expect(result.adopted.quarter).toBe("2026Q1");
        expect(result.view.found).toBe(true);
        if (!result.view.found) {
          throw new Error("expected retained eEB inbox item");
        }
        expect(result.view.view.inboxItem.adoptionState).toBe("pending");
        expect(result.view.view.quarterCardRead.hasCardRead).toBe(false);
      }),
  );

  it.effect(
    "should adopt a verified eEB inbox item into canonical coverage after a same-quarter card read",
    () =>
      Effect.gen(function* () {
        const result = yield* provideTestConfect(
          Effect.gen(function* () {
            const test = yield* TestConfect;

            // Arrange
            const { mailboxId } = yield* test.mutation(
              refs.public.integration.registerKimMailbox,
              {
                address: "eeb-inbox@test.example",
                isDefaultInbound: true,
                ownerId: "practice-1",
                ownerKind: "organization",
                serviceTags: ["eeb"],
                status: "active",
              },
            );
            const patient = yield* test.mutation(
              refs.public.patients.createManual,
              {
                patient: {
                  addresses: [],
                  capturedAt: "2026-03-01T08:00:00.000Z",
                  names: [
                    { family: "Fruehling", given: ["Mara"], prefixes: [] },
                  ],
                  preferredLanguages: [],
                  telecom: [],
                },
                primaryIdentifier: {
                  system: PatientIdentifierSystem.Kvid10,
                  use: "official",
                  value: "A000000303",
                },
              },
            );
            yield* test.mutation(refs.public.vsd.recordSnapshot, {
              coveragePayload: {
                kostentraegerkennung4133: "109500969",
                kostentraegername4134: "AOK Alt",
                versichertenId3119: "A000000303",
              },
              patientId: patient.patientId,
              readAt: "2026-03-02T09:00:00.000Z",
              readSource: "egk",
              versichertenId3119: "A000000303",
            });
            const received = yield* test.mutation(
              refs.public.integration.receiveEebInboxItem,
              {
                attachment: {
                  byteSize: 256,
                  contentType: "application/xml",
                  sha256: "eeb-message-3",
                  storageId: seedStorageId,
                },
                coveragePayload: {
                  kostentraegerkennung4133: "109500969",
                  kostentraegername4134: "AOK Neu",
                  versichertenId3119: "A000000303",
                  versichertennummer3105: "88811",
                },
                kimMailboxId: mailboxId,
                kimMessageId: "kim-msg-3",
                receivedAt: "2026-03-12T10:15:00.000Z",
                senderDisplay: "AOK Neu",
                senderVerified: true,
                serviceIdentifier: "eeb-insured-master-data",
                versichertenId3119: "A000000303",
              },
            );
            if (received.outcome !== "received") {
              throw new Error(
                `expected received outcome, got ${received.outcome}`,
              );
            }

            // Act
            const adopted = yield* test.mutation(
              refs.public.integration.adoptEebInboxItem,
              {
                eebInboxItemId: received.inboxItemId,
              },
            );
            const chart =
              adopted.outcome === "adopted"
                ? yield* test.query(refs.public.patients.getChart, {
                    patientId: adopted.matchedPatientId,
                  })
                : adopted;
            const view = yield* test.query(
              refs.public.integration.getEebInboxItem,
              {
                eebInboxItemId: received.inboxItemId,
              },
            );

            // Assert
            return {
              adopted,
              chart,
              view,
            };
          }),
        );

        expect(result.adopted.outcome).toBe("adopted");
        if (result.adopted.outcome !== "adopted") {
          throw new Error(
            `expected adopted outcome, got ${result.adopted.outcome}`,
          );
        }

        expect("found" in result.chart && result.chart.found).toBe(true);
        if (!("found" in result.chart) || !result.chart.found) {
          throw new Error("expected patient chart after eEB adoption");
        }

        expect(result.chart.coverages).toHaveLength(1);
        expect(result.chart.coverages[0]?.kostentraegerName).toBe("AOK Neu");
        expect(result.chart.coverages[0]?.legacyInsuranceNumber).toBe("88811");
        expect(result.view.found).toBe(true);
        if (!result.view.found) {
          throw new Error("expected accepted eEB inbox item view");
        }
        expect(result.view.view.inboxItem.adoptionState).toBe("accepted");
        expect(result.view.view.matchedCoverage?.kostentraegerName).toBe(
          "AOK Neu",
        );
      }),
  );
});
