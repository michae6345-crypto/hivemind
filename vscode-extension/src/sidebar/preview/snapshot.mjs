// Snapshot prod data for the standalone sidebar preview: node src/sidebar/preview/snapshot.mjs
// Env: HIVEMIND_API_URL (default prod), HIVEMIND_TOKEN.
import { writeFileSync } from "node:fs";
const api = (process.env.HIVEMIND_API_URL || "https://hivemind-beta-virid.vercel.app").replace(/\/+$/, "");
const headers = { authorization: `Bearer ${process.env.HIVEMIND_TOKEN || "hm-dev-token"}`, "x-hm-agent": "vscode", "x-hm-user": "jordan" };
const get = (p) => fetch(api + p, { headers }).then((r) => r.json());
const [scopes, chain, all, metrics, live, here] = await Promise.all([
  get("/api/scopes"),
  get("/api/memories?scope=repo/export-service&chain=1"),
  get("/api/memories?status=pending,active,blocked,rejected"),
  get("/api/metrics"),
  get("/api/activity/live"),
  get("/api/vscode/rules?repo=repo/export-service&file=src/export.ts&user=jordan"),
]);
const data = { scopes: scopes.scopes, people: scopes.people, chain: chain.memories, all: all.memories, transfer: metrics.transfer ?? [], live, here };
writeFileSync(new URL("./mock-data.js", import.meta.url), `window.HM_MOCK = ${JSON.stringify(data)};\n`);
console.log(`wrote mock-data.js: ${data.all.length} memories, ${live.items.length} activity, ${live.feed.length} feed`);
