#!/usr/bin/env node
// Claude Code SessionStart hook (type "command"): fetch the Hivemind context pack and inject it as additionalContext.
// Never breaks the session: any failure prints a short fallback and exits 0.
//
// Env: HIVEMIND_API_URL (default: production, https://hivemind-q17i.onrender.com; set http://localhost:3000 for a
//      local server), HIVEMIND_TOKEN, HIVEMIND_USER (default sam), HIVEMIND_REPO (default repo/<basename of cwd>).
//      A missing HIVEMIND_TOKEN is read from <hivemind>/.env.local (only the token: that file's HIVEMIND_API_URL is the
//      server's local setting and must not pull hooks off production).
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_API = "https://hivemind-q17i.onrender.com";
const FROM_ENV_FILE = new Set(["HIVEMIND_TOKEN"]);
const TIMEOUT_MS = 12000; // settings.json gives the hook 15s; a cold dev server can take ~10s

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

// The house prefix and line rule shared with the server (src/lib/engine/pack.ts HM / wrap80; this hook is plain Node,
// so it keeps its own copy): "⬢ Hivemind · ", plain text, wrapped on words at 80 columns, never cut mid-word.
const HM = "⬢ Hivemind · ";
function wrap80(text, width = 80) {
  const out = [];
  let cur = "";
  for (const word of String(text).split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && [...next].length > (out.length ? width - 2 : width)) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  out.push(cur);
  return out.map((l, i) => (i ? `  ${l}` : l)).join("\n");
}

// systemMessage = the one-line banner the user sees; additionalContext = the pack the model sees.
function emit(text, banner) {
  const out = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } };
  if (banner) out.systemMessage = banner;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

async function readStdin() {
  if (process.stdin.isTTY) return {};
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

async function main() {
  loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
  const input = await readStdin();
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const api = (process.env.HIVEMIND_API_URL || DEFAULT_API).replace(/\/+$/, "");
  const user = process.env.HIVEMIND_USER || "sam";
  const repo = process.env.HIVEMIND_REPO || `repo/${basename(cwd)}`;
  const session = input.session_id || `cli-${Date.now()}`;

  const qs = new URLSearchParams({ repo, user, session });
  const res = await fetch(`${api}/api/context-pack?${qs}`, {
    headers: {
      Authorization: `Bearer ${process.env.HIVEMIND_TOKEN ?? ""}`,
      "x-hm-user": user,
      "x-hm-agent": process.env.HIVEMIND_AGENT || "claude-code",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const pack = await res.json();
  if (!pack?.markdown) throw new Error("empty pack");
  const rules = pack.rules ?? pack.memoryIds?.length ?? 0;
  const banner = wrap80(`${HM}Loaded ${rules} team rules for #${pack.repo || repo}.`); // Adrian's v2 tone; plain text (no ANSI)
  emit(pack.markdown.slice(0, 9500), banner); // Claude Code caps additionalContext at 10,000 chars
}

main().catch((e) => emit(wrap80(`${HM}Team memory unavailable (${e?.message ?? e}). Proceed using the repo's own docs.`)));
