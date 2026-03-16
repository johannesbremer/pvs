import type { GenericId as Id } from "convex/values";

import { GenericId } from "@confect/core";
import { Effect, Schema } from "effect";
import fc from "fast-check";

import { DatabaseWriter } from "../../confect/_generated/services";
import { refs } from "../../confect/refs";
import {
  ensureExtractedAsset,
  kbvOracleAssets,
} from "../../tools/oracles/assets";
import { encodeJsonStringSync } from "../../tools/oracles/json-schema";
import { fileSystem, path } from "../../tools/oracles/platform";
import { provideTestConfect, TestConfect } from "../TestConfect";

const seedStorageId = "seed;_storage" as Id<"_storage">;

const erpSeedContextSchema = Schema.Struct({
  coverageId: GenericId.GenericId("coverages"),
  organizationId: GenericId.GenericId("organizations"),
  practitionerId: GenericId.GenericId("practitioners"),
});

type RenderedErpBundle = {
  readonly bundleEntryCount: number;
  readonly payload: unknown;
  readonly xml: string;
};

const renderedErpBundleCache = new Map<string, Promise<RenderedErpBundle>>();

export type ErpDifferentialMutation = {
  readonly expectedComparison: "exec-reject-local-pass" | "same-reject";
  readonly id: string;
  readonly mutate: (xml: string) => string;
};

export type ErpEmitterCase = {
  readonly authoredOn: string;
  readonly dosageText?: string;
  readonly medicationDisplay: string;
  readonly orderKind: "freetext" | "pzn";
  readonly patientFamily: string;
  readonly patientGiven: string;
  readonly pzn?: string;
};

export const ErpEmitterCaseFields = Schema.Struct({
  authoredOn: Schema.String,
  dosageText: Schema.optional(Schema.String),
  medicationDisplay: Schema.String,
  orderKind: Schema.Literal("freetext", "pzn"),
  patientFamily: Schema.String,
  patientGiven: Schema.String,
  pzn: Schema.optional(Schema.String),
});

const getRenderedErpBundleCacheKey = (input: ErpEmitterCase) =>
  encodeJsonStringSync(ErpEmitterCaseFields)(input);

type ErpSeedContext = typeof erpSeedContextSchema.Type;

const authoredOnArbitrary = fc.constantFrom(
  "2026-03-10T09:05:00.000Z",
  "2026-04-14T08:15:00.000Z",
  "2026-05-20T11:30:00.000Z",
  "2026-07-03T13:45:00.000Z",
);

const dosageTextArbitrary = fc.option(
  fc.constantFrom(
    "1-0-1",
    "0-1-0",
    "1 Tablette morgens",
    "bei Bedarf 1 Tablette",
  ),
  { nil: undefined },
);

const patientFamilyArbitrary = fc.constantFrom(
  "Meyer",
  "Schmidt",
  "Keller",
  "Hoffmann",
);

const patientGivenArbitrary = fc.constantFrom("Eva", "Lina", "Paul", "Ben");

const pznDisplayArbitrary = fc.constantFrom(
  "Emitol",
  "Ramipril Test",
  "Diclofenac Test",
  "Furosemid Test",
);

const freetextMedicationArbitrary = fc.constantFrom(
  "Rezeptur Salbe 2%",
  "Individuelle Schmerzmedikation",
  "Magistralrezeptur Test",
  "Freitextmedikation Test",
);

const pznArbitrary = fc.constantFrom(
  "99999991",
  "99999992",
  "99999993",
  "99999994",
);

export const erpPznCaseArbitrary: fc.Arbitrary<ErpEmitterCase> = fc.record({
  authoredOn: authoredOnArbitrary,
  dosageText: dosageTextArbitrary,
  medicationDisplay: pznDisplayArbitrary,
  orderKind: fc.constant("pzn"),
  patientFamily: patientFamilyArbitrary,
  patientGiven: patientGivenArbitrary,
  pzn: pznArbitrary,
});

export const erpFreetextCaseArbitrary: fc.Arbitrary<ErpEmitterCase> = fc.record(
  {
    authoredOn: authoredOnArbitrary,
    dosageText: dosageTextArbitrary,
    medicationDisplay: freetextMedicationArbitrary,
    orderKind: fc.constant("freetext"),
    patientFamily: patientFamilyArbitrary,
    patientGiven: patientGivenArbitrary,
  },
);

export const loadOfficialErpExampleXmlEffect = (cacheDir: string) =>
  Effect.gen(function* () {
    const examplesDir = yield* ensureExtractedAsset(
      kbvOracleAssets.kbvErpExamples_1_4,
      cacheDir,
    );
    return yield* fileSystem.readFileString(
      path.join(examplesDir, "Beispiel_19.xml"),
    );
  });

