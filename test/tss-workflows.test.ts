import type { GenericId as Id } from "convex/values";

import { GenericId } from "@confect/core";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { DatabaseReader, DatabaseWriter } from "../confect/_generated/services";
import { refs } from "../confect/refs";
import { runWithTestConfect, TestConfect } from "./TestConfect";

const seedStorageId = "seed;_storage" as Id<"_storage">;

const seedTssContext = () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    const organizationId = yield* writer.table("organizations").insert({
      active: true,
      addresses: [
        {
          city: "Berlin",
          line1: "TSS-Weg 1",
          postalCode: "10115",
        },
      ],
      identifiers: [],
      kind: "practice",
      name: "Praxis TSS",
      sourceStamp: {
        capturedAt: "2026-03-11T08:30:00.000Z",
        sourceKind: "manual",
      },
      telecom: [],
    });

    const practitionerId = yield* writer.table("practitioners").insert({
      active: true,
      displayName: "Dr. TSS",
      lanr: "987654321",
      names: [{ family: "TSS", given: ["Tina"], prefixes: ["Dr."] }],
      nameSortKey: "TSS,Dr.",
      qualifications: [],
      sourceStamp: {
        capturedAt: "2026-03-11T08:30:00.000Z",
        sourceKind: "manual",
      },
    });

    const requesterRoleId = yield* writer.table("practitionerRoles").insert({
      organizationId,
      practitionerId,
      roleCodes: [],
      sourceStamp: {
        capturedAt: "2026-03-11T08:30:00.000Z",
        sourceKind: "manual",
      },
      specialtyCodes: [],
    });

    return {
      organizationId,
      requesterRoleId,
    };
  });

