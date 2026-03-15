import { EauPayload } from "../../fhir-r4-effect/resources/eau";
import { ErpPayload } from "../../fhir-r4-effect/resources/erp";
import { EvdgaPayload } from "../../fhir-r4-effect/resources/evdga";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const textNode = (tagName: string, value?: string) =>
  value === undefined || value.length === 0
    ? ""
    : `<${tagName} value="${escapeXml(value)}"/>`;

const identifierXml = (identifier: {
  readonly system: string;
  readonly value: string;
}) =>
  `<identifier>${textNode("system", identifier.system)}${textNode("value", identifier.value)}</identifier>`;

const humanNameXml = (name: {
  readonly family: string;
  readonly given: readonly string[];
}) =>
  `<name>${textNode("family", name.family)}${name.given
    .map((given) => textNode("given", given))
    .join("")}</name>`;

const addressXml = (address: {
  readonly city?: string;
  readonly line1: string;
  readonly postalCode?: string;
}) =>
  `<address>${textNode("line", address.line1)}${textNode(
    "city",
    address.city,
  )}${textNode("postalCode", address.postalCode)}</address>`;

const codingXml = (coding: {
  readonly code: string;
  readonly display?: string;
  readonly system: string;
}) =>
  `<coding>${textNode("system", coding.system)}${textNode(
    "code",
    coding.code,
  )}${textNode("display", coding.display)}</coding>`;

const codeableConceptXml = (concept: {
  readonly coding: readonly {
    readonly code: string;
    readonly display?: string;
    readonly system: string;
  }[];
  readonly text?: string;
}) =>
  `<code>${concept.coding.map(codingXml).join("")}${textNode(
    "text",
    concept.text,
  )}</code>`;

const referenceXml = (
  tagName: string,
  reference: {
    readonly display?: string;
    readonly reference: string;
  },
) =>
  `<${tagName}>${textNode("reference", reference.reference)}${textNode(
    "display",
    reference.display,
  )}</${tagName}>`;

const bundleEntryXml = (resourceXml: string) =>
  `<entry><resource>${resourceXml}</resource></entry>`;

const bundleEntryWithFullUrlXml = (fullUrl: string, resourceXml: string) =>
  `<entry>${textNode("fullUrl", fullUrl)}<resource>${resourceXml}</resource></entry>`;

const metaXml = (profiles: readonly string[]) =>
  `<meta>${textNode("versionId", "1")}${profiles
    .map((profile) => textNode("profile", profile))
    .join("")}</meta>`;

const sanitizeFhirId = (value: string) =>
  value
    .replaceAll(/[^A-Z0-9.-]/gi, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 64);

const erpFullUrl = (resourceType: string, id: string) =>
  `http://pvs.praxis.local/fhir/${resourceType}/${id}`;

const erpDateOnly = (value: string) => value.slice(0, 10);

const patientXml = (resource: typeof ErpPayload.Type.patient) =>
  `<Patient xmlns="http://hl7.org/fhir">${textNode("id", resource.id)}${resource.identifier
    .map(identifierXml)
    .join("")}${resource.name.map(humanNameXml).join("")}${textNode(
    "birthDate",
    resource.birthDate,
  )}${textNode("gender", resource.gender)}${resource.address
    .map(addressXml)
    .join("")}</Patient>`;

const practitionerXml = (resource: typeof ErpPayload.Type.practitioner) =>
  `<Practitioner xmlns="http://hl7.org/fhir">${textNode("id", resource.id)}${resource.identifier
    .map(identifierXml)
    .join("")}${resource.name.map(humanNameXml).join("")}</Practitioner>`;

const organizationXml = (resource: typeof ErpPayload.Type.organization) =>
  `<Organization xmlns="http://hl7.org/fhir">${textNode(
    "id",
    resource.id,
  )}${resource.identifier.map(identifierXml).join("")}${textNode(
    "name",
    resource.name,
  )}${resource.address.map(addressXml).join("")}</Organization>`;

const coverageXml = (resource: typeof ErpPayload.Type.coverage) =>
  `<Coverage xmlns="http://hl7.org/fhir">${textNode("id", resource.id)}${textNode(
    "status",
    resource.status,
  )}${resource.type ? codeableConceptXml(resource.type) : ""}${referenceXml(
    "beneficiary",
    resource.beneficiary,
  )}${resource.payor.map((payor) => referenceXml("payor", payor)).join("")}</Coverage>`;

