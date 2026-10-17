#!/usr/bin/env node
// A local stand-in for the Hivemind API, for benchmarks and installer tests that must not touch prod.
//   node scripts/mock-api.mjs [--port 0] [--latency 80]   → prints "mock-api listening http://127.0.0.1:<port>"
// Canned answers in the real shapes for what the CLI reads at startup (context pack, scopes, memories, live activity,
// vscode rules/check); any other request gets 200 {}. Every response waits --latency ms (prod is ~60-100ms away).
// Prints a request count on SIGTERM/SIGINT and to GET /__count.
import { createServer } from "node:http";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i === -1 ? d : process.argv[i + 1];
};
const LATENCY = Number(arg("latency", 80));
let count = 0;

const pack = {
  markdown:
    "# Hivemind context pack\n\n## Locked policies\nLOCKED RULE · #org\nNever export PII columns\nSet by @jordan\n\n## Team lessons\nTEAM LESSON · #repo/export-service\nUse the shared CSV writer\nLearned from @kevin\n",
  memoryIds: ["m1", "m2", "m3"],
  rules: 3,
  locked: 1,
  tokens: 420,
};
const scopes = {
  scopes: [
    { id: "org", parentId: null, owner: "dana" },
    { id: "team/data-pipelines", parentId: "org", owner: "jordan" },
    { id: "repo/export-service", parentId: "team/data-pipelines", owner: null },
  ],
  people: [{ id: "kevin", name: "Kevin", role: "engineer" }],
};

function answer(method, path) {
  if (path === "/api/context-pack") return pack;
  if (path === "/api/scopes") return scopes;
  if (path === "/api/memories") return { memories: [] };
  if (path === "/api/activity/live") return { items: [], feed: [], sessions: [] };
  if (path === "/api/vscode/rules") return { rules: [], pending: { count: 2 } };
  if (path === "/api/vscode/check") return { violations: [] };
  return {};
}

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/__count") return res.end(String(count));
  count++;
  req.resume();
  req.on("end", () =>
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(answer(req.method, path)));
    }, LATENCY),
  );
});
server.listen(Number(arg("port", 0)), "127.0.0.1", () => console.log(`mock-api listening http://127.0.0.1:${server.address().port}`));
const stop = () => {
  console.log(`mock-api served ${count} requests`);
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
