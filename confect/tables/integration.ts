import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import { AttachmentRefValue, IsoDateTime } from "./primitives";

export const ArtifactsFields = Schema.Struct({
  ownerKind: Schema.Literal(
    "documentRevision",
    "billingCase",
    "eebInboxItem",
    "masterDataPackage",
    "integrationJob",
  ),
  ownerId: Schema.String,
  direction: Schema.Literal("inbound", "outbound", "internal"),
  artifactFamily: Schema.String,
  artifactSubtype: Schema.String,
  profileVersion: Schema.optional(Schema.String),
  transportKind: Schema.String,
  contentType: Schema.String,
  attachment: AttachmentRefValue,
  externalIdentifier: Schema.optional(Schema.String),
  validationStatus: Schema.Literal("pending", "valid", "invalid"),
  validationSummary: Schema.optional(Schema.String),
  immutableAt: IsoDateTime,
});

export const Artifacts = unsafeMakeTable("artifacts", ArtifactsFields)
  .index("by_ownerKind_and_ownerId", ["ownerKind", "ownerId"])
  .index("by_artifactFamily_and_validationStatus", [
    "artifactFamily",
    "validationStatus",
  ])
  .index("by_externalIdentifier", ["externalIdentifier"]);

export const IntegrationJobsFields = Schema.Struct({
  jobType: Schema.String,
  ownerKind: Schema.String,
  ownerId: Schema.String,
  direction: Schema.Literal("inbound", "outbound"),
  status: Schema.Literal("queued", "running", "waiting", "failed", "done"),
  idempotencyKey: Schema.String,
  selectedProfileId: Schema.optional(GenericId.GenericId("interfaceProfiles")),
  payloadArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  attemptCount: Schema.Number,
  nextAttemptAt: Schema.optional(IsoDateTime),
  counterparty: Schema.optional(Schema.String),
});

export const IntegrationJobs = unsafeMakeTable(
  "integrationJobs",
  IntegrationJobsFields,
)
  .index("by_jobType_and_status", ["jobType", "status"])
  .index("by_ownerKind_and_ownerId", ["ownerKind", "ownerId"])
  .index("by_idempotencyKey", ["idempotencyKey"]);

export const IntegrationEventsFields = Schema.Struct({
  jobId: GenericId.GenericId("integrationJobs"),
  eventType: Schema.String,
  occurredAt: IsoDateTime,
  message: Schema.optional(Schema.String),
  artifactId: Schema.optional(GenericId.GenericId("artifacts")),
  externalCorrelationId: Schema.optional(Schema.String),
});

export const IntegrationEvents = unsafeMakeTable(
  "integrationEvents",
  IntegrationEventsFields,
).index("by_jobId_and_occurredAt", ["jobId", "occurredAt"]);

export const DraftWorkspacesFields = Schema.Struct({
  ownerKind: Schema.String,
  ownerId: Schema.String,
  workflowKind: Schema.String,
  status: Schema.Literal("open", "abandoned", "promoted"),
  snapshot: Schema.Unknown,
  schemaVersion: Schema.Number,
  lastTouchedAt: IsoDateTime,
  lastTouchedBy: Schema.String,
});

export const DraftWorkspaces = unsafeMakeTable(
  "draftWorkspaces",
  DraftWorkspacesFields,
)
  .index("by_ownerKind_and_ownerId", ["ownerKind", "ownerId"])
  .index("by_workflowKind_and_status", ["workflowKind", "status"]);

export const IntegrationTables = [
  Artifacts,
  IntegrationJobs,
  IntegrationEvents,
  DraftWorkspaces,
] as const;