describe("appointments, referrals, and TSS workflows", () => {
  it("creates referrals, filters TSS appointments, and books a matching slot", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const { organizationId, requesterRoleId } = yield* test.run(
          seedTssContext(),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
            requesterRoleId: GenericId.GenericId("practitionerRoles"),
          }),
        );

        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-11T09:00:00.000Z",
              names: [
                {
                  family: "Terminsuche",
                  given: ["Erika"],
                  prefixes: [],
                },
              ],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        yield* test.mutation(refs.public.referrals.create, {
          issueDate: "2026-03-11",
          patientId: patient.patientId,
          reasonCodes: [],
          requesterRoleId,
          status: "active",
          vermittlungscode: "VMC-1000",
        });

        const tssAppointment = yield* test.mutation(
          refs.public.appointments.create,
          {
            displayBucket: "morning",
            end: "2026-04-12T09:20:00.000Z",
            externalAppointmentId: "tss-1",
            organizationId,
            source: "tss",
            start: "2026-04-12T09:00:00.000Z",
            status: "proposed",
            tssServiceType: "orthopaedy",
            vermittlungscode: "VMC-1000",
          },
        );

        yield* test.mutation(refs.public.appointments.create, {
          displayBucket: "morning",
          end: "2026-04-12T10:20:00.000Z",
          externalAppointmentId: "tss-2",
          organizationId,
          source: "tss",
          start: "2026-04-12T10:00:00.000Z",
          status: "proposed",
          tssServiceType: "cardiology",
          vermittlungscode: "VMC-2000",
        });

        const selectable = yield* test.query(
          refs.public.appointments.listAvailableTss,
          {
            organizationId,
            startFrom: "2026-04-01T00:00:00.000Z",
            startTo: "2026-04-30T23:59:59.999Z",
            tssServiceType: "orthopaedy",
            vermittlungscode: "VMC-1000",
          },
        );

        const booked = yield* test.mutation(refs.public.appointments.bookTss, {
          appointmentId: tssAppointment.appointmentId,
          patientId: patient.patientId,
          vermittlungscode: "VMC-1000",
        });

        const patientAppointments = yield* test.query(
          refs.public.appointments.listByOrganization,
          {
            organizationId,
            patientId: patient.patientId,
          },
        );

        const lookedUpReferral = yield* test.query(
          refs.public.referrals.lookupByVermittlungscode,
          {
            vermittlungscode: "VMC-1000",
          },
        );

        return {
          booked,
          lookedUpReferral,
          patientAppointments,
          selectable,
        };
      }),
    );

    expect(result.selectable).toHaveLength(1);
    expect(result.booked.outcome).toBe("booked");
    expect(result.patientAppointments).toHaveLength(1);
    expect(result.patientAppointments[0]?.status).toBe("booked");
    expect(result.lookedUpReferral.found).toBe(true);
  });

  it("rejects TSS booking when vermittlungscode does not match the selected slot", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const { organizationId } = yield* test.run(
          seedTssContext(),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
            requesterRoleId: GenericId.GenericId("practitionerRoles"),
          }),
        );

        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-11T09:10:00.000Z",
              names: [
                {
                  family: "Fehlbuchung",
                  given: ["Karl"],
                  prefixes: [],
                },
              ],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        const appointment = yield* test.mutation(
          refs.public.appointments.create,
          {
            externalAppointmentId: "tss-3",
            organizationId,
            source: "tss",
            start: "2026-04-13T09:00:00.000Z",
            status: "proposed",
            tssServiceType: "orthopaedy",
            vermittlungscode: "VMC-3000",
          },
        );

        return yield* test.mutation(refs.public.appointments.bookTss, {
          appointmentId: appointment.appointmentId,
          patientId: patient.patientId,
          vermittlungscode: "WRONG-CODE",
        });
      }),
    );

    expect(result.outcome).toBe("not-bookable");
  });

  it("imports TSS slots through an integration job and maps a booking into billing and encounter state", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const { organizationId, requesterRoleId } = yield* test.run(
          seedTssContext(),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
            requesterRoleId: GenericId.GenericId("practitionerRoles"),
          }),
        );

        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-11T09:20:00.000Z",
              names: [
                {
                  family: "Adapter",
                  given: ["Tara"],
                  prefixes: [],
                },
              ],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        yield* test.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;
            const coverageId = yield* writer.table("coverages").insert({
              kind: "gkv",
              kostentraegerkennung: "109500969",
              kostentraegerName: "AOK TSS",
              patientId: patient.patientId,
              sourceStamp: {
                capturedAt: "2026-03-11T09:21:00.000Z",
                sourceKind: "manual",
              },
            });
            return { coverageId };
          }),
          Schema.Struct({
            coverageId: GenericId.GenericId("coverages"),
          }),
        );

        yield* test.mutation(refs.public.referrals.create, {
          issueDate: "2026-03-11",
          patientId: patient.patientId,
          reasonCodes: [],
          requesterRoleId,
          status: "active",
          vermittlungscode: "VMC-5000",
        });

        const icdPackage = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            artifact: {
              byteSize: 1,
              contentType: "application/zip",
              sha256: "tss-sdicd",
              storageId: seedStorageId,
            },
            family: "SDICD",
            importedAt: "2026-03-11T09:22:00.000Z",
            sourcePath: "fixtures/tss-sdicd",
            status: "active",
            version: "2026.1",
          },
        );

        yield* test.mutation(refs.public.coding.importIcdCatalogEntries, {
          entries: [
            {
              code: "M54.5",
              isBillable: true,
              text: "Low back pain",
            },
          ],
          sourcePackageId: icdPackage.packageId,
        });

        const imported = yield* test.mutation(
          refs.public.appointments.importTssSlots,
          {
            artifact: {
              attachment: {
                byteSize: 128,
                contentType: "application/xml",
                sha256: "tss-import",
                storageId: seedStorageId,
              },
              externalIdentifier: "tss-import-1",
            },
            importedAt: "2026-03-11T09:25:00.000Z",
            organizationId,
            slots: [
              {
                displayBucket: "afternoon",
                end: "2026-04-15T14:20:00.000Z",
                externalAppointmentId: "ext-5000",
                start: "2026-04-15T14:00:00.000Z",
                tssServiceType: "orthopaedy",
                vermittlungscode: "VMC-5000",
              },
            ],
          },
        );

        const selectable = yield* test.query(
          refs.public.appointments.listAvailableTss,
          {
            organizationId,
            startFrom: "2026-04-01T00:00:00.000Z",
            startTo: "2026-04-30T23:59:59.999Z",
            tssServiceType: "orthopaedy",
            vermittlungscode: "VMC-5000",
          },
        );

        const booked = yield* test.mutation(refs.public.appointments.bookTss, {
          appointmentId: imported.appointmentIds[0],
          patientId: patient.patientId,
          vermittlungscode: "VMC-5000",
        });
        if (booked.outcome !== "booked") {
          throw new Error("expected booked TSS appointment");
        }

        const diagnosis = yield* test.mutation(refs.public.coding.createDiagnosis, {
          billingCaseId: booked.billingCaseId,
          category: "acute",
          createdAt: "2026-04-15T14:30:00.000Z",
          icd10gm: {
            code: "M54.5",
            display: "Low back pain",
            system: "urn:icd10gm",
          },
          icdCode: "M54.5",
          isPrimary: true,
          patientId: patient.patientId,
        });

        yield* test.mutation(refs.public.billing.addLineItem, {
          billingCaseId: booked.billingCaseId,
          chargeCode: "TSS-001",
          chargeCodeSystem: "other",
          diagnosisIds: [diagnosis.diagnosisId],
          modifierCodes: [],
          originKind: "tss",
          quantity: 1,
          serviceDate: "2026-04-15",
        });

        const caseView = yield* test.query(
          refs.public.billing.getKvdtCaseView,
          {
            billingCaseId: booked.billingCaseId,
          },
        );
        const prepared = yield* test.mutation(
          refs.public.billing.prepareKvdtExport,
          {
            billingCaseId: booked.billingCaseId,
          },
        );
        const referral = yield* test.query(
          refs.public.referrals.lookupByVermittlungscode,
          {
            vermittlungscode: "VMC-5000",
          },
        );

        const persisted = yield* test.run(
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;
            const encounter = yield* reader
              .table("encounters")
              .get(booked.encounterId);
            return {
              encounterCaseType: encounter.caseType,
              encounterId: encounter._id,
            };
          }),
          Schema.Struct({
            encounterCaseType: Schema.String,
            encounterId: GenericId.GenericId("encounters"),
          }),
        );

        return {
          booked,
          caseView,
          imported,
          persisted,
          prepared,
          referral,
          selectable,
        };
      }),
    );

    expect(result.imported.importedCount).toBe(1);
    expect(result.selectable).toHaveLength(1);
    expect(result.booked.outcome).toBe("booked");
    if (result.booked.outcome !== "booked") {
      throw new Error("expected booked TSS appointment");
    }
    expect(result.caseView.found).toBe(true);
    if (!result.caseView.found) {
      throw new Error("expected TSS billing case view");
    }
    expect(result.caseView.billingCase.tssRelevant).toBe(true);
    expect(result.caseView.billingCase.tssAppointmentId).toBe(
      result.booked.appointmentId,
    );
    expect(result.prepared.outcome).toBe("ready");
    expect(result.referral.found).toBe(true);
    if (!result.referral.found) {
      throw new Error("expected used referral");
    }
    expect(result.referral.referral.status).toBe("used");
    expect(result.persisted.encounterCaseType).toBe("tss");
    expect(result.persisted.encounterId).toBe(result.booked.encounterId);
  });
});
