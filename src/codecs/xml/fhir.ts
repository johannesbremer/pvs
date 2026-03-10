import { EauPayload } from "../../fhir-r4-effect/resources/eau";
import { ErpPayload } from "../../fhir-r4-effect/resources/erp";

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
  readonly given: ReadonlyArray<string>;
}) =>
  `<name>${textNode("family", name.family)}${name.given
    .map((given) => textNode("given", given))
    .join("")}</name>`;

const addressXml = (address: {
  readonly line1: string;
  readonly city?: string;
  readonly postalCode?: string;
}) =>
  `<address>${textNode("line", address.line1)}${textNode(
    "city",
    address.city,
  )}${textNode("postalCode", address.postalCode)}</address>`;

const codingXml = (coding: {
  readonly system: string;
  readonly code: string;
  readonly display?: string;
}) =>
  `<coding>${textNode("system", coding.system)}${textNode(
    "code",
    coding.code,
  )}${textNode("display", coding.display)}</coding>`;

const codeableConceptXml = (concept: {
  readonly coding: ReadonlyArray<{
    readonly system: string;
    readonly code: string;
    readonly display?: string;
  }>;
  readonly text?: string;
}) =>
  `<code>${concept.coding.map(codingXml).join("")}${textNode(
    "text",
    concept.text,
  )}</code>`;

const referenceXml = (tagName: string, reference: {
  readonly reference: string;
  readonly display?: string;
}) =>
  `<${tagName}>${textNode("reference", reference.reference)}${textNode(
    "display",
    reference.display,
  )}</${tagName}>`;

const bundleEntryXml = (resourceXml: string) => `<entry><resource>${resourceXml}</resource></entry>`;

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

const medicationRequestXml = (resource: typeof ErpPayload.Type.medicationRequest) =>
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
    .map((instruction) => `<dosageInstruction>${textNode("text", instruction.text)}</dosageInstruction>`)
    .join("")}</MedicationRequest>`;

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

const conditionXml = (resource: typeof EauPayload.Type.conditions[number]) =>
  `<Condition xmlns="http://hl7.org/fhir">${textNode("id", resource.id)}${codeableConceptXml(
    resource.code,
  )}${referenceXml("subject", resource.subject)}${
    resource.encounter ? referenceXml("encounter", resource.encounter) : ""
  }${textNode("recordedDate", resource.recordedDate)}</Condition>`;

export const renderErpBundleXml = (payload: typeof ErpPayload.Type) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<Bundle xmlns="http://hl7.org/fhir">` +
  textNode("type", payload.bundle.type) +
  textNode("timestamp", payload.bundle.timestamp) +
  bundleEntryXml(compositionXml(payload.composition)) +
  bundleEntryXml(patientXml(payload.patient)) +
  bundleEntryXml(practitionerXml(payload.practitioner)) +
  bundleEntryXml(organizationXml(payload.organization)) +
  bundleEntryXml(coverageXml(payload.coverage)) +
  bundleEntryXml(medicationXml(payload.medication)) +
  bundleEntryXml(medicationRequestXml(payload.medicationRequest)) +
  `</Bundle>`;

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
  payload.conditions.map((condition) => bundleEntryXml(conditionXml(condition))).join("") +
  `</Bundle>`;
