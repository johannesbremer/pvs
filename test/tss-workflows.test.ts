import { GenericId } from "@confect/core";
import { describe, expect, it } from "vitest";
import { Effect, Schema } from "effect";

import { refs } from "../confect/refs";
import { DatabaseWriter } from "../confect/_generated/services";
import { runWithTestConfect, TestConfect } from "./TestConfect";

const seedTssContext = () =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    const organizationId = yield* writer.table("organizations").insert({
      active: true,
      kind: "practice",
      name: "Praxis TSS",
      identifiers: [],
      addresses: [
        {
          line1: "TSS-Weg 1",
          postalCode: "10115",
          city: "Berlin",
        },
      ],
      telecom: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-11T08:30:00.000Z",
      },
    });

    const practitionerId = yield* writer.table("practitioners").insert({
      active: true,
      displayName: "Dr. TSS",
      nameSortKey: "TSS,Dr.",
      names: [{ family: "TSS", prefixes: ["Dr."], given: ["Tina"] }],
      lanr: "987654321",
      qualifications: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-11T08:30:00.000Z",
      },
    });

    const requesterRoleId = yield* writer.table("practitionerRoles").insert({
      practitionerId,
      organizationId,
      roleCodes: [],
      specialtyCodes: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-11T08:30:00.000Z",
      },
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

        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Terminsuche",
                prefixes: [],
                given: ["Erika"],
              },
            ],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-11T09:00:00.000Z",
          },
        });

        yield* test.mutation(refs.public.referrals.create, {
          patientId: patient.patientId,
          requesterRoleId,
          issueDate: "2026-03-11",
          reasonCodes: [],
          vermittlungscode: "VMC-1000",
          status: "active",
        });

        const tssAppointment = yield* test.mutation(refs.public.appointments.create, {
          organizationId,
          start: "2026-04-12T09:00:00.000Z",
          end: "2026-04-12T09:20:00.000Z",
          status: "proposed",
          source: "tss",
          externalAppointmentId: "tss-1",
          vermittlungscode: "VMC-1000",
          tssServiceType: "orthopaedy",
          displayBucket: "morning",
        });

        yield* test.mutation(refs.public.appointments.create, {
          organizationId,
          start: "2026-04-12T10:00:00.000Z",
          end: "2026-04-12T10:20:00.000Z",
          status: "proposed",
          source: "tss",
          externalAppointmentId: "tss-2",
          vermittlungscode: "VMC-2000",
          tssServiceType: "cardiology",
          displayBucket: "morning",
        });

        const selectable = yield* test.query(
          refs.public.appointments.listAvailableTss,
          {
            organizationId,
            vermittlungscode: "VMC-1000",
            tssServiceType: "orthopaedy",
            startFrom: "2026-04-01T00:00:00.000Z",
            startTo: "2026-04-30T23:59:59.999Z",
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
          selectable,
          booked,
          patientAppointments,
          lookedUpReferral,
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

        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Fehlbuchung",
                prefixes: [],
                given: ["Karl"],
              },
            ],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-11T09:10:00.000Z",
          },
        });

        const appointment = yield* test.mutation(refs.public.appointments.create, {
          organizationId,
          start: "2026-04-13T09:00:00.000Z",
          status: "proposed",
          source: "tss",
          externalAppointmentId: "tss-3",
          vermittlungscode: "VMC-3000",
          tssServiceType: "orthopaedy",
        });

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
