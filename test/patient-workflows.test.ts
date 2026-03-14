import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { refs } from "../confect/refs";
import { runWithTestConfect, TestConfect } from "./TestConfect";

describe("patient and vsd workflows", () => {
  it.effect("creates a manual patient and returns a chart projection", () =>
    Effect.promise(async () => {
      const result = await runWithTestConfect(
        Effect.gen(function* () {
          const test = yield* TestConfect;

          const created = yield* test.mutation(
            refs.public.patients.createManual,
            {
              patient: {
                addresses: [
                  {
                    city: "Berlin",
                    line1: "Musterstrasse 1",
                    postalCode: "10115",
                  },
                ],
                capturedAt: "2026-03-10T10:00:00.000Z",
                names: [
                  {
                    family: "Beispiel",
                    given: ["Erika"],
                    prefixes: [],
                  },
                ],
                preferredLanguages: [],
                telecom: [],
              },
              primaryIdentifier: {
                system: "urn:test:patient-number",
                use: "official",
                value: "P-1000",
              },
            },
          );

          const chart = yield* test.query(refs.public.patients.getChart, {
            patientId: created.patientId,
          });

          return {
            chart,
            created,
          };
        }),
      );

      expect(result.chart.found).toBe(true);
      if (!result.chart.found) {
        throw new Error("expected patient chart");
      }
      expect(result.chart.patient.displayName).toBe("Erika Beispiel");
      expect(result.chart.identifiers).toHaveLength(1);
      expect(result.chart.coverages).toHaveLength(0);
    }),
  );

  it.effect("records a vsd snapshot and adopts it into a new patient", () =>
    Effect.promise(async () => {
      const result = await runWithTestConfect(
        Effect.gen(function* () {
          const test = yield* TestConfect;

          const { snapshotId } = yield* test.mutation(
            refs.public.vsd.recordSnapshot,
            {
              coveragePayload: {
                geburtsdatum3103: "1980-05-12",
                geschlecht3110: "female",
                kostentraegerkennung4133: "109500969",
                kostentraegername4134: "AOK Rheinland",
                ort3113: "Koeln",
                plz3112: "50667",
                strasse3107: "Bahnhofstrasse 2",
                versichertenart3108: "1",
                versichertenId3119: "A000000001",
                versichertennummer3105: "4711",
              },
              readAt: "2026-03-10T11:00:00.000Z",
              readSource: "egk",
              versichertenId3119: "A000000001",
            },
          );

          const adopted = yield* test.mutation(refs.public.vsd.adoptSnapshot, {
            patientSeed: {
              addresses: [],
              capturedAt: "2026-03-10T11:05:00.000Z",
              names: [
                {
                  family: "Musterfrau",
                  given: ["Erika"],
                  prefixes: [],
                },
              ],
              preferredLanguages: [],
              telecom: [],
            },
            snapshotId,
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
      if (result.adopted.outcome !== "adopted") {
        throw new Error("expected adopted VSD snapshot");
      }
      expect(result.adopted.patientCreated).toBe(true);
      expect(result.adopted.coverageCreated).toBe(true);

      if (!("found" in result.chart) || !result.chart.found) {
        throw new Error("expected adopted chart");
      }
      expect(result.chart.patient.birthDate).toBe("1980-05-12");
      expect(
        result.chart.identifiers.some(
          (identifier: { readonly value: string }) =>
            identifier.value === "A000000001",
        ),
      ).toBe(true);
      expect(result.chart.coverages[0]?.kostentraegerName).toBe(
        "AOK Rheinland",
      );
    }),
  );

  it.effect(
    "adopts a second snapshot onto an existing patient without creating a new patient",
    () =>
      Effect.promise(async () => {
        const result = await runWithTestConfect(
          Effect.gen(function* () {
            const test = yield* TestConfect;

            const created = yield* test.mutation(
              refs.public.patients.createManual,
              {
                patient: {
                  addresses: [],
                  capturedAt: "2026-03-10T12:00:00.000Z",
                  names: [
                    {
                      family: "Nachtrag",
                      given: ["Karl"],
                      prefixes: [],
                    },
                  ],
                  preferredLanguages: [],
                  telecom: [],
                },
              },
            );

            const { snapshotId } = yield* test.mutation(
              refs.public.vsd.recordSnapshot,
              {
                coveragePayload: {
                  kostentraegerkennung4133: "104212505",
                  kostentraegername4134: "TK",
                  versichertenart3108: "1",
                  versichertenId3119: "A000000099",
                  versichertennummer3105: "9911",
                },
                patientId: created.patientId,
                readAt: "2026-03-10T12:05:00.000Z",
                readSource: "eeb",
                versichertenId3119: "A000000099",
              },
            );

            const adopted = yield* test.mutation(
              refs.public.vsd.adoptSnapshot,
              {
                existingPatientId: created.patientId,
                snapshotId,
              },
            );

            const coverages = yield* test.query(
              refs.public.coverages.listByPatient,
              {
                patientId: created.patientId,
              },
            );

            return {
              adopted,
              coverages,
              created,
            };
          }),
        );

        expect(result.adopted.outcome).toBe("adopted");
        if (result.adopted.outcome !== "adopted") {
          throw new Error("expected adopted follow-up VSD snapshot");
        }
        expect(result.adopted.patientId).toBe(result.created.patientId);
        expect(result.adopted.patientCreated).toBe(false);
        expect(result.coverages).toHaveLength(1);
        expect(result.coverages[0]?.kostentraegerName).toBe("TK");
      }),
  );
});
