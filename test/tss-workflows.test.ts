import { GenericId } from "@confect/core";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { DatabaseWriter } from "../confect/_generated/services";
import { refs } from "../confect/refs";
import { runWithTestConfect, TestConfect } from "./TestConfect";

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
});
