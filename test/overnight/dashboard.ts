import { Effect } from "effect";
import fc from "fast-check";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type OvernightDashboardEvent = {
  readonly detail?: string;
  readonly laneId: string;
  readonly status: OvernightLaneStatus;
  readonly timestamp: string;
  readonly type: "iteration" | "lane";
};

type OvernightDashboardState = {
  readonly generatedAt: string;
  readonly history: readonly OvernightProgressPoint[];
  readonly lanes: Record<string, OvernightLaneState>;
  readonly recentEvents: readonly OvernightDashboardEvent[];
  readonly startedAt: string;
  readonly suite: string;
  readonly summary: {
    readonly activeSearches: number;
    readonly checksCompleted: number;
    readonly failedSearches: number;
    readonly searchCount: number;
  };
};

type OvernightLaneState = {
  readonly checksCompleted: number;
  readonly configuredBudget?: number;
  readonly currentExample?: string;
  readonly currentIteration: number;
  readonly finishedAt?: string;
  readonly history: readonly OvernightProgressPoint[];
  readonly id: string;
  readonly kind: "catalog" | "search";
  readonly lastDetail?: string;
  readonly lastError?: string;
  readonly lastExample?: string;
  readonly lastUpdatedAt: string;
  readonly ratePerMinute: number;
  readonly recentExamples: readonly string[];
  readonly startedAt?: string;
  readonly status: OvernightLaneStatus;
  readonly stopCondition: string;
  readonly suite: string;
  readonly tagCounts: Readonly<Record<string, number>>;
  readonly title: string;
};

type OvernightLaneStatus = "failed" | "idle" | "passed" | "running";

type OvernightProgressPoint = {
  readonly checksCompleted: number;
  readonly timestamp: string;
};

const dashboardDirectory = path.join(
  process.cwd(),
  ".cache",
  "kbv-oracles",
  "overnight-dashboard",
);

const dashboardStatePath = path.join(dashboardDirectory, "state.json");

const MAX_EVENTS = 20;
const MAX_EXAMPLES = 8;
const MAX_TAGS = 12;
const HISTORY_RETENTION = [
  { maxAgeMs: 5 * 60_000, resolutionMs: 250 },
  { maxAgeMs: 30 * 60_000, resolutionMs: 1_000 },
  { maxAgeMs: 2 * 60 * 60_000, resolutionMs: 5_000 },
  { maxAgeMs: Number.POSITIVE_INFINITY, resolutionMs: 30_000 },
] as const;

const createEmptyState = (): OvernightDashboardState => {
  const startedAt = new Date().toISOString();
  return {
    generatedAt: startedAt,
    history: [],
    lanes: {},
    recentEvents: [],
    startedAt,
    suite: "property eRezept oracle",
    summary: {
      activeSearches: 0,
      checksCompleted: 0,
      failedSearches: 0,
      searchCount: 0,
    },
  };
};

const summarize = (
  lanes: Record<string, OvernightLaneState>,
): OvernightDashboardState["summary"] =>
  Object.values(lanes)
    .filter((lane) => lane.kind === "search")
    .reduce(
      (summary, lane) => ({
        activeSearches:
          summary.activeSearches + Number(lane.status === "running"),
        checksCompleted: summary.checksCompleted + lane.checksCompleted,
        failedSearches:
          summary.failedSearches + Number(lane.status === "failed"),
        searchCount: summary.searchCount + 1,
      }),
      {
        activeSearches: 0,
        checksCompleted: 0,
        failedSearches: 0,
        searchCount: 0,
      },
    );

const loadState = (): OvernightDashboardState => {
  try {
    return JSON.parse(
      readFileSync(dashboardStatePath, "utf8"),
    ) as OvernightDashboardState;
  } catch {
    return createEmptyState();
  }
};

const saveState = (state: OvernightDashboardState) => {
  mkdirSync(dashboardDirectory, { recursive: true });
  writeFileSync(dashboardStatePath, JSON.stringify(state, null, 2));
};

