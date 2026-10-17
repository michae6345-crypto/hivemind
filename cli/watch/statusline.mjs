// `hivemind statusline` — Claude Code's status line (owner: H). Docs: code.claude.com/docs/en/statusline
//   settings.json: "statusLine": { "type": "command", "command": "node <hivemind>/cli/hivemind.mjs statusline", "refreshInterval": 5 }
//   stdin: { session_id, transcript_path, cwd, workspace: { current_dir, project_dir }, model, … }. Every stdout line is a
//   row; ANSI colour is allowed. Claude Code debounces at 300ms and cancels a run still in flight, so this must be fast.
//
//   ⬢ Hivemind · 10 rules · 2 waiting                       normal (muted counts)
//   ⬢ Hivemind · breaks 1 locked rule · src/export.ts:18     "the file" breaks a locked rule (rose, bold)
//   ⬢ Hivemind · misses 1 team lesson · 10 rules             … or only misses lessons (honey)
//   ⬢ Hivemind · 11 rules · lesson approved                  for a few minutes after an approval (honey + green)
//   ⬢ Hivemind · offline                                     no answer and nothing cached
// (Adrian's terminal-spec.md §7.)
//
// "The file": what `hivemind watch` last flagged (its state file, if fresh), else the newest /api/activity/live item
// for this session_id (the PostToolUse hook records every edit), checked with POST /api/vscode/check.
// Speed: the line is cached in a temp file for 10s. A stale line prints at once while a detached `statusline --refresh`
// rebuilds it; with nothing cached we try the API inline for ~250ms first. NO_COLOR → plain text.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TTL_MS = 10_000;
const INLINE_BUDGET_MS = 250;
const LOCK_MS = 15_000;
const WATCH_FRESH_MS = 30_000;
const APPROVED_MS = 3 * 60_000; // "lesson approved" stays this long (the spec says until the next prompt)

const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

/** Where `hivemind watch` publishes what it last flagged, for the status line. */
export const watchStatePath = (cfg) => join(tmpdir(), `hivemind-watch-${hash(`${cfg.url}|${cfg.repo}`)}.json`);

/** Called by `hivemind watch` whenever its flags change: { file: "src/export.ts", flags: Violation[] }. */
export function writeWatchState(cfg, { file, flags = [] }) {
  try {
    writeFileSync(watchStatePath(cfg), JSON.stringify({ at: Date.now(), file, flags: flags.map((v) => ({ ruleId: v.ruleId, locked: !!v.locked, startLine: v.startLine })) }));
  } catch {
    /* best effort */
  }
}

async function readStdin(ms = 150) {
  if (process.stdin.isTTY) return {};
  return new Promise((done) => {
    let buf = "";
    const parse = () => readJsonText(buf);
    const timer = setTimeout(() => done(parse()), ms);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", () => (clearTimeout(timer), done(parse())));
    process.stdin.on("error", () => (clearTimeout(timer), done({})));
  });
}
const readJsonText = (s) => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const distinct = (vs, locked) => new Set(vs.filter((v) => !!v.locked === locked).map((v) => v.ruleId)).size;

/** Build the line from the API. Throws on network failure. */
async function compute(th, api, cfg, session, root) {
  const { HEX, P, bold, fg, sep, t } = th;
  const head = `${fg(P.lesson)(HEX)} ${t.text("Hivemind")}`;
  const watch = readJson(watchStatePath(cfg));
  const watchFresh = watch && Date.now() - watch.at < WATCH_FRESH_MS;
  const [rules, live, pack] = await Promise.all([api.rules(""), api.live().catch(() => ({ items: [], feed: [] })), api.pack().catch(() => null)]);
  // "N rules" = the context pack's count, the same number the SessionStart banner prints ("Loaded 11 team rules").
  const n = pack ? (pack.rules ?? pack.memoryIds?.length ?? 0) : (rules.rules?.length ?? 0);
  const waiting = rules.pending?.count ?? 0;

  // "The file": what watch last flagged, else this session's newest edit (checked now).
  let file;
  let flags = [];
  if (watchFresh) {
    file = watch.file;
    flags = watch.flags ?? [];
  } else {
    const mine = session ? (live.items ?? []).find((a) => a.sessionId === session) : null;
    const path = mine && resolve(root, mine.file);
    if (path && existsSync(path)) {
      file = mine.file;
      flags = (await api.check(mine.file, readFileSync(path, "utf8")))?.violations ?? [];
    }
  }
  const locked = flags.filter((v) => v.locked).sort((x, y) => x.startLine - y.startLine);
  const lessons = distinct(flags, false);
  const lockedN = distinct(flags, true);

  // terminal-spec.md §7, four states:
  if (file && lockedN) {
    const at = Number.isFinite(locked[0]?.startLine) ? `${file}:${locked[0].startLine + 1}` : file;
    return [head, bold(t.lockedText(`breaks ${plural(lockedN, "locked rule")}`)), t.muted(at)].join(sep());
  }
  if (file && lessons) return [head, t.lessonText(`misses ${plural(lessons, "team lesson")}`), t.muted(plural(n, "rule"))].join(sep());
  const approvedJustNow = (live.feed ?? []).some((f) => f.type === "approval" && Date.now() - Date.parse(f.at) < APPROVED_MS);
  if (approvedJustNow) return [head, bold(fg(P.lesson)(plural(n, "rule"))), t.ok("lesson approved")].join(sep());
  return [head, t.muted(plural(n, "rule")), ...(waiting ? [t.muted(`${waiting} waiting`)] : [])].join(sep());
}

