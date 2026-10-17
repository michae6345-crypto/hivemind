// Snapshot prod data for the standalone sidebar preview: node src/sidebar/preview/snapshot.mjs
// Env: HIVEMIND_API_URL (default prod), HIVEMIND_TOKEN.
import { readFileSync, writeFileSync } from "node:fs";
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

// Here tab: what the host computes for demo/export-service/src/export.ts (rules whose symbols occur, 1-based lines)
const text = readFileSync(new URL("../../../../demo/export-service/src/export.ts", import.meta.url), "utf8").split(/\r?\n/);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hereRules = here.rules
  .filter((r) => r.kind !== "owner")
  .map((r) => {
    const res = r.symbols.map((s) => new RegExp(`(?<![\\w$.])${reEsc(s)}(?![\\w$])`));
    const lines = text.flatMap((l, i) => (res.some((re) => re.test(l)) ? [i + 1] : []));
    return { ...r, lines, violated: false, atCursor: false };
  })
  .filter((r) => r.lines.length || r.mentionsFile);

const data = { hereRules, scopes: scopes.scopes, people: scopes.people, chain: chain.memories, all: all.memories, transfer: metrics.transfer ?? [], live, here };
writeFileSync(new URL("./mock-data.js", import.meta.url), `window.HM_MOCK = ${JSON.stringify(data)};\n`);
console.log(`wrote mock-data.js: ${data.all.length} memories, ${hereRules.length} rules in export.ts, ${live.items.length} activity, ${live.feed.length} feed`);