const appendHistory = (
  history: readonly OvernightProgressPoint[],
  point: OvernightProgressPoint,
): readonly OvernightProgressPoint[] => {
  const nextHistory = [...history, point];
  if (nextHistory.length <= 2) {
    return nextHistory;
  }

  const newestTime = new Date(
    nextHistory[nextHistory.length - 1].timestamp,
  ).getTime();
  const buckets = new Set<string>();
  const compacted: OvernightProgressPoint[] = [];

  for (let index = nextHistory.length - 1; index >= 0; index -= 1) {
    const entry = nextHistory[index];
    if (index === 0 || index === nextHistory.length - 1) {
      compacted.push(entry);
      continue;
    }

    const entryTime = new Date(entry.timestamp).getTime();
    const ageMs = Math.max(0, newestTime - entryTime);
    const resolutionMs =
      HISTORY_RETENTION.find((retention) => ageMs <= retention.maxAgeMs)
        ?.resolutionMs ?? 30_000;
    const bucket = Math.floor(entryTime / resolutionMs);
    const key = `${resolutionMs}:${bucket}`;
    if (!buckets.has(key)) {
      buckets.add(key);
      compacted.push(entry);
    }
  }

  return compacted.reverse();
};

const pushEvent = (
  events: readonly OvernightDashboardEvent[],
  event: OvernightDashboardEvent,
): readonly OvernightDashboardEvent[] => [...events, event].slice(-MAX_EVENTS);

const pushExample = (
  examples: readonly string[],
  example: string | undefined,
): readonly string[] =>
  example
    ? [example, ...examples.filter((entry) => entry !== example)].slice(
        0,
        MAX_EXAMPLES,
      )
    : examples;

const normalizeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const elapsedMs = (startedAt: string | undefined, timestamp: string) =>
  startedAt
    ? Math.max(0, new Date(timestamp).getTime() - new Date(startedAt).getTime())
    : 0;

const ratePerMinute = (checksCompleted: number, elapsed: number) =>
  elapsed <= 0 ? 0 : checksCompleted / (elapsed / 60_000);

const addTagCounts = (
  current: Readonly<Record<string, number>>,
  tags: readonly string[],
): Readonly<Record<string, number>> =>
  Object.fromEntries(
    Object.entries(
      tags.reduce<Record<string, number>>(
        (counts, tag) => ({
          ...counts,
          [tag]: (counts[tag] ?? 0) + 1,
        }),
        { ...current },
      ),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, MAX_TAGS),
  );

const mutateState = (
  updater: (state: OvernightDashboardState) => OvernightDashboardState,
) => {
  const nextState = updater(loadState());
  saveState({
    ...nextState,
    generatedAt: new Date().toISOString(),
    summary: summarize(nextState.lanes),
  });
};

export const resetOvernightDashboard = () =>
  Effect.sync(() => {
    saveState(createEmptyState());
  });

export const registerOvernightLane = ({
  configuredBudget,
  id,
  kind,
  stopCondition,
  suite,
  title,
}: {
  configuredBudget?: number;
  id: string;
  kind: OvernightLaneState["kind"];
  stopCondition: string;
  suite: string;
  title: string;
}) =>
  Effect.sync(() => {
    const timestamp = new Date().toISOString();
    mutateState((state) => ({
      ...state,
      lanes: {
        ...state.lanes,
        [id]: {
          checksCompleted: 0,
          configuredBudget,
          currentIteration: 0,
          history: [],
          id,
          kind,
          lastUpdatedAt: timestamp,
          ratePerMinute: 0,
          recentExamples: [],
          startedAt: timestamp,
          status: "idle",
          stopCondition,
          suite,
          tagCounts: {},
          title,
        },
      },
      recentEvents: pushEvent(state.recentEvents, {
        detail: `Prepared ${title}`,
        laneId: id,
        status: "idle",
        timestamp,
        type: "lane",
      }),
    }));
  });

