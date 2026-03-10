import { TestConfect as TestConfectModule } from "@confect/test";
import { Effect } from "effect";

import schema from "../confect/schema";

export const TestConfect = TestConfectModule.TestConfect<typeof schema>();

export const makeTestLayer = TestConfectModule.layer(
  schema,
  {
    "../convex/_generated/api.ts": () => import("../convex/_generated/api"),
    "../convex/billing.ts": () => import("../convex/billing"),
    "../convex/coding.ts": () => import("../convex/coding"),
    "../convex/patients.ts": () => import("../convex/patients"),
    "../convex/coverages.ts": () => import("../convex/coverages"),
    "../convex/vsd.ts": () => import("../convex/vsd"),
  },
);

export const runWithTestConfect = <A, E>(
  effect: Effect.Effect<A, E, typeof TestConfect.Identifier>,
) => Effect.runPromise(Effect.provide(effect, makeTestLayer()));
