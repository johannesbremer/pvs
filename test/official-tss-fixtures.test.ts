import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseOfficialTssSearchsetXml } from "../src/codecs/xml/tss";
import { ensureTssAssets, findFileRecursive } from "../tools/oracles/assets";
import { runTssOracle } from "../tools/oracles/tss/run";

describe("official TSS fixture sweeps", () => {
  it("parses all official KBV TSS response XML examples", async () => {
    const assets = await ensureTssAssets({});
    const files: string[] = [];

    for (let index = 1; index <= 10; index += 1) {
      const filePath = await findFileRecursive(
        assets.responseExamplesDir,
        (entryPath) => entryPath.endsWith(`Response${index}.xml`),
      );
      if (filePath) {
        files.push(filePath);
      }
    }

    expect(files.length).toBeGreaterThanOrEqual(10);

    for (const filePath of files) {
      const xml = await readFile(filePath, "utf8");
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
  }, 420_000);

  it("keeps the official TSS VSD and patient XML fixtures reachable", async () => {
    const assets = await ensureTssAssets({});
    const vsdXml = await findFileRecursive(
      assets.vsdTestfaelleDir,
      (entryPath) => entryPath.endsWith("_vd.xml"),
    );
    const patientXml = await findFileRecursive(
      assets.testpatientXmlDir,
      (entryPath) => entryPath.endsWith("_pd.xml"),
    );

    expect(vsdXml).toBeDefined();
    expect(patientXml).toBeDefined();

    const vsdContent = await readFile(vsdXml!, "utf8");
    const patientContent = await readFile(patientXml!, "utf8");

    expect(vsdContent.includes("Versicherter")).toBe(true);
    expect(patientContent.includes("UC_PersoenlicheVersichertendatenXML")).toBe(
      true,
    );
  }, 420_000);
});
