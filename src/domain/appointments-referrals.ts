import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  AppointmentsFields,
  ReferralsFields,
} from "../../confect/tables/core-encounters";
import { IsoDateTime } from "../../confect/tables/primitives";
import { withSystemFields } from "./shared";

export const AppointmentDocument = withSystemFields(
  "appointments",
  AppointmentsFields,
);
export const ReferralDocument = withSystemFields("referrals", ReferralsFields);

export const CreateAppointmentArgs = AppointmentsFields;
export const CreateAppointmentResult = Schema.Struct({
  appointmentId: GenericId.GenericId("appointments"),
});

export const ListAppointmentsArgs = Schema.Struct({
  organizationId: GenericId.GenericId("organizations"),
  patientId: Schema.optional(GenericId.GenericId("patients")),
  source: Schema.optional(Schema.Literal("internal", "tss")),
  startFrom: Schema.optional(IsoDateTime),
  startTo: Schema.optional(IsoDateTime),
  status: Schema.optional(
    Schema.Literal("proposed", "booked", "fulfilled", "cancelled", "noshow"),
  ),
  tssServiceType: Schema.optional(Schema.String),
  vermittlungscode: Schema.optional(Schema.String),
});
export const ListAppointmentsResult = Schema.Array(AppointmentDocument);

export const ListAvailableTssAppointmentsArgs = Schema.Struct({
  displayBucket: Schema.optional(Schema.String),
  organizationId: GenericId.GenericId("organizations"),
  startFrom: Schema.optional(IsoDateTime),
  startTo: Schema.optional(IsoDateTime),
  tssServiceType: Schema.optional(Schema.String),
  vermittlungscode: Schema.optional(Schema.String),
});
export const ListAvailableTssAppointmentsResult =
  Schema.Array(AppointmentDocument);

export const BookTssAppointmentArgs = Schema.Struct({
  appointmentId: GenericId.GenericId("appointments"),
  patientId: GenericId.GenericId("patients"),
  vermittlungscode: Schema.optional(Schema.String),
});
export const BookTssAppointmentBooked = Schema.Struct({
  appointmentId: GenericId.GenericId("appointments"),
  outcome: Schema.Literal("booked"),
});
export const BookTssAppointmentBlocked = Schema.Struct({
  outcome: Schema.Literal("not-bookable"),
  reason: Schema.String,
});
export const BookTssAppointmentMissing = Schema.Struct({
  outcome: Schema.Literal("appointment-not-found"),
});
export const BookTssAppointmentResult = Schema.Union(
  BookTssAppointmentBooked,
  BookTssAppointmentBlocked,
  BookTssAppointmentMissing,
);

export const CreateReferralArgs = ReferralsFields;
export const CreateReferralResult = Schema.Struct({
  referralId: GenericId.GenericId("referrals"),
});

export const ListReferralsByPatientArgs = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  status: Schema.optional(
    Schema.Literal("active", "used", "cancelled", "expired"),
  ),
});
export const ListReferralsByPatientResult = Schema.Array(ReferralDocument);

export const LookupReferralByVermittlungscodeArgs = Schema.Struct({
  vermittlungscode: Schema.String,
});
export const LookupReferralByVermittlungscodeFound = Schema.Struct({
  found: Schema.Literal(true),
  referral: ReferralDocument,
});
export const LookupReferralByVermittlungscodeMissing = Schema.Struct({
  found: Schema.Literal(false),
});
export const LookupReferralByVermittlungscodeResult = Schema.Union(
  LookupReferralByVermittlungscodeFound,
  LookupReferralByVermittlungscodeMissing,
);

export interface TssAppointmentPreview {
  readonly appointmentId?: string;
  readonly displayBucket?: string;
  readonly end?: string;
  readonly externalAppointmentId?: string;
  readonly organizationId: string;
  readonly patientId?: string;
  readonly source: "internal" | "tss";
  readonly start: string;
  readonly status: "booked" | "cancelled" | "fulfilled" | "noshow" | "proposed";
  readonly tssServiceType?: string;
  readonly vermittlungscode?: string;
}

export interface TssSelectionCriteria {
  readonly displayBucket?: string;
  readonly organizationId: string;
  readonly startFrom?: string;
  readonly startTo?: string;
  readonly tssServiceType?: string;
  readonly vermittlungscode?: string;
}

const withinRange = (
  timestamp: string,
  startFrom?: string,
  startTo?: string,
) => {
  if (startFrom && timestamp < startFrom) {
    return false;
  }
  if (startTo && timestamp > startTo) {
    return false;
  }
  return true;
};

export const filterSelectableTssAppointments = (
  appointments: readonly TssAppointmentPreview[],
  criteria: TssSelectionCriteria,
) =>
  appointments
    .filter(
      (appointment) => appointment.organizationId === criteria.organizationId,
    )
    .filter((appointment) => appointment.source === "tss")
    .filter((appointment) => appointment.status === "proposed")
    .filter((appointment) =>
      withinRange(appointment.start, criteria.startFrom, criteria.startTo),
    )
    .filter((appointment) =>
      criteria.vermittlungscode === undefined
        ? true
        : appointment.vermittlungscode === criteria.vermittlungscode,
    )
    .filter((appointment) =>
      criteria.tssServiceType === undefined
        ? true
        : appointment.tssServiceType === criteria.tssServiceType,
    )
    .filter((appointment) =>
      criteria.displayBucket === undefined
        ? true
        : appointment.displayBucket === criteria.displayBucket,
    )
    .sort((left, right) => left.start.localeCompare(right.start));
