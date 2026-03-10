import { describe, expect, it } from "vitest";
import { Effect } from "effect";

import { refs } from "../confect/refs";
import { runWithTestConfect, TestConfect } from "./TestConfect";

describe("patient and vsd workflows", () => {
  it("creates a manual patient and returns a chart projection", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const created = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Beispiel",
                prefixes: [],
                given: ["Erika"],
              },
            ],
            addresses: [
              {
                line1: "Musterstrasse 1",
                postalCode: "10115",
                city: "Berlin",
              },
            ],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T10:00:00.000Z",
          },
          primaryIdentifier: {
            system: "urn:test:patient-number",
            value: "P-1000",
            use: "official",
          },
        });

        const chart = yield* test.query(refs.public.patients.getChart, {
          patientId: created.patientId,
        });

        return {
          created,
          chart,
        };
      }),
    );

    expect(result.chart.found).toBe(true);
    if (result.chart.found) {
      expect(result.chart.patient.displayName).toBe("Erika Beispiel");
      expect(result.chart.identifiers).toHaveLength(1);
      expect(result.chart.coverages).toHaveLength(0);
    }
  });

  it("records a vsd snapshot and adopts it into a new patient", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const { snapshotId } = yield* test.mutation(
          refs.public.vsd.recordSnapshot,
          {
            readSource: "egk",
            readAt: "2026-03-10T11:00:00.000Z",
            versichertenId3119: "A000000001",
            coveragePayload: {
              versichertenId3119: "A000000001",
              versichertennummer3105: "4711",
              versichertenart3108: "1",
              geschlecht3110: "female",
              geburtsdatum3103: "1980-05-12",
              strasse3107: "Bahnhofstrasse 2",
              plz3112: "50667",
              ort3113: "Koeln",
              kostentraegerkennung4133: "109500969",
              kostentraegername4134: "AOK Rheinland",
            },
          },
        );

        const adopted = yield* test.mutation(refs.public.vsd.adoptSnapshot, {
          snapshotId,
          patientSeed: {
            names: [
              {
                family: "Musterfrau",
                prefixes: [],
                given: ["Erika"],
              },
            ],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T11:05:00.000Z",
          },
        });

        const chart =
          adopted.outcome === "adopted"
            ? yield* test.query(refs.public.patients.getChart, {
                patientId: adopted.patientId,
              })
            : adopted;

        return {
          adopted,
          chart,
        };
      }),
    );

    expect(result.adopted.outcome).toBe("adopted");
    if (result.adopted.outcome === "adopted") {
      expect(result.adopted.patientCreated).toBe(true);
      expect(result.adopted.coverageCreated).toBe(true);
    }

    if ("found" in result.chart && result.chart.found) {
      expect(result.chart.patient.birthDate).toBe("1980-05-12");
      expect(
        result.chart.identifiers.some(
          (identifier: { readonly value: string }) =>
            identifier.value === "A000000001",
        ),
      ).toBe(true);
      expect(result.chart.coverages[0]?.kostentraegerName).toBe("AOK Rheinland");
    } else {
      throw new Error("expected adopted chart");
    }
  });

  it("adopts a second snapshot onto an existing patient without creating a new patient", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const created = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Nachtrag",
                prefixes: [],
                given: ["Karl"],
              },
            ],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T12:00:00.000Z",
          },
        });

        const { snapshotId } = yield* test.mutation(
          refs.public.vsd.recordSnapshot,
          {
            patientId: created.patientId,
            readSource: "eeb",
            readAt: "2026-03-10T12:05:00.000Z",
            versichertenId3119: "A000000099",
            coveragePayload: {
              versichertenId3119: "A000000099",
              versichertennummer3105: "9911",
              versichertenart3108: "1",
              kostentraegerkennung4133: "104212505",
              kostentraegername4134: "TK",
            },
          },
        );

        const adopted = yield* test.mutation(refs.public.vsd.adoptSnapshot, {
          snapshotId,
          existingPatientId: created.patientId,
        });

        const coverages = yield* test.query(refs.public.coverages.listByPatient, {
          patientId: created.patientId,
        });

        return {
          created,
          adopted,
          coverages,
        };
      }),
    );

    expect(result.adopted.outcome).toBe("adopted");
    if (result.adopted.outcome === "adopted") {
      expect(result.adopted.patientId).toBe(result.created.patientId);
      expect(result.adopted.patientCreated).toBe(false);
    }
    expect(result.coverages).toHaveLength(1);
    expect(result.coverages[0]?.kostentraegerName).toBe("TK");
  });
});
