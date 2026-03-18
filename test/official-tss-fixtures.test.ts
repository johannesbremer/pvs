import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import fc from "fast-check";

import { parseOfficialTssSearchsetXml } from "../src/codecs/xml/tss";
import { ensureTssAssets, findFileRecursive } from "../tools/oracles/assets";
import { fileSystem } from "../tools/oracles/platform";
import { runTssOracle } from "../tools/oracles/tss/run";
import { formatOracleExecutionResult } from "./schema-json";
import { ORACLE_PROPERTY_NUM_RUNS, ORACLE_TEST_TIMEOUT } from "./timeouts";

describe("official TSS fixture sweeps", () => {
  it.effect(
    "parses all official KBV TSS response XML examples",
    () =>
      Effect.gen(function* () {
        const assets = yield* ensureTssAssets({});
        const files: string[] = [];

        for (let index = 1; index <= 10; index += 1) {
          const filePath = yield* findFileRecursive(
            assets.responseExamplesDir,
            (entryPath: string) => entryPath.endsWith(`Response${index}.xml`),
          );
          if (filePath) {
            files.push(filePath);
          }
        }

        expect(files.length).toBeGreaterThanOrEqual(10);

        for (const filePath of files) {
          const xml = yield* fileSystem.readFileString(filePath);
          const parsed = parseOfficialTssSearchsetXml(xml);
          const result = runTssOracle({
            payloadPreviewXml: xml,
          });

          expect(
            result.passed,
            `Official TSS XML ${filePath} failed parser checks.\n${formatOracleExecutionResult(result)}`,
          ).toBe(true);
          expect(parsed.appointments.length).toBeGreaterThanOrEqual(1);

          for (const appointment of parsed.appointments) {
            expect(appointment.externalAppointmentId.length).toBeGreaterThan(0);
            expect(appointment.start.length).toBeGreaterThan(0);
            expect(appointment.status).toBe("booked");
            expect(appointment.vermittlungscode).toBeDefined();
            expect(appointment.organizationBsnr).toBe("241234601");
            expect(appointment.patient?.insuranceIdentifier).toBeDefined();
          }
        }
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "keeps the official TSS VSD and patient XML fixtures reachable",
    () =>
      Effect.gen(function* () {
        const assets = yield* ensureTssAssets({});
        const vsdXml = yield* findFileRecursive(
          assets.vsdTestfaelleDir,
          (entryPath: string) => entryPath.endsWith("_vd.xml"),
        );
        const patientXml = yield* findFileRecursive(
          assets.testpatientXmlDir,
          (entryPath: string) => entryPath.endsWith("_pd.xml"),
        );

        expect(vsdXml).toBeDefined();
        expect(patientXml).toBeDefined();
        if (!vsdXml || !patientXml) {
          throw new Error("expected TSS fixture XML files");
        }

        const vsdContent = yield* fileSystem.readFileString(vsdXml);
        const patientContent = yield* fileSystem.readFileString(patientXml);

        expect(vsdContent.includes("Versicherter")).toBe(true);
        expect(
          patientContent.includes("UC_PersoenlicheVersichertendatenXML"),
        ).toBe(true);
      }),
    ORACLE_TEST_TIMEOUT,
  );

  it.effect(
    "rejects common structural corruptions of an official TSS response XML",
    () =>
      Effect.gen(function* () {
        const assets = yield* ensureTssAssets({});
        const filePath = yield* findFileRecursive(
          assets.responseExamplesDir,
          (entryPath: string) => entryPath.endsWith("Response1.xml"),
        );

        expect(filePath).toBeDefined();
        if (!filePath) {
          throw new Error("expected official TSS response XML");
        }

        const exampleXml = yield* fileSystem.readFileString(filePath);

        yield* Effect.tryPromise(() =>
          fc.assert(
            fc.asyncProperty(
              fc.constantFrom<TssXmlMutation>(...tssXmlMutations),
              async (mutation) => {
                // Arrange
                const mutatedXml = mutation.mutate(exampleXml);

                // Act
                const result = runTssOracle({
                  payloadPreviewXml: mutatedXml,
                });

                // Assert
                expect(
                  result.passed,
                  `TSS oracle unexpectedly accepted ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
                ).toBe(false);
                expect(
                  result.findings.some(
                    (finding) => finding.code === mutation.expectedErrorCode,
                  ),
                  `TSS oracle should report ${mutation.expectedErrorCode} for ${mutation.id}.\n${formatOracleExecutionResult(result)}`,
                ).toBe(true);
              },
            ),
            { numRuns: ORACLE_PROPERTY_NUM_RUNS },
          ),
        );
      }),
    ORACLE_TEST_TIMEOUT,
  );
});

// Helpers

type TssXmlMutation = {
  readonly expectedErrorCode:
    | "TSS_OFFICIAL_XML_NO_APPOINTMENTS"
    | "TSS_OFFICIAL_XML_REQUIRED_FIELDS_MISSING";
  readonly id: string;
  readonly mutate: (xml: string) => string;
};

const tssXmlMutations: readonly TssXmlMutation[] = [
  {
    expectedErrorCode: "TSS_OFFICIAL_XML_NO_APPOINTMENTS",
    id: "remove-appointment-resource",
    mutate: (xml) =>
      removeRequiredSubstring(xml, "<Appointment>", "</Appointment>"),
  },
  {
    expectedErrorCode: "TSS_OFFICIAL_XML_REQUIRED_FIELDS_MISSING",
    id: "empty-appointment-start",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        '<start value="2025-09-10T10:00:00+02:00"/>',
        '<start value=""/>',
      ),
  },
  {
    expectedErrorCode: "TSS_OFFICIAL_XML_REQUIRED_FIELDS_MISSING",
    id: "empty-appointment-id",
    mutate: (xml) =>
      replaceRequiredSubstring(
        xml,
        '<id value="0286855c-b49c-48b4-9775-58b6cb031aed"/>',
        '<id value=""/>',
      ),
  },
];

const replaceRequiredSubstring = (
  xml: string,
  expected: string,
  replacement: string,
) => {
  if (!xml.includes(expected)) {
    throw new Error(`expected TSS XML to contain ${expected}`);
  }

  return xml.replace(expected, replacement);
};

const removeRequiredSubstring = (xml: string, start: string, end: string) => {
  const startIndex = xml.indexOf(start);
  const endIndex = xml.indexOf(end, startIndex);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`expected TSS XML block ${start}...${end}`);
  }

  return xml.slice(0, startIndex) + xml.slice(endIndex + end.length);
};
