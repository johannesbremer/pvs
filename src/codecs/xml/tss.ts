export interface ParsedOfficialTssAppointment {
  readonly bookedByRoleCode?: string;
  readonly end?: string;
  readonly externalAppointmentId: string;
  readonly organizationBsnr?: string;
  readonly patient?: ParsedOfficialTssPatient;
  readonly serviceTypeCode?: string;
  readonly serviceTypeDisplay?: string;
  readonly start: string;
  readonly status: "booked" | "cancelled" | "fulfilled" | "noshow" | "proposed";
  readonly urgencyCode?: string;
  readonly urgencyDisplay?: string;
  readonly vermittlungscode?: string;
}

export interface ParsedOfficialTssPatient {
  readonly birthDate?: string;
  readonly family?: string;
  readonly gender?: string;
  readonly given: readonly string[];
  readonly insuranceIdentifier?: string;
  readonly telecom: readonly string[];
}

export interface ParsedOfficialTssSearchset {
  readonly appointments: readonly ParsedOfficialTssAppointment[];
  readonly bundleTimestamp?: string;
  readonly total?: number;
}

const matchAttribute = (xml: string, attribute: string) => {
  const match = new RegExp(`${attribute}="([^"]*)"`, "u").exec(xml);
  return match?.[1];
};

const matchTagValue = (xml: string, tagName: string) => {
  const match = new RegExp(`<${tagName}[^>]*value="([^"]*)"[^>]*/?>`, "u").exec(
    xml,
  );
  return match?.[1];
};

const matchAllTagValues = (xml: string, tagName: string) =>
  [...xml.matchAll(new RegExp(`<${tagName}[^>]*value="([^"]*)"[^>]*/?>`, "gu"))]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);

const collectEntryResources = (xml: string, resourceType: string) =>
  [
    ...xml.matchAll(
      new RegExp(`<${resourceType}>([\\s\\S]*?)</${resourceType}>`, "gu"),
    ),
  ]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);

const extractPatient = (xml: string): ParsedOfficialTssPatient | undefined => {
  const patientXml = collectEntryResources(xml, "Patient")[0];
  if (!patientXml) {
    return undefined;
  }

  const identifierBlocks = [
    ...patientXml.matchAll(/<identifier>([\s\S]*?)<\/identifier>/gu),
  ].map((match) => match[1]);
  const insuranceIdentifier = identifierBlocks
    .map((block) => matchTagValue(block, "value"))
    .find((value) => value !== undefined);

  const firstNameBlock = /<name>([\s\S]*?)<\/name>/u.exec(patientXml)?.[1];

  return {
    ...(matchTagValue(patientXml, "birthDate")
      ? { birthDate: matchTagValue(patientXml, "birthDate") }
      : {}),
    ...(firstNameBlock && matchTagValue(firstNameBlock, "family")
      ? { family: matchTagValue(firstNameBlock, "family") }
      : {}),
    ...(matchTagValue(patientXml, "gender")
      ? { gender: matchTagValue(patientXml, "gender") }
      : {}),
    given: firstNameBlock ? matchAllTagValues(firstNameBlock, "given") : [],
    ...(insuranceIdentifier ? { insuranceIdentifier } : {}),
    telecom: [...patientXml.matchAll(/<telecom>([\s\S]*?)<\/telecom>/gu)]
      .map((match) => matchTagValue(match[1], "value"))
      .filter((value): value is string => value !== undefined),
  };
};

const extractOrganizationBsnr = (xml: string) => {
  const roleXml = collectEntryResources(xml, "PractitionerRole")[0];
  if (!roleXml) {
    return undefined;
  }
  const organizationBlock = /<organization>([\s\S]*?)<\/organization>/u.exec(
    roleXml,
  )?.[1];
  return organizationBlock
    ? matchTagValue(organizationBlock, "value")
    : undefined;
};

const extractAppointments = (
  xml: string,
  shared: {
    readonly organizationBsnr?: string;
    readonly patient?: ParsedOfficialTssPatient;
  },
) =>
  collectEntryResources(xml, "Appointment").map((appointmentXml) => {
    const serviceTypeBlock = /<serviceType>([\s\S]*?)<\/serviceType>/u.exec(
      appointmentXml,
    )?.[1];
    const urgencyBlock = /<priority>([\s\S]*?)<\/priority>/u.exec(
      appointmentXml,
    )?.[1];
    const basedOnBlock = /<basedOn>([\s\S]*?)<\/basedOn>/u.exec(
      appointmentXml,
    )?.[1];
    const bookedByBlock =
      /Appointment_Booked_By">([\s\S]*?)<\/extension>/u.exec(
        appointmentXml,
      )?.[1];

    return {
      ...(bookedByBlock && matchTagValue(bookedByBlock, "code")
        ? { bookedByRoleCode: matchTagValue(bookedByBlock, "code") }
        : {}),
      ...(matchTagValue(appointmentXml, "end")
        ? { end: matchTagValue(appointmentXml, "end") }
        : {}),
      externalAppointmentId:
        matchTagValue(appointmentXml, "id") ?? "unknown-appointment",
      ...(shared.organizationBsnr
        ? { organizationBsnr: shared.organizationBsnr }
        : {}),
      ...(shared.patient ? { patient: shared.patient } : {}),
      ...(serviceTypeBlock && matchTagValue(serviceTypeBlock, "code")
        ? { serviceTypeCode: matchTagValue(serviceTypeBlock, "code") }
        : {}),
      ...(serviceTypeBlock && matchTagValue(serviceTypeBlock, "display")
        ? { serviceTypeDisplay: matchTagValue(serviceTypeBlock, "display") }
        : {}),
      start: matchTagValue(appointmentXml, "start") ?? "",
      status:
        (matchTagValue(
          appointmentXml,
          "status",
        ) as ParsedOfficialTssAppointment["status"]) ?? "proposed",
      ...(urgencyBlock && matchTagValue(urgencyBlock, "code")
        ? { urgencyCode: matchTagValue(urgencyBlock, "code") }
        : {}),
      ...(urgencyBlock && matchTagValue(urgencyBlock, "display")
        ? { urgencyDisplay: matchTagValue(urgencyBlock, "display") }
        : {}),
      ...(basedOnBlock && matchTagValue(basedOnBlock, "value")
        ? {
            vermittlungscode: matchTagValue(basedOnBlock, "value")?.replaceAll(
              "-",
              "",
            ),
          }
        : {}),
    };
  });

export const parseOfficialTssSearchsetXml = (
  xml: string,
): ParsedOfficialTssSearchset => {
  const patient = extractPatient(xml);
  const organizationBsnr = extractOrganizationBsnr(xml);
  return {
    appointments: extractAppointments(xml, {
      ...(organizationBsnr ? { organizationBsnr } : {}),
      ...(patient ? { patient } : {}),
    }),
    ...(matchTagValue(xml, "timestamp")
      ? { bundleTimestamp: matchTagValue(xml, "timestamp") }
      : {}),
    ...(matchTagValue(xml, "total")
      ? { total: Number.parseInt(matchTagValue(xml, "total") ?? "0", 10) }
      : {}),
  };
};