const compositionXml = (resource: typeof ErpPayload.Type.composition) =>
  `<Composition xmlns="http://hl7.org/fhir">${textNode(
    "id",
    resource.id,
  )}${textNode("status", resource.status)}${codeableConceptXml(
    resource.type,
  )}${textNode("date", resource.date)}${textNode("title", resource.title)}${referenceXml(
    "subject",
    resource.subject,
  )}${resource.author.map((author) => referenceXml("author", author)).join("")}</Composition>`;

const medicationXml = (resource: typeof ErpPayload.Type.medication) =>
  `<Medication xmlns="http://hl7.org/fhir">${textNode("id", resource.id)}${
    resource.code ? codeableConceptXml(resource.code) : ""
  }</Medication>`;

const medicationRequestXml = (
  resource: typeof ErpPayload.Type.medicationRequest,
) =>
  `<MedicationRequest xmlns="http://hl7.org/fhir">${textNode(
    "id",
    resource.id,
  )}${textNode("status", resource.status)}${textNode(
    "intent",
    resource.intent,
  )}${referenceXml("subject", resource.subject)}${textNode(
    "authoredOn",
    resource.authoredOn,
  )}${
    resource.requester ? referenceXml("requester", resource.requester) : ""
  }${resource.insurance.map((insurance) => referenceXml("insurance", insurance)).join("")}${
    resource.medicationReference
      ? referenceXml("medicationReference", resource.medicationReference)
      : ""
  }${resource.dosageInstruction
    .map(
      (instruction) =>
        `<dosageInstruction>${textNode("text", instruction.text)}</dosageInstruction>`,
    )
    .join("")}</MedicationRequest>`;

const deviceRequestXml = (resource: typeof EvdgaPayload.Type.deviceRequest) =>
  `<DeviceRequest xmlns="http://hl7.org/fhir">${textNode(
    "id",
    resource.id,
  )}${textNode("status", resource.status)}${textNode(
    "intent",
    resource.intent,
  )}${referenceXml("subject", resource.subject)}${textNode(
    "authoredOn",
    resource.authoredOn,
  )}${
    resource.requester ? referenceXml("requester", resource.requester) : ""
  }${resource.insurance
    .map((insurance) => referenceXml("insurance", insurance))
    .join("")}${
    resource.codeCodeableConcept
      ? `<codeCodeableConcept>${resource.codeCodeableConcept.coding
          .map(codingXml)
          .join(
            "",
          )}${textNode("text", resource.codeCodeableConcept.text)}</codeCodeableConcept>`
      : ""
  }${resource.reasonCode
    .map(
      (concept) =>
        `<reasonCode>${concept.coding
          .map(codingXml)
          .join("")}${textNode("text", concept.text)}</reasonCode>`,
    )
    .join("")}</DeviceRequest>`;

const encounterXml = (resource: typeof EauPayload.Type.encounter) =>
  `<Encounter xmlns="http://hl7.org/fhir">${textNode("id", resource.id)}${textNode(
    "status",
    resource.status,
  )}<class>${textNode("system", resource.class.system)}${textNode(
    "code",
    resource.class.code,
  )}</class>${referenceXml("subject", resource.subject)}<period>${textNode(
    "start",
    resource.period.start,
  )}${textNode("end", resource.period.end)}</period></Encounter>`;

const conditionXml = (resource: (typeof EauPayload.Type.conditions)[number]) =>
  `<Condition xmlns="http://hl7.org/fhir">${textNode("id", resource.id)}${codeableConceptXml(
    resource.code,
  )}${referenceXml("subject", resource.subject)}${
    resource.encounter ? referenceXml("encounter", resource.encounter) : ""
  }${textNode("recordedDate", resource.recordedDate)}</Condition>`;

