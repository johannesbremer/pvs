import { GenericId } from "@confect/core";
import { Schema } from "effect";

import {
  EebInboxItemsFields,
  KimMailboxesFields,
  VsdCoveragePayloadFields,
} from "../../confect/tables/core";
import {
  AttachmentRefValue,
  IsoDateTime,
} from "../../confect/tables/primitives";
import {
  CoverageDocument,
  ManualPatientSeedFields,
  PatientDocument,
  VsdSnapshotDocument,
} from "./patients";
import { withSystemFields } from "./shared";

export const KimMailboxDocument = withSystemFields(
  "kimMailboxes",
  KimMailboxesFields,
);
export const EebInboxItemDocument = withSystemFields(
  "eebInboxItems",
  EebInboxItemsFields,
);

export const RegisterKimMailboxArgs = KimMailboxesFields;

export const RegisterKimMailboxResult = Schema.Struct({
  mailboxId: GenericId.GenericId("kimMailboxes"),
});

export const QuarterCardReadStatus = Schema.Struct({
  hasCardRead: Schema.Boolean,
  quarter: Schema.String,
});

export const EebInboxItemView = Schema.Struct({
  inboxItem: EebInboxItemDocument,
  matchedCoverage: Schema.optional(CoverageDocument),
  matchedPatient: Schema.optional(PatientDocument),
  quarterCardRead: QuarterCardReadStatus,
  snapshot: Schema.optional(VsdSnapshotDocument),
});

export const ReceiveEebInboxItemArgs = Schema.Struct({
  attachment: AttachmentRefValue,
  coveragePayload: VsdCoveragePayloadFields,
  kimMailboxId: GenericId.GenericId("kimMailboxes"),
  kimMessageId: Schema.String,
  onlineCheckErrorCode3012: Schema.optional(Schema.String),
  onlineCheckPruefziffer3013: Schema.optional(Schema.String),
  onlineCheckResult3011: Schema.optional(Schema.String),
  onlineCheckTimestamp3010: Schema.optional(IsoDateTime),
  receivedAt: IsoDateTime,
  schemaVersion3006: Schema.optional(Schema.String),
  senderDisplay: Schema.optional(Schema.String),
  senderVerified: Schema.Boolean,
  serviceIdentifier: Schema.String,
  versichertenId3119: Schema.optional(Schema.String),
});

export const ReceiveEebInboxItemMailboxMissing = Schema.Struct({
  outcome: Schema.Literal("kim-mailbox-not-found"),
});

export const ReceiveEebInboxItemDuplicate = Schema.Struct({
  inboxItemId: GenericId.GenericId("eebInboxItems"),
  outcome: Schema.Literal("duplicate-message"),
});

export const ReceiveEebInboxItemReceived = Schema.Struct({
  inboxItemId: GenericId.GenericId("eebInboxItems"),
  integrationJobId: GenericId.GenericId("integrationJobs"),
  matchedCoverageId: Schema.optional(GenericId.GenericId("coverages")),
  matchedPatientId: Schema.optional(GenericId.GenericId("patients")),
  outcome: Schema.Literal("received"),
  payloadArtifactId: GenericId.GenericId("artifacts"),
  quarterCardRead: QuarterCardReadStatus,
  snapshotId: GenericId.GenericId("vsdSnapshots"),
});

export const ReceiveEebInboxItemResult = Schema.Union(
  ReceiveEebInboxItemMailboxMissing,
  ReceiveEebInboxItemDuplicate,
  ReceiveEebInboxItemReceived,
);

export const GetEebInboxItemArgs = Schema.Struct({
  eebInboxItemId: GenericId.GenericId("eebInboxItems"),
});

export const GetEebInboxItemFound = Schema.Struct({
  found: Schema.Literal(true),
  view: EebInboxItemView,
});

export const GetEebInboxItemMissing = Schema.Struct({
  found: Schema.Literal(false),
});

export const GetEebInboxItemResult = Schema.Union(
  GetEebInboxItemFound,
  GetEebInboxItemMissing,
);

export const ListEebInboxItemsArgs = Schema.Struct({
  adoptionState: Schema.optional(
    Schema.Literal("pending", "accepted", "rejected"),
  ),
  matchedPatientId: Schema.optional(GenericId.GenericId("patients")),
  matchState: Schema.optional(
    Schema.Literal(
      "unmatched",
      "matched-existing",
      "new-patient",
      "manual-review",
    ),
  ),
});

export const ListEebInboxItemsResult = Schema.Array(EebInboxItemView);

export const AdoptEebInboxItemArgs = Schema.Struct({
  eebInboxItemId: GenericId.GenericId("eebInboxItems"),
  existingPatientId: Schema.optional(GenericId.GenericId("patients")),
  patientSeed: Schema.optional(ManualPatientSeedFields),
});

export const AdoptEebInboxItemMissing = Schema.Struct({
  outcome: Schema.Literal("eeb-inbox-item-not-found"),
});

export const AdoptEebInboxItemNotPending = Schema.Struct({
  adoptionState: Schema.Literal("accepted", "rejected"),
  outcome: Schema.Literal("adoption-not-pending"),
});

export const AdoptEebInboxItemSenderUnverified = Schema.Struct({
  outcome: Schema.Literal("sender-not-verified"),
});

export const AdoptEebInboxItemNeedsSeed = Schema.Struct({
  outcome: Schema.Literal("needs-patient-seed"),
});

export const AdoptEebInboxItemCardReadRequired = Schema.Struct({
  outcome: Schema.Literal("quarter-card-read-required"),
  quarter: Schema.String,
});

export const AdoptEebInboxItemSnapshotMissing = Schema.Struct({
  outcome: Schema.Literal("snapshot-not-found"),
});

export const AdoptEebInboxItemAdopted = Schema.Struct({
  coverageCreated: Schema.Boolean,
  coverageId: GenericId.GenericId("coverages"),
  inboxItemId: GenericId.GenericId("eebInboxItems"),
  matchedPatientId: GenericId.GenericId("patients"),
  outcome: Schema.Literal("adopted"),
  patientCreated: Schema.Boolean,
  patientIdentifierId: Schema.optional(
    GenericId.GenericId("patientIdentifiers"),
  ),
  snapshotId: GenericId.GenericId("vsdSnapshots"),
});

export const AdoptEebInboxItemResult = Schema.Union(
  AdoptEebInboxItemMissing,
  AdoptEebInboxItemNotPending,
  AdoptEebInboxItemSenderUnverified,
  AdoptEebInboxItemNeedsSeed,
  AdoptEebInboxItemCardReadRequired,
  AdoptEebInboxItemSnapshotMissing,
  AdoptEebInboxItemAdopted,
);
