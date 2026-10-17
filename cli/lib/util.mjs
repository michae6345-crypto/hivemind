// Small zero-dep helpers: colors, tables, safe file writes, JSON merge, HTTP.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { t } from "./style.mjs";

// ---------- Colours: every command paints through the shared theme (lib/style.mjs → watch/theme.mjs) ----------
export const c = {
  bold: t.bold,
  dim: t.dim,
  red: t.locked,
  green: t.ok,
  yellow: t.warn,
  blue: t.link,
  magenta: t.team,
  cyan: t.teal, // files, paths, commands
  gray: t.muted,
  faint: t.faint,
  amber: t.lesson,
  rose: t.locked, // locked rule
  lesson: t.lesson, // team lesson
  link: t.link,
  handle: t.handle, // @handles
};
export const sym = { ok: c.green("✓"), warn: c.yellow("!"), fail: c.red("✗"), dot: c.gray("·"), arrow: c.amber("›") };

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const visible = (s) => String(s).replace(ANSI_RE, "").length;
const pad = (s, w) => String(s) + " ".repeat(Math.max(0, w - visible(s)));

/** Box-drawn table. rows: string[][] (cells may contain ANSI). */
export function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(visible(h), ...rows.map((r) => visible(r[i] ?? ""))));
  const line = (l, m, r) => c.gray(l + widths.map((w) => "─".repeat(w + 2)).join(m) + r);
  const row = (cells) => c.gray("│") + cells.map((cell, i) => ` ${pad(cell ?? "", widths[i])} `).join(c.gray("│")) + c.gray("│");
  return [line("┌", "┬", "┐"), row(headers.map((h) => c.bold(h))), line("├", "┼", "┤"), ...rows.map(row), line("└", "┴", "┘")].join("\n");
}

export const banner = (cmd) => `${c.bold("Hivemind")} ${c.gray(`· ${cmd}`)}`;

/**
 * House style: no emojis in UI. Server text (packs, block reasons, LLM explanations) still carries 🔒/⚠️, so CLI output
 * maps them to words: "🔒 Locked policies" → "Locked policies", "- 🔒 **X**" → "- locked: **X**", "⚠️ x" → "x".
 */
export function plain(s) {
  return String(s)
    .replace(/🔒\s*(?=[Ll]ock)/g, "")
    .replace(/(^|[-(\s])🔒\s*(?=\*\*)/g, "$1locked: ")
    .replace(/\p{Extended_Pictographic}️?\s*/gu, "")
    .replace(/[ \t]{2,}/g, " ");
}

// ---------- Files ----------
export const rel = (root, p) => p.slice(root.length + 1).replace(/\\/g, "/");
export const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

export function write(p, text, dryRun) {
  if (dryRun) return;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

/** Path for a side-by-side example when we refuse to touch an existing file: a.json → a.hivemind.example.json */
export function examplePath(p) {
  const m = p.match(/^(.*?)(\.[^./\\]+)?$/);
  return `${m[1]}.hivemind.example${m[2] ?? ""}`;
}

/**
 * Merge into a JSON file without overwriting anything. `mutate(obj)` adds missing keys and returns true if it changed.
 * Returns { action: created|merged|unchanged|example, file }.
 * Unparseable files (e.g. JSONC with comments) are left alone and the full snippet goes to *.hivemind.example.
 */
export function mergeJson(p, fresh, mutate, dryRun) {
  const raw = read(p);
  if (raw === null) {
    const obj = {};
    mutate(obj);
    write(p, JSON.stringify(obj, null, 2) + "\n", dryRun);
    return { action: "created", file: p };
  }
  let obj;
  try {
    obj = JSON.parse(raw.replace(/^﻿/, "") || "{}");
  } catch {
    const ex = examplePath(p);
    write(ex, JSON.stringify(fresh(), null, 2) + "\n", dryRun);
    return { action: "example", file: ex, note: `${p.split(/[\\/]/).pop()} isn't plain JSON; merge the example by hand` };
  }
  if (!mutate(obj)) return { action: "unchanged", file: p };
  write(p, JSON.stringify(obj, null, 2) + "\n", dryRun);
  return { action: "merged", file: p };
}

// ---------- Marker blocks (sync) ----------
export const START = "<!-- hivemind:start -->";
export const END = "<!-- hivemind:end -->";

/** Insert or replace the hivemind block. Returns the new file text. Idempotent. */
export function upsertBlock(existing, block, frontmatter = "") {
  // Keep the file's line endings (git autocrlf checks files out with CRLF on Windows) so re-syncs stay no-ops.
  const eol = existing?.includes("\r\n") ? "\r\n" : "\n";
  const body = `${START}\n${block.trim()}\n${END}`.replace(/\r?\n/g, eol);
  if (existing === null) return `${frontmatter}${body}\n`;
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s !== -1 && e > s) return existing.slice(0, s) + body + existing.slice(e + END.length);
  return `${existing.replace(/\s*$/, "")}${eol}${eol}${body}${eol}`;
}

// ---------- Environment ----------
/** HIVEMIND_* vars from an env file (other secrets in it are ignored). */
export function readEnvFile(path) {
  const out = {};
  const raw = read(path);
  if (!raw) return out;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(HIVEMIND_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    const val = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (val) out[m[1]] = val;
  }
  return out;
}

/** Is `name` an executable on PATH? (Windows: honours PATHEXT.) */
export function onPath(name) {
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").concat("") : [""];
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) if (existsSync(join(dir, name + ext.toLowerCase())) || existsSync(join(dir, name + ext))) return true;
  }
  return false;
}