export const renderErpBundleXml = (payload: typeof ErpPayload.Type) =>
  (() => {
    const erpProfileVersion = "1.4";
    const forProfileVersion = "1.3";
    const patientId = sanitizeFhirId(payload.patient.id);
    const practitionerId = sanitizeFhirId(payload.practitioner.id);
    const organizationId = sanitizeFhirId(payload.organization.id);
    const coverageId = sanitizeFhirId(payload.coverage.id);
    const medicationId = sanitizeFhirId(payload.medication.id);
    const medicationRequestId = sanitizeFhirId(payload.medicationRequest.id);
    const compositionId = sanitizeFhirId(payload.composition.id);
    const bundleId = sanitizeFhirId(
      payload.bundle.identifier?.value ?? compositionId,
    );

    const patientName = payload.patient.name[0];
    const patientFamily = patientName?.family ?? "Meyer";
    const patientGiven = patientName?.given[0] ?? "Eva";
    const practitionerName = payload.practitioner.name[0];
    const practitionerFamily = practitionerName?.family ?? "Emit";
    const practitionerGiven = practitionerName?.given[0] ?? "Eva";
    const practitionerPrefix = practitionerName?.prefixes[0] ?? "Dr. med.";
    const medicationCoding = payload.medication.code?.coding[0];
    const medicationText =
      payload.medication.code?.text ??
      medicationCoding?.display ??
      "Medikation";
    const isPznMedication =
      medicationCoding?.system === "urn:pzn" ||
      /^\d{8}$/u.test(medicationCoding?.code ?? "");
    const medicationProfile = isPznMedication
      ? "KBV_PR_ERP_Medication_PZN"
      : "KBV_PR_ERP_Medication_FreeText";
    const medicationRequestFullUrl = erpFullUrl(
      "MedicationRequest",
      medicationRequestId,
    );
    const medicationFullUrl = erpFullUrl("Medication", medicationId);
    const patientFullUrl = erpFullUrl("Patient", patientId);
    const practitionerFullUrl = erpFullUrl("Practitioner", practitionerId);
    const organizationFullUrl = erpFullUrl("Organization", organizationId);
    const coverageFullUrl = erpFullUrl("Coverage", coverageId);
    const compositionFullUrl = erpFullUrl("Composition", compositionId);
    const dosageText = payload.medicationRequest.dosageInstruction[0]?.text;
    const hasDosage = typeof dosageText === "string" && dosageText.length > 0;
    const authoredOnDate = erpDateOnly(payload.medicationRequest.authoredOn);

    const compositionResourceXml =
      `<Composition xmlns="http://hl7.org/fhir">` +
      textNode("id", compositionId) +
      metaXml([
        `https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Composition|${erpProfileVersion}`,
      ]) +
      `<extension url="https://fhir.kbv.de/StructureDefinition/KBV_EX_FOR_Legal_basis"><valueCoding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_KBV_STATUSKENNZEICHEN",
      )}${textNode("code", "00")}</valueCoding></extension>` +
      textNode("status", "final") +
      `<type><coding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_KBV_FORMULAR_ART",
      )}${textNode("code", "e16A")}</coding></type>` +
      `<subject>${textNode("reference", patientFullUrl)}</subject>` +
      textNode("date", payload.composition.date) +
      `<author>${textNode("reference", practitionerFullUrl)}${textNode(
        "type",
        "Practitioner",
      )}</author>` +
      `<author>${textNode("type", "Device")}<identifier>${textNode(
        "system",
        "https://fhir.kbv.de/NamingSystem/KBV_NS_FOR_Pruefnummer",
      )}${textNode("value", "Y/400/2107/36/999")}</identifier></author>` +
      textNode("title", "elektronische Arzneimittelverordnung") +
      `<custodian>${textNode("reference", organizationFullUrl)}</custodian>` +
      `<section><code><coding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_ERP_Section_Type",
      )}${textNode("code", "Prescription")}</coding></code><entry>${textNode(
        "reference",
        medicationRequestFullUrl,
      )}</entry></section>` +
      `<section><code><coding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_ERP_Section_Type",
      )}${textNode("code", "Coverage")}</coding></code><entry>${textNode(
        "reference",
        coverageFullUrl,
      )}</entry></section>` +
      `</Composition>`;

    const medicationRequestResourceXml =
      `<MedicationRequest xmlns="http://hl7.org/fhir">` +
      textNode("id", medicationRequestId) +
      metaXml([
        `https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Prescription|${erpProfileVersion}`,
      ]) +
      `<extension url="https://fhir.kbv.de/StructureDefinition/KBV_EX_FOR_StatusCoPayment"><valueCoding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_FOR_StatusCoPayment",
      )}${textNode("code", "0")}</valueCoding></extension>` +
      `<extension url="https://fhir.kbv.de/StructureDefinition/KBV_EX_ERP_EmergencyServicesFee">${textNode(
        "valueBoolean",
        "false",
      )}</extension>` +
      `<extension url="https://fhir.kbv.de/StructureDefinition/KBV_EX_FOR_SER">${textNode(
        "valueBoolean",
        "false",
      )}</extension>` +
      `<extension url="https://fhir.kbv.de/StructureDefinition/KBV_EX_ERP_Multiple_Prescription"><extension url="Kennzeichen">${textNode(
        "valueBoolean",
        "false",
      )}</extension></extension>` +
      `<extension url="https://fhir.kbv.de/StructureDefinition/KBV_EX_ERP_DosageFlag">${textNode(
        "valueBoolean",
        hasDosage ? "true" : "false",
      )}</extension>` +
      (hasDosage
        ? `<extension url="http://hl7.org/fhir/5.0/StructureDefinition/extension-MedicationRequest.renderedDosageInstruction">${textNode(
            "valueMarkdown",
            dosageText,
          )}</extension><extension url="http://ig.fhir.de/igs/medication/StructureDefinition/GeneratedDosageInstructionsMeta"><extension url="algorithmVersion">${textNode(
            "valueString",
            "1.0.0",
          )}</extension><extension url="language">${textNode(
            "valueCode",
            "de-DE",
          )}</extension></extension>`
        : "") +
      textNode("status", payload.medicationRequest.status) +
      textNode("intent", "order") +
      `<medicationReference>${textNode("reference", medicationFullUrl)}</medicationReference>` +
      `<subject>${textNode("reference", patientFullUrl)}</subject>` +
      textNode("authoredOn", authoredOnDate) +
      `<requester>${textNode("reference", practitionerFullUrl)}</requester>` +
      `<insurance>${textNode("reference", coverageFullUrl)}</insurance>` +
      (hasDosage
        ? `<dosageInstruction>${textNode("text", dosageText)}</dosageInstruction>`
        : "") +
      `<dispenseRequest><quantity>${textNode(
        "value",
        "1",
      )}${textNode("unit", "Packung")}</quantity></dispenseRequest>` +
      `<substitution>${textNode("allowedBoolean", "true")}</substitution>` +
      `</MedicationRequest>`;

    const medicationResourceXml =
      `<Medication xmlns="http://hl7.org/fhir">` +
      textNode("id", medicationId) +
      metaXml([
        `https://fhir.kbv.de/StructureDefinition/${medicationProfile}|${erpProfileVersion}`,
      ]) +
      (isPznMedication
        ? `<extension url="https://fhir.kbv.de/StructureDefinition/KBV_EX_Base_Medication_Type"><valueCodeableConcept><coding>${textNode(
            "system",
            "http://snomed.info/sct",
          )}${textNode(
            "version",
            "http://snomed.info/sct/11000274103/version/20240515",
          )}${textNode("code", "763158003")}${textNode(
            "display",
            "Medicinal product (product)",
          )}</coding></valueCodeableConcept></extension>`
        : "") +
      `<extension url="https://fhir.kbv.de/StructureDefinition/KBV_EX_ERP_Medication_Category"><valueCoding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_ERP_Medication_Category",
      )}${textNode("code", "00")}</valueCoding></extension>` +
      `<extension url="https://fhir.kbv.de/StructureDefinition/KBV_EX_ERP_Medication_Vaccine">${textNode(
        "valueBoolean",
        "false",
      )}</extension>` +
      (isPznMedication
        ? `<extension url="http://fhir.de/StructureDefinition/normgroesse">${textNode(
            "valueCode",
            "N1",
          )}</extension>`
        : "") +
      `<code><coding>${textNode(
        "system",
        isPznMedication
          ? "http://fhir.de/CodeSystem/ifa/pzn"
          : "https://fhir.kbv.de/CodeSystem/KBV_CS_ERP_Medication_Type",
      )}${textNode("code", isPznMedication ? medicationCoding?.code : "freitext")}</coding>${textNode(
        "text",
        medicationText,
      )}</code>` +
      (isPznMedication
        ? `<form><coding>${textNode(
            "system",
            "https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_KBV_DARREICHUNGSFORM",
          )}${textNode("code", "TAB")}</coding></form><ingredient><itemCodeableConcept><coding>${textNode(
            "system",
            "http://fhir.de/CodeSystem/ask",
          )}${textNode("code", "00000")}</coding><text value="Wirkstoff"/></itemCodeableConcept><strength><numerator>${textNode(
            "value",
            "1",
          )}${textNode("unit", "mg")}</numerator><denominator>${textNode(
            "value",
            "1",
          )}${textNode("unit", "Stück")}</denominator></strength></ingredient>`
        : "") +
      `</Medication>`;

    const patientResourceXml =
      `<Patient xmlns="http://hl7.org/fhir">` +
      textNode("id", patientId) +
      metaXml([
        `https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Patient|${forProfileVersion}`,
      ]) +
      `<identifier><type><coding>${textNode(
        "system",
        "http://fhir.de/CodeSystem/identifier-type-de-basis",
      )}${textNode("code", "KVZ10")}</coding></type>${textNode(
        "system",
        "http://fhir.de/sid/gkv/kvid-10",
      )}${textNode("value", "S040464113")}</identifier>` +
      `<name>${textNode(
        "use",
        "official",
      )}<family value="${escapeXml(patientFamily)}"><extension url="http://hl7.org/fhir/StructureDefinition/humanname-own-name">${textNode(
        "valueString",
        patientFamily,
      )}</extension></family>${textNode("given", patientGiven)}</name>` +
      textNode("birthDate", payload.patient.birthDate ?? "1964-04-04") +
      `<address>${textNode("type", "both")}${textNode(
        "line",
        payload.patient.address[0]?.line1 ?? "Musterweg 4",
      )}${textNode("city", payload.patient.address[0]?.city ?? "Berlin")}${textNode(
        "postalCode",
        payload.patient.address[0]?.postalCode ?? "10115",
      )}${textNode("country", "D")}</address>` +
      `</Patient>`;

    const practitionerResourceXml =
      `<Practitioner xmlns="http://hl7.org/fhir">` +
      textNode("id", practitionerId) +
      metaXml([
        `https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Practitioner|${forProfileVersion}`,
      ]) +
      `<identifier><type><coding>${textNode(
        "system",
        "http://terminology.hl7.org/CodeSystem/v2-0203",
      )}${textNode("code", "LANR")}</coding></type>${textNode(
        "system",
        "https://fhir.kbv.de/NamingSystem/KBV_NS_Base_ANR",
      )}${textNode(
        "value",
        payload.practitioner.identifier[0]?.value ?? "123456789",
      )}</identifier>` +
      `<name>${textNode(
        "use",
        "official",
      )}<family value="${escapeXml(practitionerFamily)}"><extension url="http://hl7.org/fhir/StructureDefinition/humanname-own-name">${textNode(
        "valueString",
        practitionerFamily,
      )}</extension></family>${textNode(
        "given",
        practitionerGiven,
      )}<prefix value="${escapeXml(practitionerPrefix)}"><extension url="http://hl7.org/fhir/StructureDefinition/iso21090-EN-qualifier">${textNode(
        "valueCode",
        "AC",
      )}</extension></prefix></name>` +
      `<qualification><code><coding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_FOR_Qualification_Type",
      )}${textNode("code", "00")}</coding></code></qualification>` +
      `<qualification><code><coding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_FOR_Berufsbezeichnung",
      )}${textNode("code", "Berufsbezeichnung")}</coding>${textNode(
        "text",
        "Facharzt fuer Innere Medizin",
      )}</code></qualification>` +
      `</Practitioner>`;

    const organizationResourceXml =
      `<Organization xmlns="http://hl7.org/fhir">` +
      textNode("id", organizationId) +
      metaXml([
        `https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Organization|${forProfileVersion}`,
      ]) +
      `<identifier><type><coding>${textNode(
        "system",
        "http://terminology.hl7.org/CodeSystem/v2-0203",
      )}${textNode("code", "BSNR")}</coding></type>${textNode(
        "system",
        "https://fhir.kbv.de/NamingSystem/KBV_NS_Base_BSNR",
      )}${textNode("value", "721111100")}</identifier>` +
      textNode("name", payload.organization.name) +
      `<telecom>${textNode("system", "phone")}${textNode(
        "value",
        "0301234567",
      )}</telecom>` +
      `<address>${textNode("type", "both")}<line value="${escapeXml(
        payload.organization.address[0]?.line1 ?? "Musterweg 4",
      )}"><extension url="http://hl7.org/fhir/StructureDefinition/iso21090-ADXP-houseNumber">${textNode(
        "valueString",
        "4",
      )}</extension><extension url="http://hl7.org/fhir/StructureDefinition/iso21090-ADXP-streetName">${textNode(
        "valueString",
        "Musterweg",
      )}</extension></line>${textNode("city", payload.organization.address[0]?.city ?? "Berlin")}${textNode(
        "postalCode",
        payload.organization.address[0]?.postalCode ?? "10115",
      )}${textNode("country", "D")}</address>` +
      `</Organization>`;

    const coverageResourceXml =
      `<Coverage xmlns="http://hl7.org/fhir">` +
      textNode("id", coverageId) +
      metaXml([
        `https://fhir.kbv.de/StructureDefinition/KBV_PR_FOR_Coverage|${forProfileVersion}`,
      ]) +
      `<extension url="http://fhir.de/StructureDefinition/gkv/besondere-personengruppe"><valueCoding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_KBV_PERSONENGRUPPE",
      )}${textNode("code", "00")}</valueCoding></extension>` +
      `<extension url="http://fhir.de/StructureDefinition/gkv/dmp-kennzeichen"><valueCoding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_KBV_DMP",
      )}${textNode("code", "00")}</valueCoding></extension>` +
      `<extension url="http://fhir.de/StructureDefinition/gkv/wop"><valueCoding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_ITA_WOP",
      )}${textNode("code", "38")}</valueCoding></extension>` +
      `<extension url="http://fhir.de/StructureDefinition/gkv/versichertenart"><valueCoding>${textNode(
        "system",
        "https://fhir.kbv.de/CodeSystem/KBV_CS_SFHIR_KBV_VERSICHERTENSTATUS",
      )}${textNode("code", "1")}</valueCoding></extension>` +
      textNode("status", "active") +
      `<type><coding>${textNode(
        "system",
        "http://fhir.de/CodeSystem/versicherungsart-de-basis",
      )}${textNode("code", "GKV")}</coding></type>` +
      `<beneficiary>${textNode("reference", patientFullUrl)}</beneficiary>` +
      `<payor><identifier>${textNode(
        "system",
        "http://fhir.de/sid/arge-ik/iknr",
      )}${textNode("value", "104212059")}</identifier>${textNode(
        "display",
        payload.coverage.payor[0]?.display ?? "AOK Emit",
      )}</payor>` +
      `</Coverage>`;

    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Bundle xmlns="http://hl7.org/fhir">` +
      textNode("id", bundleId) +
      metaXml([
        `https://fhir.kbv.de/StructureDefinition/KBV_PR_ERP_Bundle|${erpProfileVersion}`,
      ]) +
      `<identifier>${textNode(
        "system",
        "https://gematik.de/fhir/erp/NamingSystem/GEM_ERP_NS_PrescriptionId",
      )}${textNode("value", "160.100.000.000.021.76")}</identifier>` +
      textNode("type", "document") +
      textNode("timestamp", payload.bundle.timestamp) +
      bundleEntryWithFullUrlXml(compositionFullUrl, compositionResourceXml) +
      bundleEntryWithFullUrlXml(
        medicationRequestFullUrl,
        medicationRequestResourceXml,
      ) +
      bundleEntryWithFullUrlXml(medicationFullUrl, medicationResourceXml) +
      bundleEntryWithFullUrlXml(patientFullUrl, patientResourceXml) +
      bundleEntryWithFullUrlXml(practitionerFullUrl, practitionerResourceXml) +
      bundleEntryWithFullUrlXml(organizationFullUrl, organizationResourceXml) +
      bundleEntryWithFullUrlXml(coverageFullUrl, coverageResourceXml) +
      `</Bundle>`
    );
  })();

