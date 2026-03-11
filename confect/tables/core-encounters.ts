import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import { CodingValue, IsoDate, IsoDateTime } from "./primitives";

export const AppointmentsFields = Schema.Struct({
  displayBucket: Schema.optional(Schema.String),
  end: Schema.optional(IsoDateTime),
  externalAppointmentId: Schema.optional(Schema.String),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  organizationId: GenericId.GenericId("organizations"),
  patientId: Schema.optional(GenericId.GenericId("patients")),
  source: Schema.Literal("internal", "tss"),
  start: IsoDateTime,
  status: Schema.Literal(
    "proposed",
    "booked",
    "fulfilled",
    "cancelled",
    "noshow",
  ),
  tssServiceType: Schema.optional(Schema.String),
  vermittlungscode: Schema.optional(Schema.String),
});

export const Appointments = unsafeMakeTable("appointments", AppointmentsFields)
  .index("by_patientId_and_start", ["patientId", "start"])
  .index("by_source_and_externalAppointmentId", [
    "source",
    "externalAppointmentId",
  ])
  .index("by_organizationId_and_start", ["organizationId", "start"]);

export const EncountersFields = Schema.Struct({
  appointmentId: Schema.optional(GenericId.GenericId("appointments")),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  caseType: Schema.Literal(
    "regular",
    "tss",
    "accident",
    "asv",
    "home-visit",
    "heilmittel",
    "prescription-only",
  ),
  coverageId: Schema.optional(GenericId.GenericId("coverages")),
  end: Schema.optional(IsoDateTime),
  locationId: Schema.optional(GenericId.GenericId("practiceLocations")),
  organizationId: GenericId.GenericId("organizations"),
  patientId: GenericId.GenericId("patients"),
  practitionerRoleId: Schema.optional(GenericId.GenericId("practitionerRoles")),
  quarter: Schema.String,
  start: IsoDateTime,
});

export const Encounters = unsafeMakeTable("encounters", EncountersFields)
  .index("by_patientId_and_start", ["patientId", "start"])
  .index("by_billingCaseId", ["billingCaseId"])
  .index("by_quarter_and_organizationId", ["quarter", "organizationId"]);

export const ReferralsFields = Schema.Struct({
  erstveranlasserBsnr: Schema.optional(Schema.String),
  erstveranlasserLanr: Schema.optional(Schema.String),
  issueDate: IsoDate,
  patientId: GenericId.GenericId("patients"),
  reasonCodes: Schema.Array(CodingValue),
  recipientOrganizationId: Schema.optional(
    GenericId.GenericId("organizations"),
  ),
  recipientPractitionerId: Schema.optional(
    GenericId.GenericId("practitioners"),
  ),
  requesterRoleId: GenericId.GenericId("practitionerRoles"),
  status: Schema.Literal("active", "used", "cancelled", "expired"),
  vermittlungscode: Schema.optional(Schema.String),
});

export const Referrals = unsafeMakeTable("referrals", ReferralsFields)
  .index("by_patientId_and_issueDate", ["patientId", "issueDate"])
  .index("by_vermittlungscode", ["vermittlungscode"]);