const updateSearchIteration = ({
  detail,
  error,
  example,
  id,
  iteration,
  status,
  tags,
}: {
  detail?: string;
  error?: unknown;
  example?: string;
  id: string;
  iteration: number;
  status: "failed" | "passed" | "running";
  tags: readonly string[];
}) =>
  mutateState((state) => {
    const lane = state.lanes[id];
    if (!lane) {
      return state;
    }

    const timestamp = new Date().toISOString();
    const nextChecksCompleted =
      status === "running"
        ? lane.checksCompleted
        : Math.max(lane.checksCompleted, iteration);
    const nextElapsedMs = elapsedMs(lane.startedAt, timestamp);
    const point = {
      checksCompleted: nextChecksCompleted,
      timestamp,
    } satisfies OvernightProgressPoint;

    return {
      ...state,
      history: appendHistory(state.history, {
        checksCompleted:
          state.summary.checksCompleted +
          Math.max(0, nextChecksCompleted - lane.checksCompleted),
        timestamp,
      }),
      lanes: {
        ...state.lanes,
        [id]: {
          ...lane,
          checksCompleted: nextChecksCompleted,
          currentExample: status === "running" ? example : undefined,
          currentIteration: iteration,
          history: appendHistory(lane.history, point),
          lastDetail: detail,
          lastError: error ? normalizeError(error) : lane.lastError,
          lastExample:
            status === "running"
              ? lane.lastExample
              : (example ?? lane.lastExample),
          lastUpdatedAt: timestamp,
          ratePerMinute: ratePerMinute(nextChecksCompleted, nextElapsedMs),
          recentExamples:
            status === "running"
              ? lane.recentExamples
              : pushExample(lane.recentExamples, example),
          status,
          tagCounts:
            status === "running"
              ? lane.tagCounts
              : addTagCounts(lane.tagCounts, tags),
        },
      },
      recentEvents: pushEvent(state.recentEvents, {
        detail,
        laneId: id,
        status,
        timestamp,
        type: "iteration",
      }),
    };
  });

const updateCatalogIteration = ({
  detail,
  error,
  id,
  iteration,
  status,
}: {
  detail?: string;
  error?: unknown;
  id: string;
  iteration: number;
  status: "failed" | "passed" | "running";
}) =>
  mutateState((state) => {
    const lane = state.lanes[id];
    if (!lane) {
      return state;
    }

    const timestamp = new Date().toISOString();
    const nextChecksCompleted =
      status === "running"
        ? lane.checksCompleted
        : Math.max(lane.checksCompleted, iteration);
    const nextElapsedMs = elapsedMs(lane.startedAt, timestamp);

    return {
      ...state,
      lanes: {
        ...state.lanes,
        [id]: {
          ...lane,
          checksCompleted: nextChecksCompleted,
          currentIteration: iteration,
          history: appendHistory(lane.history, {
            checksCompleted: nextChecksCompleted,
            timestamp,
          }),
          lastDetail: detail,
          lastError: error ? normalizeError(error) : lane.lastError,
          lastUpdatedAt: timestamp,
          ratePerMinute: ratePerMinute(nextChecksCompleted, nextElapsedMs),
          status,
        },
      },
      recentEvents: pushEvent(state.recentEvents, {
        detail,
        laneId: id,
        status,
        timestamp,
        type: "iteration",
      }),
    };
  });

const completeLane = ({
  detail,
  error,
  id,
  status,
}: {
  detail?: string;
  error?: unknown;
  id: string;
  status: "failed" | "passed";
}) =>
  mutateState((state) => {
    const lane = state.lanes[id];
    if (!lane) {
      return state;
    }

    const timestamp = new Date().toISOString();
    return {
      ...state,
      lanes: {
        ...state.lanes,
        [id]: {
          ...lane,
          currentExample: undefined,
          finishedAt: timestamp,
          lastDetail: detail,
          lastError: error ? normalizeError(error) : lane.lastError,
          lastUpdatedAt: timestamp,
          status,
        },
      },
      recentEvents: pushEvent(state.recentEvents, {
        detail,
        laneId: id,
        status,
        timestamp,
        type: "lane",
      }),
    };
  });

