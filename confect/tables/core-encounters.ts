import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import { CodingValue, IsoDate, IsoDateTime } from "./primitives";

export const AppointmentsFields = Schema.Struct({
  patientId: Schema.optional(GenericId.GenericId("patients")),
  organizationId: GenericId.GenericId("organizations"),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  start: IsoDateTime,
  end: Schema.optional(IsoDateTime),
  status: Schema.Literal(
    "proposed",
    "booked",
    "fulfilled",
    "cancelled",
    "noshow",
  ),
  source: Schema.Literal("internal", "tss"),
  externalAppointmentId: Schema.optional(Schema.String),
  vermittlungscode: Schema.optional(Schema.String),
  tssServiceType: Schema.optional(Schema.String),
  displayBucket: Schema.optional(Schema.String),
});

export const Appointments = unsafeMakeTable("appointments", AppointmentsFields)
  .index("by_patientId_and_start", ["patientId", "start"])
  .index("by_source_and_externalAppointmentId", ["source", "externalAppointmentId"])
  .index("by_organizationId_and_start", ["organizationId", "start"]);

export const EncountersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  organizationId: GenericId.GenericId("organizations"),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  practitionerRoleId: Schema.optional(GenericId.GenericId("practitionerRoles")),
  appointmentId: Schema.optional(GenericId.GenericId("appointments")),
  coverageId: Schema.optional(GenericId.GenericId("coverages")),
  quarter: Schema.String,
  start: IsoDateTime,
  end: Schema.optional(IsoDateTime),
  caseType: Schema.Literal(
    "regular",
    "tss",
    "accident",
    "asv",
    "home-visit",
    "heilmittel",
    "prescription-only",
  ),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
});

export const Encounters = unsafeMakeTable("encounters", EncountersFields)
  .index("by_patientId_and_start", ["patientId", "start"])
  .index("by_billingCaseId", ["billingCaseId"])
  .index("by_quarter_and_organizationId", ["quarter", "organizationId"]);

export const ReferralsFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  requesterRoleId: GenericId.GenericId("practitionerRoles"),
  recipientOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  recipientPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  issueDate: IsoDate,
  reasonCodes: Schema.Array(CodingValue),
  vermittlungscode: Schema.optional(Schema.String),
  erstveranlasserBsnr: Schema.optional(Schema.String),
  erstveranlasserLanr: Schema.optional(Schema.String),
  status: Schema.Literal("active", "used", "cancelled", "expired"),
});

export const Referrals = unsafeMakeTable("referrals", ReferralsFields)
  .index("by_patientId_and_issueDate", ["patientId", "issueDate"])
  .index("by_vermittlungscode", ["vermittlungscode"]);