export const renderEauBundleXml = (payload: typeof EauPayload.Type) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<Bundle xmlns="http://hl7.org/fhir">` +
  textNode("type", payload.bundle.type) +
  textNode("timestamp", payload.bundle.timestamp) +
  bundleEntryXml(compositionXml(payload.composition)) +
  bundleEntryXml(patientXml(payload.patient)) +
  bundleEntryXml(practitionerXml(payload.practitioner)) +
  bundleEntryXml(organizationXml(payload.organization)) +
  bundleEntryXml(coverageXml(payload.coverage)) +
  bundleEntryXml(encounterXml(payload.encounter)) +
  payload.conditions
    .map((condition) => bundleEntryXml(conditionXml(condition)))
    .join("") +
  `</Bundle>`;

export const renderEvdgaBundleXml = (payload: typeof EvdgaPayload.Type) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<Bundle xmlns="http://hl7.org/fhir">` +
  textNode("type", payload.bundle.type) +
  textNode("timestamp", payload.bundle.timestamp) +
  bundleEntryXml(compositionXml(payload.composition)) +
  bundleEntryXml(patientXml(payload.patient)) +
  bundleEntryXml(practitionerXml(payload.practitioner)) +
  bundleEntryXml(organizationXml(payload.organization)) +
  bundleEntryXml(coverageXml(payload.coverage)) +
  bundleEntryXml(deviceRequestXml(payload.deviceRequest)) +
  `</Bundle>`;
