// Shared core for the cross-vendor hook adapters (Cursor, Gemini CLI, Codex, Copilot, Windsurf).
// Each adapter reads its tool's hook payload from stdin, maps it onto the Claude-Code-shaped Hivemind hook
// endpoints, and translates the answer back. Node 18+, no dependencies.
//
// Env: HIVEMIND_API_URL (default: production, https://hivemind-q17i.onrender.com; set http://localhost:3000 for a
//      local server), HIVEMIND_TOKEN, HIVEMIND_USER (default sam), HIVEMIND_REPO (default repo/<basename of workspace>).
//      A missing HIVEMIND_TOKEN is read from <hivemind>/.env.local (only the token: that file's HIVEMIND_API_URL is the
//      server's local setting and must not pull hooks off production). Same rules as hooks/session-start.mjs.
//      HIVEMIND_PACK_LOG=0 fetches the briefing without logging it to pack_log, so nothing in the session is rated or
//      scored against the served lessons (used by scripts/smoke-adapters.mjs to keep seed lessons untouched).
// Never breaks the host session: every failure path prints the tool's no-op output and exits 0.
import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_API = "https://hivemind-q17i.onrender.com";
const FROM_ENV_FILE = new Set(["HIVEMIND_TOKEN"]);
const TIMEOUT_MS = 8000; // prompt / edit / session-end
const BRIEFING_TIMEOUT_MS = 12000; // host start hooks are configured with 15s
export const PACK_CAP = 9500;

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!m || line.trimStart().startsWith("#") || !FROM_ENV_FILE.has(m[1])) continue;
      const val = m[2].replace(/^(['"])(.*)\1$/, "$2");
      if (!process.env[m[1]] && val) process.env[m[1]] = val;
    }
  } catch {
    /* no .env.local — fine */
  }
}
loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.local"));

export async function readStdin() {
  if (process.stdin.isTTY) return {};
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw.replace(/^﻿/, "") || "{}");
  } catch {
    return {};
  }
}

const slash = (p) => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "");

/** Per-call context: who/where/which agent. `cwd` is the workspace root the tool reported. */
export function context(agent, { cwd, session }) {
  const root = slash(cwd || process.env.HIVEMIND_PROJECT_DIR || process.cwd());
  return {
    agent,
    api: (process.env.HIVEMIND_API_URL || DEFAULT_API).replace(/\/+$/, ""),
    user: process.env.HIVEMIND_USER || "sam",
    repo: process.env.HIVEMIND_REPO || `repo/${basename(root)}`,
    cwd: root,
    session: String(session || `${agent}-${Date.now()}`),
  };
}

function headers(c) {
  return {
    "content-type": "application/json",
    Authorization: `Bearer ${process.env.HIVEMIND_TOKEN ?? ""}`,
    "x-hm-user": c.user,
    "x-hm-repo": c.repo,
    "x-hm-agent": c.agent,
  };
}