export const runTrackedCatalogEffect = <A>({
  id,
  items,
  run,
  suite,
  title,
}: {
  id: string;
  items: readonly A[];
  run: (item: A, index: number) => Effect.Effect<void, unknown, never>;
  suite: string;
  title: string;
}) =>
  Effect.gen(function* () {
    yield* registerOvernightLane({
      configuredBudget: items.length,
      id,
      kind: "catalog",
      stopCondition:
        "Stop on first classification change or when the catalog is exhausted.",
      suite,
      title,
    });

    for (const [index, item] of items.entries()) {
      const iteration = index + 1;
      const detail = `Catalog case ${iteration}/${items.length}`;
      yield* Effect.sync(() =>
        updateCatalogIteration({
          detail,
          id,
          iteration,
          status: "running",
        }),
      );

      const result = yield* Effect.exit(run(item, index));
      if (result._tag === "Failure") {
        yield* Effect.sync(() =>
          updateCatalogIteration({
            detail,
            error: result.cause,
            id,
            iteration,
            status: "failed",
          }),
        );
        yield* Effect.sync(() =>
          completeLane({
            detail: `Failed on catalog case ${iteration}/${items.length}`,
            error: result.cause,
            id,
            status: "failed",
          }),
        );
        return yield* Effect.failCause(result.cause);
      }

      yield* Effect.sync(() =>
        updateCatalogIteration({
          detail,
          id,
          iteration,
          status: "passed",
        }),
      );
    }

    yield* Effect.sync(() =>
      completeLane({
        detail: `Completed ${items.length} catalog cases`,
        id,
        status: "passed",
      }),
    );
  });

export const trackedAsyncProperty = <A>({
  arbitrary,
  configuredBudget,
  describeExample,
  id,
  run,
  stopCondition,
  suite,
  summarizeTags,
  title,
}: {
  arbitrary: fc.Arbitrary<A>;
  configuredBudget?: number;
  describeExample?: (value: A) => string;
  id: string;
  run: (value: A, iteration: number) => Effect.Effect<void, unknown, never>;
  stopCondition: string;
  suite: string;
  summarizeTags?: (value: A) => readonly string[];
  title: string;
}) =>
  Effect.gen(function* () {
    yield* registerOvernightLane({
      configuredBudget,
      id,
      kind: "search",
      stopCondition,
      suite,
      title,
    });

    let iteration = 0;

    const property = fc.asyncProperty(arbitrary, (value) =>
      // Keep the fast-check bridge on Effect.runPromise: swapping this to a
      // captured Runtime.runPromise regressed property-lane throughput/liveness
      // after the FHIR batching work. Benchmark before changing it.
      // @effect-diagnostics-next-line effect/runEffectInsideEffect:off
      Effect.runPromise(
        Effect.gen(function* () {
          iteration += 1;
          const example = describeExample?.(value);
          const tags = summarizeTags?.(value) ?? [];

          updateSearchIteration({
            detail: `Checking candidate ${iteration}`,
            example,
            id,
            iteration,
            status: "running",
            tags,
          });

          const result = yield* Effect.exit(run(value, iteration));
          if (result._tag === "Failure") {
            updateSearchIteration({
              detail: `Found a counterexample on candidate ${iteration}`,
              error: result.cause,
              example,
              id,
              iteration,
              status: "failed",
              tags,
            });
            completeLane({
              detail: `Search stopped on candidate ${iteration}`,
              error: result.cause,
              id,
              status: "failed",
            });
            return yield* Effect.failCause(result.cause);
          }

          updateSearchIteration({
            detail: `Candidate ${iteration} matched expectations`,
            example,
            id,
            iteration,
            status: "passed",
            tags,
          });
        }),
      ),
    );

    return {
      complete: (status: "failed" | "passed", detail?: string) =>
        completeLane({ detail, id, status }),
      property,
    };
  });

export const overnightDashboardStatePath = dashboardStatePath;
