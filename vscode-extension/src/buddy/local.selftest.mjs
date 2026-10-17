// node src/buddy/local.selftest.mjs [apiUrl]: runs the buddy's local fast path on demo export.ts + demo/trigger.ts.txt
// against the live rules and prints hits + exact ranges, next to what POST /api/vscode/check returns.
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const ext = join(here, "..", "..");
const api = process.argv[2] || "https://hivemind-q17i.onrender.com";
const token = process.env.HIVEMIND_TOKEN || "hm-dev-token";
const out = join(mkdtempSync(join(tmpdir(), "hm-buddy-")), "local.mjs");
await esbuild.build({ entryPoints: [join(here, "local.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error" });
const { localCheck, exprSpan } = await import(pathToFileURL(out).href);

const text = readFileSync(join(ext, "..", "demo", "export-service", "src", "export.ts"), "utf8") + readFileSync(join(ext, "demo", "trigger.ts.txt"), "utf8");
const lines = text.split("\n").map((s) => s.replace(/\r$/, ""));
const h = { authorization: `Bearer ${token}`, "x-hm-agent": "vscode", "x-hm-user": "alex", "content-type": "application/json" };
const rules = await (await fetch(`${api}/api/vscode/rules?repo=repo/export-service&file=src/export.ts&user=alex`, { headers: h })).json();
const rs = rules.rules.filter((r) => r.kind !== "owner");

let t = performance.now();
const local = localCheck(text, rs);
const localMs = (performance.now() - t).toFixed(1);
const show = (v) => {
  const s = exprSpan(lines, v);
  return `${v.ruleSlug} L${v.startLine + 1} [${s.line + 1}:${s.start}-${s.endLine + 1}:${s.end}] "${lines[s.line].slice(s.start, s.endLine === s.line ? s.end : undefined)}" · ${v.message} · fix: ${v.fix?.title ?? "-"}`;
};
console.log(`local (${localMs}ms):`);
local.forEach((v) => console.log("  " + show(v)));

t = performance.now();
const res = await (await fetch(`${api}/api/vscode/check`, { method: "POST", headers: h, body: JSON.stringify({ repo: "repo/export-service", file: "src/export.ts", text }) })).json();
console.log(`server (${(performance.now() - t).toFixed(0)}ms, server ${res.ms}ms${res.cached ? ", cached" : ""}${res.pending ? ", pending" : ""}):`);
res.violations.forEach((v) => console.log("  " + show(v)));
const k = (v) => `${v.ruleSlug}:${v.startLine}:${v.startCol}:${v.endCol}:${v.message}`;
const same = local.length === res.violations.filter((v) => v.source === "regex").length && local.every((l) => res.violations.some((v) => k(v) === k(l)));
console.log(same ? "OK: local hits == server deterministic hits (slug, line, columns, message)" : "MISMATCH between local and server hits");
