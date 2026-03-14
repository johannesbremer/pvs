import { TestConfect as TestConfectModule } from "@confect/test";
import { Effect } from "effect";

import schema from "../confect/schema";

export const TestConfect = TestConfectModule.TestConfect<typeof schema>();

export const makeTestLayer = TestConfectModule.layer(schema, {
  "../convex/_generated/api.ts": () => import("../convex/_generated/api"),
  "../convex/appointments.ts": () => import("../convex/appointments"),
  "../convex/billing.ts": () => import("../convex/billing"),
  "../convex/catalog.ts": () => import("../convex/catalog"),
  "../convex/coding.ts": () => import("../convex/coding"),
  "../convex/coverages.ts": () => import("../convex/coverages"),
  "../convex/diga.ts": () => import("../convex/diga"),
  "../convex/documents.ts": () => import("../convex/documents"),
  "../convex/drafts.ts": () => import("../convex/drafts"),
  "../convex/heilmittel.ts": () => import("../convex/heilmittel"),
  "../convex/integration.ts": () => import("../convex/integration"),
  "../convex/patients.ts": () => import("../convex/patients"),
  "../convex/prescriptions.ts": () => import("../convex/prescriptions"),
  "../convex/referrals.ts": () => import("../convex/referrals"),
  "../convex/vsd.ts": () => import("../convex/vsd"),
});

export const runWithTestConfect = <A, E>(
  effect: Effect.Effect<A, E, typeof TestConfect.Identifier>,
) => Effect.runPromise(Effect.provide(effect, makeTestLayer()));

export const provideTestConfect = <A, E>(
  effect: Effect.Effect<A, E, typeof TestConfect.Identifier>,
) => Effect.provide(effect, makeTestLayer());
