import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { parseOfficialTssSearchsetXml } from "../src/codecs/xml/tss";
import { ensureTssAssets, findFileRecursive } from "../tools/oracles/assets";
import { fileSystem } from "../tools/oracles/platform";
import { runTssOracle } from "../tools/oracles/tss/run";
import { ORACLE_TEST_TIMEOUT } from "./timeouts";

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
            `Official TSS XML ${filePath} failed parser checks.\n${JSON.stringify(result, null, 2)}`,
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
});
