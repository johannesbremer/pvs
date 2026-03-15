import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const dashboardDirectory = path.join(
  process.cwd(),
  ".cache",
  "kbv-oracles",
  "overnight-dashboard",
);

const dashboardStatePath = path.join(dashboardDirectory, "state.json");

const startedAt = new Date().toISOString();

await mkdir(dashboardDirectory, { recursive: true });
await unlink(dashboardStatePath).catch(() => undefined);
await writeFile(
  dashboardStatePath,
  JSON.stringify(
    {
      generatedAt: startedAt,
      history: [],
      lanes: {},
      recentEvents: [],
      startedAt,
      summary: {
        activeSearches: 0,
        checksCompleted: 0,
        failedSearches: 0,
        searchCount: 0,
      },
      suite: "overnight eRezept oracle",
    },
    null,
    2,
  ),
);