/** run(argv, cfg): `statusline` (Claude Code) or `statusline --refresh <session|-> <root>` (the detached refresher). */
export async function run(argv, cfg) {
  // The status line is piped, so turn colour on explicitly (theme.mjs decides at import time); NO_COLOR still wins.
  if (!process.env.NO_COLOR && !process.env.FORCE_COLOR) process.env.FORCE_COLOR = "3";
  const th = await import("./theme.mjs");
  const { makeApi } = await import("./data.mjs");

  const refreshing = argv.includes("--refresh");
  const pos = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1] ?? "").match(/^--(url|repo|user|dir)$/));
  const input = refreshing ? {} : (globalThis.hivemindHookInput ?? (await readStdin())); // cli/hivemind.mjs may have read it
  const session = refreshing ? (pos[0] === "-" ? "" : pos[0] ?? "") : input.session_id ?? "";
  const root = refreshing ? pos[1] ?? cfg.root : input.workspace?.project_dir || input.workspace?.current_dir || input.cwd || cfg.root;
  // The repo follows Claude Code's project dir (not this process' cwd) unless a flag, env or .hivemind.json says otherwise.
  if (!refreshing && !cfg.flags?.repo && !process.env.HIVEMIND_REPO) {
    const r = readJson(join(root, ".hivemind.json"))?.repo || basename(root);
    cfg = { ...cfg, repo: r.includes("/") ? r : `repo/${r}` };
  }
  const file = join(tmpdir(), `hivemind-statusline-${hash(`${cfg.url}|${cfg.repo}|${cfg.actor}|${session}|${th.COLOR ? "c" : "p"}`)}.json`);
  const entry = fileURLToPath(new URL("../hivemind.mjs", import.meta.url));
  const args = [entry, "statusline", "--refresh", "--url", cfg.url, "--repo", cfg.repo, "--user", cfg.actor, session || "-", root];
  // Point lib/fastline.mjs at this cache: the next run prints it (and starts this refresher) without loading the CLI.
  if (process.env.HIVEMIND_FASTLINE && !refreshing) {
    try {
      writeFileSync(process.env.HIVEMIND_FASTLINE, JSON.stringify({ file, args }));
    } catch {
      /* best effort */
    }
  }
  const api = (timeout) => {
    const a = makeApi({ ...cfg }, () => ({ role: "engineer" }));
    // data.mjs times out at 10s; the inline attempt must give up much sooner.
    const race = (p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), timeout).unref())]);
    return { rules: (f) => race(a.rules(f)), live: () => race(a.live()), pack: () => race(a.pack()), check: (f, text) => race(a.check(f, text)) };
  };

  if (refreshing) {
    try {
      writeFileSync(file, JSON.stringify({ at: Date.now(), line: await compute(th, api(8000), cfg, session, root) }));
    } catch {
      // keep an old line; with none, say offline (the next run retries either way)
      if (!readJson(file)) writeFileSync(file, JSON.stringify({ at: Date.now(), line: `${th.t.faint(th.HEX)} ${th.t.faint("Hivemind · offline")}` }));
    }
    try {
      unlinkSync(file + ".lock");
    } catch {
      /* already gone */
    }
    return;
  }

  const cached = readJson(file);
  if (cached && Date.now() - cached.at < TTL_MS) return void process.stdout.write(cached.line + "\n");
  if (!cached) {
    try {
      const line = await compute(th, api(INLINE_BUDGET_MS), cfg, session, root);
      writeFileSync(file, JSON.stringify({ at: Date.now(), line }));
      return void process.stdout.write(line + "\n");
    } catch {
      /* fall through: placeholder now, refresh in the background */
    }
  }
  process.stdout.write((cached?.line ?? `${th.t.faint(th.HEX)} ${th.t.faint("Hivemind")}`) + "\n");

  // One detached refresher at a time (lock file), so it outlives this run being cancelled by Claude Code.
  const lock = file + ".lock";
  if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs < LOCK_MS) return;
  writeFileSync(lock, String(process.pid));
  spawn(process.execPath, args, { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, HIVEMIND_TOKEN: cfg.token ?? "" } }).unref();
}
