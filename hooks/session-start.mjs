#!/usr/bin/env node
// Claude Code SessionStart hook (type "command"): fetch the Hivemind context pack and inject it as additionalContext.
// Never breaks the session: any failure prints a short fallback and exits 0.
//
// Env: HIVEMIND_API_URL (default http://localhost:3000), HIVEMIND_TOKEN, HIVEMIND_USER (default sam),
//      HIVEMIND_REPO (default repo/<basename of cwd>). Missing vars are read from <hivemind>/.env.local.
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = 12000; // settings.json gives the hook 15s; a cold dev server can take ~10s

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!m || line.trimStart().startsWith("#")) continue;
      const val = m[2].replace(/^(['"])(.*)\1$/, "$2");
      if (!process.env[m[1]] && val) process.env[m[1]] = val;
    }
  } catch {
    /* no .env.local — fine */
  }
}

function emit(text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }));
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
  const api = (process.env.HIVEMIND_API_URL || "http://localhost:3000").replace(/\/+$/, "");
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
  emit(pack.markdown.slice(0, 9500)); // Claude Code caps additionalContext at 10,000 chars
}

main().catch((e) => emit(`(Hivemind team memory unavailable: ${e?.message ?? e}. Proceed using the repo's own docs.)`));
