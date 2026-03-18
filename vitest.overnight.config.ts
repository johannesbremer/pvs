import { existsSync, readFileSync } from "node:fs";
import { availableParallelism, cpus } from "node:os";
import { defineConfig } from "vitest/config";

import { overnightDashboardStatePath } from "./test/overnight/dashboard";

const emptyDashboardState = () => ({
  generatedAt: new Date().toISOString(),
  history: [],
  lanes: {},
  recentEvents: [],
  startedAt: new Date().toISOString(),
  suite: "property eRezept oracle",
  summary: {
    activeSearches: 0,
    checksCompleted: 0,
    failedSearches: 0,
    searchCount: 0,
  },
});

const overnightWorkerCount = Math.max(
  1,
  availableParallelism?.() ?? cpus().length,
);

const renderDashboardPage = () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Overnight Oracle Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07121d;
        --border: rgba(144, 176, 205, 0.22);
        --card: rgba(10, 19, 33, 0.88);
        --danger: #ff7b72;
        --muted: #8fa5be;
        --ok: #4ade80;
        --running: #f59e0b;
        --text: #edf5ff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "IBM Plex Sans", "Avenir Next", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(16, 185, 129, 0.12), transparent 24%),
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.14), transparent 28%),
          linear-gradient(180deg, #08111b 0%, #040911 100%);
      }

      main {
        width: min(1320px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 40px;
      }

      .hero,
      .card {
        border: 1px solid var(--border);
        border-radius: 22px;
        background: var(--card);
        box-shadow: 0 20px 70px rgba(0, 0, 0, 0.26);
      }

      .hero {
        display: grid;
        gap: 18px;
        padding: 24px;
      }

      h1,
      h2,
      h3,
      p,
      pre {
        margin: 0;
      }

      h1 {
        font-size: clamp(2rem, 4vw, 3.5rem);
        line-height: 0.95;
        letter-spacing: -0.05em;
      }

      p,
      .muted,
      .meta,
      .chart-labels,
      .event-time {
        color: var(--muted);
      }

      .toolbar,
      .metrics,
      .suite-grid,
      .lane-grid,
      .overview {
        display: grid;
        gap: 16px;
      }

      .toolbar {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }

      .metrics {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        margin-top: 18px;
      }

      .overview {
        grid-template-columns: 1.15fr 0.85fr;
        margin-top: 18px;
      }

      .lane-grid {
        grid-template-columns: 1fr;
        margin-top: 18px;
      }

      .suite-grid {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        margin-top: 18px;
      }

      .card {
        padding: 18px;
      }

      .pill {
        padding: 12px 14px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.03);
      }

      .metric-value,
      .big-number {
        font-size: clamp(1.8rem, 3vw, 3rem);
        font-weight: 700;
        letter-spacing: -0.05em;
      }

      .lane-header,
      .event-row,
      .split-line {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: baseline;
      }

      .status {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .status-running { color: var(--running); }
      .status-passed { color: var(--ok); }
      .status-failed { color: var(--danger); }
      .status-idle { color: var(--muted); }

      .kind {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border: 1px solid var(--border);
        border-radius: 999px;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }

      .search-meta,
      .stats {
        display: grid;
        gap: 10px;
      }

      .stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 14px;
      }

      .stat strong {
        display: block;
        margin-top: 2px;
        font-size: 1rem;
        color: var(--text);
      }

      .chart {
        width: 100%;
        height: 180px;
        margin-top: 14px;
        border-radius: 16px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01)),
          rgba(255, 255, 255, 0.02);
      }

      .chart svg {
        width: 100%;
        height: 100%;
        display: block;
      }

      .chart-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 8px;
        font-size: 0.84rem;
      }

      .code-block {
        margin-top: 12px;
        padding: 12px;
        overflow: auto;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.24);
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
        font-size: 0.88rem;
        white-space: pre-wrap;
      }

      .suite-section {
        display: grid;
        gap: 16px;
      }

      .suite-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: baseline;
        margin-top: 4px;
      }

      .suite-lanes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
        gap: 16px;
      }

      a {
        color: #93c5fd;
      }

      .empty {
        color: var(--muted);
      }

      @media (max-width: 920px) {
        .overview {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <h1>Overnight Oracle Dashboard</h1>
        </div>
        <div class="toolbar">
          <div class="pill"><strong id="startedAt">-</strong><div class="muted">Run started</div></div>
          <div class="pill"><strong id="lastRefresh">-</strong><div class="muted">Last refresh</div></div>
        </div>
      </section>

      <section class="metrics" id="metrics"></section>
      <section class="overview">
        <article class="card" id="focusCard"></article>
        <article class="card" id="overviewCard"></article>
      </section>
      <section class="suite-grid" id="suiteGrid"></section>
      <section class="lane-grid" id="laneGrid"></section>
      <section style="margin-top: 18px;">
        <article class="card">
          <div class="lane-header">
            <h2>Recent Events</h2>
            <span class="meta">last 20 updates</span>
          </div>
          <div id="events" style="display:grid; gap:12px; margin-top:12px;"></div>
        </article>
      </section>
    </main>

    <script type="module">
      const metrics = document.getElementById("metrics");
      const focusCard = document.getElementById("focusCard");
      const overviewCard = document.getElementById("overviewCard");
      const suiteGrid = document.getElementById("suiteGrid");
      const laneGrid = document.getElementById("laneGrid");
      const events = document.getElementById("events");
      const startedAt = document.getElementById("startedAt");
      const lastRefresh = document.getElementById("lastRefresh");

      const formatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      });
      const compactFormatter = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const integer = new Intl.NumberFormat();

      const formatDuration = (ms) => {
        if (!Number.isFinite(ms) || ms <= 0) return "-";
        const totalSeconds = Math.round(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return [hours, minutes, seconds]
          .map((value, index) => index === 0 ? String(value) : String(value).padStart(2, "0"))
          .join(":");
      };

      const escapeHtml = (text) =>
        String(text)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");

      const statusClass = (status) => \`status status-\${status}\`;
      const kindLabel = (kind) => kind === "catalog" ? "Catalog" : "Search";

      const normalizeLane = (lane) => ({
        ...lane,
        checksCompleted: lane.checksCompleted ?? 0,
        configuredBudget: lane.configuredBudget,
        currentIteration: lane.currentIteration ?? 0,
        history: lane.history ?? [],
        ratePerMinute: lane.ratePerMinute ?? 0,
        recentExamples: lane.recentExamples ?? [],
        stopCondition: lane.stopCondition ?? "Stop on cancellation or first failure.",
        tagCounts: lane.tagCounts ?? {},
      });

      const buildPolyline = (points, width, height, selector) => {
        const values = points.map(selector);
        const maxValue = Math.max(1, ...values);
        return points
          .map((point, index) => {
            const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
            const y = height - (selector(point) / maxValue) * height;
            return \`\${x},\${Math.max(10, Math.min(height - 10, y))}\`;
          })
          .join(" ");
      };

      const renderChart = (points, selector, stroke, emptyText) => {
        if (!points.length) {
          return \`<div class="empty" style="margin-top:12px;">\${emptyText}</div>\`;
        }

        const width = 640;
        const height = 180;
        const polyline = buildPolyline(points, width, height, selector);
        return \`
          <div class="chart">
            <svg viewBox="0 0 \${width} \${height}" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                fill="none"
                stroke="\${stroke}"
                stroke-width="4"
                stroke-linecap="round"
                stroke-linejoin="round"
                points="\${polyline}"
              />
            </svg>
          </div>
          <div class="chart-labels">
            <span>\${compactFormatter.format(new Date(points[0].timestamp))}</span>
            <span>\${compactFormatter.format(new Date(points[points.length - 1].timestamp))}</span>
          </div>
        \`;
      };

      const rollingRateSeries = (history, windowMs = 30_000) => {
        let windowStart = 0;
        return history.map((point, index) => {
          const pointTime = new Date(point.timestamp).getTime();
          while (
            windowStart < index
            && pointTime - new Date(history[windowStart].timestamp).getTime() > windowMs
          ) {
            windowStart += 1;
          }

          const startPoint = history[windowStart];
          const deltaChecks = point.checksCompleted - startPoint.checksCompleted;
          const deltaMs = pointTime - new Date(startPoint.timestamp).getTime();
          return {
            checksCompleted: deltaMs <= 0 ? 0 : (deltaChecks / deltaMs) * 60_000,
            timestamp: point.timestamp,
          };
        });
      };

      const activeLane = (lanes) =>
        lanes.find((lane) => lane.status === "running")
        ?? lanes.find((lane) => lane.status === "failed")
        ?? lanes[0];

      const groupBySuite = (lanes) =>
        lanes.reduce((groups, lane) => {
          const suite = lane.suite || "Uncategorized";
          groups[suite] = [...(groups[suite] ?? []), lane];
          return groups;
        }, {});

      const renderLaneCard = (lane) => \`
        <article class="card">
          <div class="lane-header">
            <div>
              <h3>\${lane.title}</h3>
              <div class="meta">\${lane.suite}</div>
            </div>
            <div class="\${statusClass(lane.status)}">\${lane.status}</div>
          </div>
          <div style="margin-top:10px;"><span class="kind">\${kindLabel(lane.kind)}</span></div>
          <div class="stats">
            <div class="stat"><span class="muted">\${lane.kind === "search" ? "Current candidate" : "Current case"}</span><strong>\${integer.format(lane.currentIteration || lane.checksCompleted)}</strong></div>
            <div class="stat"><span class="muted">Checks completed</span><strong>\${integer.format(lane.checksCompleted)}</strong></div>
            <div class="stat"><span class="muted">Last update</span><strong>\${compactFormatter.format(new Date(lane.lastUpdatedAt))}</strong></div>
            <div class="stat"><span class="muted">Rate</span><strong>\${lane.ratePerMinute.toFixed(2)}/min</strong></div>
          </div>
          <div style="margin-top:12px;" class="muted">Last result</div>
          <p>\${lane.lastDetail ?? "Waiting for first result."}</p>
          <div style="margin-top:12px;" class="muted">\${lane.kind === "search" ? "Current or last example" : "Last recorded example"}</div>
          <pre class="code-block">\${escapeHtml(lane.currentExample ?? lane.lastExample ?? "No recorded example yet.")}</pre>
          \${lane.lastError ? \`<div style="margin-top:12px;" class="muted">Failure</div><pre class="code-block">\${escapeHtml(lane.lastError)}</pre>\` : ""}
        </article>
      \`;

      const render = (state) => {
        const lanes = Object.values(state.lanes)
          .map(normalizeLane)
          .sort((left, right) =>
            left.suite === right.suite
              ? left.title.localeCompare(right.title)
              : left.suite.localeCompare(right.suite),
          );
        const searchLanes = lanes.filter((lane) => lane.kind === "search");
        const catalogLanes = lanes.filter((lane) => lane.kind === "catalog");
        const active = activeLane(lanes);
        const suiteGroups = groupBySuite(lanes);
        const totalElapsedMs = Math.max(
          0,
          new Date(state.generatedAt).getTime() - new Date(state.startedAt).getTime(),
        );
        const overallRate = totalElapsedMs <= 0
          ? 0
          : state.summary.checksCompleted / (totalElapsedMs / 60000);
        startedAt.textContent = formatter.format(new Date(state.startedAt));
        lastRefresh.textContent = formatter.format(new Date(state.generatedAt));

        metrics.innerHTML = [
          ["Checks completed", integer.format(state.summary.checksCompleted)],
          ["Tracked lanes", integer.format(lanes.length)],
          ["Search lanes", integer.format(searchLanes.length)],
          ["Catalog lanes", integer.format(catalogLanes.length)],
          ["Failed searches", state.summary.failedSearches],
          ["Search checks / min", overallRate.toFixed(2)],
          ["Current focus", active ? active.title : "Waiting"],
        ]
          .map(
            ([label, value]) => \`
              <article class="card">
                <div class="muted">\${label}</div>
                <div class="metric-value">\${value}</div>
              </article>
            \`,
          )
          .join("");

        focusCard.innerHTML = active
          ? \`
              <div class="lane-header">
                <div>
                  <h2>Current Focus</h2>
                  <div class="meta">\${active.title}</div>
                </div>
                <div class="\${statusClass(active.status)}">\${active.status}</div>
              </div>
              <div style="margin-top:10px;"><span class="kind">\${kindLabel(active.kind)}</span></div>
              <div class="big-number">\${integer.format(active.currentIteration || active.checksCompleted)}</div>
              <div class="meta">\${active.kind === "search" ? "candidate currently under test" : "test case currently under test"}</div>
              <div class="stats">
                <div class="stat"><span class="muted">Checks completed</span><strong>\${integer.format(active.checksCompleted)}</strong></div>
                <div class="stat"><span class="muted">Suite</span><strong>\${escapeHtml(active.suite)}</strong></div>
                <div class="stat"><span class="muted">Rate</span><strong>\${active.ratePerMinute.toFixed(2)}/min</strong></div>
                <div class="stat"><span class="muted">Updated</span><strong>\${compactFormatter.format(new Date(active.lastUpdatedAt))}</strong></div>
              </div>
              <div style="margin-top:14px;" class="muted">\${active.kind === "search" ? "Current example" : "Last recorded example"}</div>
              <pre class="code-block">\${escapeHtml(active.currentExample ?? active.lastExample ?? "Waiting for the first recorded example.")}</pre>
            \`
          : '<div class="empty">No tracked lane has started yet.</div>';

        overviewCard.innerHTML = \`
          <div class="lane-header">
            <div>
              <h2>Search Dynamics</h2>
              <div class="meta">Long-running property lanes stay here; the full test list is grouped below by suite.</div>
            </div>
            <div class="meta">\${formatDuration(totalElapsedMs)}</div>
          </div>
          <div class="stats">
            <div class="stat"><span class="muted">Overall checks completed</span><strong>\${integer.format(state.summary.checksCompleted)}</strong></div>
            <div class="stat"><span class="muted">Overall rate</span><strong>\${overallRate.toFixed(2)}/min</strong></div>
          </div>
          <div style="margin-top:12px;" class="muted">Cumulative checks</div>
          \${renderChart(state.history ?? [], (point) => point.checksCompleted, "#60a5fa", "The run graph appears once checks begin.")}
          <div style="margin-top:12px;" class="muted">Rolling rate (30s)</div>
          \${renderChart(rollingRateSeries(state.history ?? []), (point) => point.checksCompleted, "#f59e0b", "The rolling rate graph appears after checks begin.")}
        \`;

        suiteGrid.innerHTML = Object.entries(suiteGroups).length
          ? Object.entries(suiteGroups)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([suite, suiteLanes]) => {
                const runningCount = suiteLanes.filter((lane) => lane.status === "running").length;
                const failedCount = suiteLanes.filter((lane) => lane.status === "failed").length;
                const suiteSearchCount = suiteLanes.filter((lane) => lane.kind === "search").length;
                const suiteCatalogCount = suiteLanes.filter((lane) => lane.kind === "catalog").length;
                return \`
                  <article class="card">
                    <div class="lane-header">
                      <div>
                        <h3>\${escapeHtml(suite)}</h3>
                        <div class="meta">\${integer.format(suiteLanes.length)} tracked lane(s)</div>
                      </div>
                      <div class="meta">\${runningCount} running / \${failedCount} failed</div>
                    </div>
                    <div class="stats">
                      <div class="stat"><span class="muted">Search lanes</span><strong>\${integer.format(suiteSearchCount)}</strong></div>
                      <div class="stat"><span class="muted">Catalog lanes</span><strong>\${integer.format(suiteCatalogCount)}</strong></div>
                    </div>
                  </article>
                \`;
              })
              .join("")
          : '<article class="card empty">No suite-level data yet.</article>';

        laneGrid.innerHTML = Object.entries(suiteGroups).length
          ? Object.entries(suiteGroups)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([suite, suiteLanes]) => \`
                <section class="suite-section">
                  <div class="suite-header">
                    <div>
                      <h2>\${escapeHtml(suite)}</h2>
                      <div class="meta">Showing both long-running searches and finite catalog checks.</div>
                    </div>
                    <div class="meta">\${integer.format(suiteLanes.length)} lane(s)</div>
                  </div>
                  <div class="suite-lanes">
                    \${suiteLanes.map((lane) => renderLaneCard(lane)).join("")}
                  </div>
                </section>
              \`)
              .join("")
          : '<article class="card empty">No tracked lanes are active yet.</article>';

        events.innerHTML = state.recentEvents.length
          ? [...state.recentEvents]
              .reverse()
              .map((event) => {
                const lane = state.lanes[event.laneId];
                return \`
                <div class="event-row">
                  <div>
                    <strong>\${escapeHtml(lane?.title ?? event.laneId)}</strong>
                    <span class="\${statusClass(event.status)}">\${event.status}</span>
                    <div class="meta">\${escapeHtml(lane?.suite ?? event.laneId)}</div>
                    <div>\${escapeHtml(event.detail ?? "Activity recorded")}</div>
                  </div>
                  <div class="event-time">\${compactFormatter.format(new Date(event.timestamp))}</div>
                </div>
              \`;
              })
              .join("")
          : '<div class="empty">No events yet.</div>';
      };

      const refresh = async () => {
        const response = await fetch("/__overnight__/state", { cache: "no-store" });
        render(await response.json());
      };

      refresh();
      setInterval(refresh, 1500);
    </script>
  </body>
</html>`;

const dashboardPlugin = () => {
  let loggedUrls = false;

  const printUrls = (server: {
    config: { server?: { host?: boolean | string } };
    httpServer?: {
      address: () => null | string | { address: string; port: number };
    };
  }) => {
    if (loggedUrls) {
      return;
    }

    const address = server.httpServer?.address();
    if (!address || typeof address === "string") {
      return;
    }

    const host =
      !address.address ||
      address.address === "::" ||
      address.address === "::1" ||
      address.address === "0.0.0.0" ||
      address.address === "127.0.0.1"
        ? "localhost"
        : address.address;
    const base = `http://${host}:${address.port}`;
    loggedUrls = true;
    console.log(`[overnight-dashboard] Vitest UI: ${base}/__vitest__/`);
    console.log(`[overnight-dashboard] Dashboard: ${base}/__overnight__/`);
  };

  return {
    configureServer(server: {
      config: { server?: { host?: boolean | string } };
      httpServer?: {
        address: () => null | string | { address: string; port: number };
        once: (event: string, listener: () => void) => void;
      };
      middlewares: {
        use: (
          path: string,
          handler: (
            req: unknown,
            res: {
              end: (body: string) => void;
              setHeader: (name: string, value: string) => void;
              statusCode: number;
            },
          ) => void,
        ) => void;
      };
    }) {
      server.httpServer?.once("listening", () => {
        printUrls(server);
      });

      server.middlewares.use("/__overnight__/state", (_req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          existsSync(overnightDashboardStatePath)
            ? readFileSync(overnightDashboardStatePath, "utf8")
            : JSON.stringify(emptyDashboardState()),
        );
      });

      server.middlewares.use("/__overnight__", (_req, res) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderDashboardPage());
      });
    },
    name: "overnight-dashboard-plugin",
  };
};

export default defineConfig({
  plugins: [dashboardPlugin()],
  test: {
    fileParallelism: true,
    maxConcurrency: overnightWorkerCount,
    maxWorkers: "100%",
    minWorkers: "100%",
    outputFile: {
      html: ".cache/vitest/overnight/index.html",
    },
    reporters: ["default", "html"],
    sequence: {
      concurrent: true,
    },
  },
});
