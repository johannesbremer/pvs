import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import { AttachmentRefValue, IsoDateTime } from "./primitives";

export const ArtifactsFields = Schema.Struct({
  artifactFamily: Schema.String,
  artifactSubtype: Schema.String,
  attachment: AttachmentRefValue,
  contentType: Schema.String,
  direction: Schema.Literal("inbound", "outbound", "internal"),
  externalIdentifier: Schema.optional(Schema.String),
  immutableAt: IsoDateTime,
  ownerId: Schema.String,
  ownerKind: Schema.Literal(
    "documentRevision",
    "billingCase",
    "eebInboxItem",
    "masterDataPackage",
    "integrationJob",
  ),
  profileVersion: Schema.optional(Schema.String),
  transportKind: Schema.String,
  validationStatus: Schema.Literal("pending", "valid", "invalid"),
  validationSummary: Schema.optional(Schema.String),
});

export const Artifacts = unsafeMakeTable("artifacts", ArtifactsFields)
  .index("by_ownerKind_and_ownerId", ["ownerKind", "ownerId"])
  .index("by_artifactFamily_and_validationStatus", [
    "artifactFamily",
    "validationStatus",
  ])
  .index("by_externalIdentifier", ["externalIdentifier"]);

export const IntegrationJobsFields = Schema.Struct({
  attemptCount: Schema.Number,
  counterparty: Schema.optional(Schema.String),
  direction: Schema.Literal("inbound", "outbound"),
  idempotencyKey: Schema.String,
  jobType: Schema.String,
  nextAttemptAt: Schema.optional(IsoDateTime),
  ownerId: Schema.String,
  ownerKind: Schema.String,
  payloadArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  selectedProfileId: Schema.optional(GenericId.GenericId("interfaceProfiles")),
  status: Schema.Literal("queued", "running", "waiting", "failed", "done"),
});

export const IntegrationJobs = unsafeMakeTable(
  "integrationJobs",
  IntegrationJobsFields,
)
  .index("by_jobType_and_status", ["jobType", "status"])
  .index("by_ownerKind_and_ownerId", ["ownerKind", "ownerId"])
  .index("by_idempotencyKey", ["idempotencyKey"]);

export const IntegrationEventsFields = Schema.Struct({
  artifactId: Schema.optional(GenericId.GenericId("artifacts")),
  eventType: Schema.String,
  externalCorrelationId: Schema.optional(Schema.String),
  jobId: GenericId.GenericId("integrationJobs"),
  message: Schema.optional(Schema.String),
  occurredAt: IsoDateTime,
});

export const IntegrationEvents = unsafeMakeTable(
  "integrationEvents",
  IntegrationEventsFields,
).index("by_jobId_and_occurredAt", ["jobId", "occurredAt"]);

export const DraftWorkspacesFields = Schema.Struct({
  lastTouchedAt: IsoDateTime,
  lastTouchedBy: Schema.String,
  ownerId: Schema.String,
  ownerKind: Schema.String,
  schemaVersion: Schema.Number,
  snapshot: Schema.Unknown,
  status: Schema.Literal("open", "abandoned", "promoted"),
  workflowKind: Schema.String,
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