// ---------- HTTP ----------
/** Which agent is calling: HIVEMIND_AGENT (set by the Claude Code skill etc.), else "cli". */
export const callerAgent = () => process.env.HIVEMIND_AGENT || "cli";

const headers = (cfg, agent) => ({
  Authorization: `Bearer ${cfg.token ?? ""}`,
  "x-hm-user": cfg.actor,
  "x-hm-repo": cfg.repo,
  "x-hm-agent": agent ?? callerAgent(),
});

async function errorText(res, path) {
  const body = await res.json().catch(() => null);
  return `HTTP ${res.status} from ${path.split("?")[0]}${body?.error ? `: ${body.error}` : ""}`;
}

export async function api(cfg, path, { agent, timeout = 20000 } = {}) {
  const t0 = Date.now();
  const res = await fetch(cfg.url + path, { headers: headers(cfg, agent), signal: AbortSignal.timeout(timeout) });
  const ms = Date.now() - t0;
  if (!res.ok) throw Object.assign(new Error(await errorText(res, path)), { ms });
  return { data: await res.json(), ms };
}

export async function post(cfg, path, body, { agent, timeout = 60000 } = {}) {
  const res = await fetch(cfg.url + path, {
    method: "POST",
    headers: { ...headers(cfg, agent), "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(await errorText(res, path));
  return res.json();
}

/** One stateless MCP tools/call over Streamable HTTP (the server answers as JSON or a single SSE message). */
export async function mcpCall(cfg, name, args, { agent, timeout = 20000 } = {}) {
  const res = await fetch(`${cfg.url}/api/mcp`, {
    method: "POST",
    headers: { ...headers(cfg, agent), "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(await errorText(res, "/api/mcp"));
  const text = await res.text();
  const raw = text.trimStart().startsWith("{")
    ? text
    : text.split(/\r?\n/).filter((l) => l.startsWith("data: ")).pop()?.slice(6) ?? "{}";
  const msg = JSON.parse(raw);
  if (msg.error) throw new Error(`MCP ${name}: ${msg.error.message}`);
  const out = (msg.result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  if (msg.result?.isError) throw new Error(`MCP ${name}: ${out}`);
  return { text: out, structured: msg.result?.structuredContent };
}