export const renderGeneratedErpXmlEffect = (input: ErpEmitterCase) => {
  const cacheKey = getRenderedErpBundleCacheKey(input);
  const cached = renderedErpBundleCache.get(cacheKey);
  if (cached) {
    return Effect.promise(() => cached);
  }

  const pending = Effect.runPromise(
    provideTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;
        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: input.authoredOn,
              names: [
                {
                  family: input.patientFamily,
                  given: [input.patientGiven],
                  prefixes: [],
                },
              ],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        const { coverageId, organizationId, practitionerId } = yield* test.run(
          seedErpContextEffect(patient.patientId, input.authoredOn),
          erpSeedContextSchema,
        );

        let medicationCatalogRefId: Id<"medicationCatalogRefs"> | undefined;
        if (input.orderKind === "pzn") {
          const pkg = yield* test.mutation(
            refs.public.coding.registerMasterDataPackage,
            {
              artifact: {
                byteSize: 1,
                contentType: "application/zip",
                sha256: `emit-amdb-${input.pzn}`,
                storageId: seedStorageId,
              },
              family: "AMDB",
              importedAt: input.authoredOn,
              sourcePath: `fixtures/amdb/${input.pzn}`,
              status: "active",
              version: "2026.1",
            },
          );

          yield* test.mutation(
            refs.public.catalog.importMedicationCatalogRefs,
            {
              entries: [
                {
                  displayName: input.medicationDisplay,
                  pzn: input.pzn!,
                  regionalArvFlags: [],
                },
              ],
              sourcePackageId: pkg.packageId,
            },
          );

          const lookup = yield* test.query(
            refs.public.catalog.lookupMedicationByPzn,
            {
              pzn: input.pzn!,
            },
          );
          if (!lookup.found) {
            throw new Error(`expected medication for PZN ${input.pzn}`);
          }
          medicationCatalogRefId = lookup.entry._id;
        }

        const order = yield* test.mutation(
          refs.public.prescriptions.createOrder,
          {
            authoredOn: input.authoredOn,
            coverageId,
            ...(input.dosageText ? { dosageText: input.dosageText } : {}),
            ...(input.orderKind === "freetext"
              ? { freeTextMedication: input.medicationDisplay }
              : {}),
            ...(medicationCatalogRefId ? { medicationCatalogRefId } : {}),
            orderKind: input.orderKind,
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
                sha256: `erp-payload-${input.patientFamily}-${input.medicationDisplay}`,
                storageId: seedStorageId,
              },
            },
            finalizedAt: input.authoredOn,
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
        if (!rendered.found) {
          throw new Error("expected rendered ERP bundle");
        }

        return {
          bundleEntryCount: rendered.payload.bundle.entry.length,
          payload: rendered.payload,
          xml: rendered.xml.xml,
        } satisfies RenderedErpBundle;
      }),
    ),
  );

  renderedErpBundleCache.set(cacheKey, pending);

  return Effect.promise(() => pending).pipe(
    Effect.tapError(() =>
      Effect.sync(() => {
        renderedErpBundleCache.delete(cacheKey);
      }),
    ),
  );
};

export const loadEmittedErpExampleXmlEffect = (input: ErpEmitterCase) =>
  Effect.map(renderGeneratedErpXmlEffect(input), (rendered) => rendered.xml);

export const persistErpOracleReplayCaseEffect = <A, I>({
  lane,
  payload,
  payloadSchema,
  scenario,
}: {
  lane: string;
  payload: A;
  payloadSchema: Schema.Schema<A, I, never>;
  scenario: string;
}) =>
  Effect.gen(function* () {
    const directory = erpOracleReplayDirectory(lane);
    const replayPath = path.join(directory, `${scenario}.json`);
    yield* fileSystem.makeDirectory(directory, { recursive: true });
    const replayJson = encodeJsonStringSync(payloadSchema)(payload);
    yield* fileSystem.writeFileString(replayPath, replayJson);
    return replayPath;
  });

export const erpOracleReplayDirectory = (lane: string) =>
  path.join(
    process.cwd(),
    ".cache",
    "kbv-oracles",
    "counterexamples",
    "erezept",
    lane,
  );

export const officialParityMutations: readonly ErpDifferentialMutation[] = [
  {
    expectedComparison: "same-reject",
    id: "official-missing-bundle",
    mutate: (xml) => renameRequiredTag(xml, "Bundle", "Missing"),
  },
  {
    expectedComparison: "same-reject",
    id: "official-missing-composition",
    mutate: (xml) => renameRequiredTag(xml, "Composition", "Missing"),
  },
  {
    expectedComparison: "same-reject",
    id: "official-missing-medication-request",
    mutate: (xml) => renameRequiredTag(xml, "MedicationRequest", "Missing"),
  },
  {
    expectedComparison: "same-reject",
    id: "official-missing-medication",
    mutate: (xml) => renameRequiredTag(xml, "Medication", "Missing"),
  },
];