async function call(c, path, init = {}, timeout = TIMEOUT_MS) {
  const res = await fetch(`${c.api}${path}`, { ...init, headers: headers(c), signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`);
  return res.json().catch(() => ({}));
}

/** Absolute path under the workspace (the /api/hooks/tool route strips cwd to get a repo-relative path). */
export function absPath(c, file) {
  const f = slash(file);
  return isAbsolute(f) || /^[a-z]:\//i.test(f) ? f : `${c.cwd}/${f.replace(/^\.\//, "")}`;
}

// ---- The four Hivemind operations. Each returns plain text ("" when there's nothing to say). ----

/** Session briefing: 🔒 team rules, ranked lessons, owners, live activity. */
export async function briefing(c) {
  const qs = new URLSearchParams({ repo: c.repo, user: c.user, session: c.session });
  if (process.env.HIVEMIND_PACK_LOG === "0") qs.set("log", "0");
  const pack = await call(c, `/api/context-pack?${qs}`, {}, BRIEFING_TIMEOUT_MS);
  if (!pack?.markdown) throw new Error("empty pack");
  return String(pack.markdown).slice(0, PACK_CAP);
}

/** User prompt → B's correction detector. Returns any note the server wants the agent to see. */
export async function prompt(c, text) {
  if (!text || !String(text).trim()) return "";
  const out = await call(c, "/api/hooks/prompt", {
    method: "POST",
    body: JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: c.session, cwd: c.cwd, prompt: String(text) }),
  });
  return out?.hookSpecificOutput?.additionalContext ?? out?.systemMessage ?? "";
}

/**
 * File edits → activity + collision / rule warnings. Accepts several files (Codex patches touch many).
 * Returns { context, message }: context = every line, for the model; message = the server's user-facing
 * systemMessage (collisions only), "" when there's nothing to show the engineer.
 */
export async function edits(c, files) {
  const notes = [];
  const shown = [];
  for (const f of [...new Set(files.filter(Boolean))].slice(0, 10)) {
    const out = await call(c, "/api/hooks/tool", {
      method: "POST",
      body: JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: c.session,
        cwd: c.cwd,
        tool_name: "Edit",
        tool_input: { file_path: absPath(c, f) },
      }),
    });
    const t = out?.hookSpecificOutput?.additionalContext;
    if (t) notes.push(String(t).replace(/^Hivemind:\r?\n/, ""));
    if (out?.systemMessage) shown.push(String(out.systemMessage));
  }
  return { context: notes.join("\n"), message: shown.join("\n") };
}

/** Session end → confidence update for the lessons that were in this session's pack. */
export async function sessionEnd(c, reason = "other") {
  await call(c, "/api/hooks/session-end", {
    method: "POST",
    body: JSON.stringify({ hook_event_name: "SessionEnd", session_id: c.session, cwd: c.cwd, reason }),
  });
  return "";
}

export const unavailable = (e) =>
  `(Hivemind team memory unavailable: ${e?.message ?? e}. Proceed using the repo's own docs and call the hivemind get_team_rules MCP tool if it is available.)`;

/** Pull file paths out of an arbitrary tool_input (file_path / path / filePath / files[] / apply_patch text). */
export function filesFrom(input) {
  if (!input || typeof input !== "object") return [];
  const out = [];
  for (const k of ["file_path", "filePath", "path", "target_file", "notebook_path", "uri"]) {
    if (typeof input[k] === "string") out.push(input[k].replace(/^file:\/\//, ""));
  }
  for (const k of ["files", "filePaths", "paths"]) {
    if (Array.isArray(input[k])) for (const v of input[k]) out.push(typeof v === "string" ? v : v?.path ?? v?.filePath ?? v?.file_path);
  }
  const text = [input.input, input.patch, input.command, input.content].filter((v) => typeof v === "string").join("\n");
  for (const m of text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) out.push(m[1].trim());
  for (const m of text.matchAll(/^\*\*\* Move to: (.+)$/gm)) out.push(m[1].trim());
  return out.filter(Boolean);
}

/**
 * Run an adapter: `handle(payload)` returns the object/string to print. On ANY error (or timeout) print
 * `noop(payload, error)` instead. Always exits 0.
 */
export async function run(handle, noop) {
  let payload = {};
  const print = (v) => {
    if (v === undefined || v === null || v === "") return;
    process.stdout.write(typeof v === "string" ? v : JSON.stringify(v));
  };
  const guard = setTimeout(() => {
    print(noop(payload, new Error("timeout")));
    process.exit(0);
  }, BRIEFING_TIMEOUT_MS + 2000);
  try {
    payload = await readStdin();
    print(await handle(payload));
  } catch (e) {
    try {
      print(noop(payload, e));
    } catch {
      /* nothing safe left to print */
    }
    if (process.env.HIVEMIND_DEBUG) process.stderr.write(`hivemind adapter: ${e?.stack ?? e}\n`);
  }
  clearTimeout(guard);
  // No process.exit() here: on Windows it can abort inside libuv while fetch's sockets are closing (exit 0xC0000409),
  // and the agents ignore a hook's output unless it exits 0. Nothing is pending now, so the process ends with 0.
  // (The timeout guard above still forces an exit: that path exists to escape a hung request.)
  process.exitCode = 0;
}