export const officialMismatchMutations: readonly ErpDifferentialMutation[] = [
  {
    expectedComparison: "exec-reject-local-pass",
    id: "official-missing-coverage",
    mutate: (xml) => renameRequiredTag(xml, "Coverage", "Missing"),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "official-missing-patient",
    mutate: (xml) => renameRequiredTag(xml, "Patient", "Missing"),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "official-missing-practitioner",
    mutate: (xml) => renameRequiredTag(xml, "Practitioner", "Missing"),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "official-missing-organization",
    mutate: (xml) => renameRequiredTag(xml, "Organization", "Missing"),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "official-invalid-composition-profile",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Composition|1.4",
        "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Composition_Broken|1.4",
      ),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "official-invalid-prescription-profile",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Prescription|1.4",
        "https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Prescription_Broken|1.4",
      ),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "official-broken-medication-reference",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        "http://pvs.praxis.local/fhir/Medication/a3ccc266-b033-47cc-9361-98ec450f7db9",
        "http://pvs.praxis.local/fhir/Medication/does-not-exist",
      ),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "official-broken-coverage-reference",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        "http://pvs.praxis.local/fhir/Coverage/da80211e-61ee-458e-a651-87370b6ec30c",
        "http://pvs.praxis.local/fhir/Coverage/does-not-exist",
      ),
  },
];

export const emittedParityMutations: readonly ErpDifferentialMutation[] = [
  {
    expectedComparison: "same-reject",
    id: "emitted-missing-bundle",
    mutate: (xml) => renameRequiredTag(xml, "Bundle", "Missing"),
  },
  {
    expectedComparison: "same-reject",
    id: "emitted-missing-composition",
    mutate: (xml) => renameRequiredTag(xml, "Composition", "Missing"),
  },
  {
    expectedComparison: "same-reject",
    id: "emitted-missing-medication-request",
    mutate: (xml) => renameRequiredTag(xml, "MedicationRequest", "Missing"),
  },
  {
    expectedComparison: "same-reject",
    id: "emitted-missing-medication",
    mutate: (xml) => renameRequiredTag(xml, "Medication", "Missing"),
  },
];

export const emittedMismatchMutations: readonly ErpDifferentialMutation[] = [
  {
    expectedComparison: "exec-reject-local-pass",
    id: "emitted-missing-coverage",
    mutate: (xml) => renameRequiredTag(xml, "Coverage", "Missing"),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "emitted-missing-patient",
    mutate: (xml) => renameRequiredTag(xml, "Patient", "Missing"),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "emitted-missing-practitioner",
    mutate: (xml) => renameRequiredTag(xml, "Practitioner", "Missing"),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "emitted-missing-organization",
    mutate: (xml) => renameRequiredTag(xml, "Organization", "Missing"),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "emitted-broken-medication-reference",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        '<reference value="http://pvs.praxis.local/fhir/Medication/',
        '<reference value="http://pvs.praxis.local/fhir/Medication/missing-',
      ),
  },
  {
    expectedComparison: "exec-reject-local-pass",
    id: "emitted-broken-coverage-reference",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        '<reference value="http://pvs.praxis.local/fhir/Coverage/',
        '<reference value="http://pvs.praxis.local/fhir/Coverage/missing-',
      ),
  },
];

const seedErpContextEffect = (
  patientId: Id<"patients">,
  capturedAt: string,
): Effect.Effect<ErpSeedContext, unknown, DatabaseWriter> =>
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
        capturedAt,
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
        capturedAt,
        sourceKind: "manual",
      },
    });
    const coverageId = yield* writer.table("coverages").insert({
      kind: "gkv",
      kostentraegerkennung: "109500969",
      kostentraegerName: "AOK Emit",
      patientId,
      sourceStamp: {
        capturedAt,
        sourceKind: "manual",
      },
    });

    return {
      coverageId,
      organizationId,
      practitionerId,
    };
  });

const renameRequiredTag = (
  xml: string,
  tagName:
    | "Bundle"
    | "Composition"
    | "Coverage"
    | "Medication"
    | "MedicationRequest"
    | "Organization"
    | "Patient"
    | "Practitioner",
  replacementPrefix: string,
) => {
  const pattern = new RegExp(`<${tagName}(?=[\\s>])`, "g");
  if (!pattern.test(xml)) {
    throw new Error(`expected eRezept XML to contain <${tagName}`);
  }
  return xml.replace(pattern, `<${replacementPrefix}${tagName}`);
};

const replaceRequiredSubstring = (
  xml: string,
  expected: string,
  replacement: string,
) => {
  if (!xml.includes(expected)) {
    throw new Error(`expected eRezept XML to contain ${expected}`);
  }
  return xml.replace(expected, replacement);
};
