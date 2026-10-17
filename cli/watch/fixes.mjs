// Fixes as learning events (owner: J). The watcher calls tracker.onChange(file, text, flagsBefore, flagsAfter) for every
// changed file. When a human edit rewrites lines an agent just wrote, or makes a flagged violation disappear (including
// the `f` key), we send POST /api/events { type: "fix", payload: { file, diff, before, after, previousAuthor,
// violationRuleId?, url, line } } and show "Learning from your fix…" → the engine's answer ("Lesson captured from @kevin's fix: …").
// At most one fix event per file per 30s; whitespace-only and rename-only diffs are skipped.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { client, ownerOf } from "./data.mjs";
import { plain } from "./theme.mjs";

const CACHE_MAX = 400; // files kept in memory
const SEED_MAX_BYTES = 256 * 1024;
const SEED_MAX_FILES = 5000; // mtimes recorded for at most this many files
const AGENT_WINDOW_MS = 6000; // an agent's activity this recent means the write was the agent's
const SETTLE_MS = 1500; // a human fix is sent once the file has been quiet this long
const PER_FILE_MS = 30000;
const HUMAN_AGENTS = new Set(["cli", "vscode", "other"]);
const MAX_DIFF_LINES = 60;
const MAX_DIFF_BYTES = 4096;

const split = (s) => String(s ?? "").split(/\r?\n/);

/** One-hunk unified diff (common prefix/suffix trimmed, 1 line of context), or null if nothing changed. */
export function compactDiff(file, a, b, context = 1) {
  const A = split(a);
  const B = split(b);
  let p = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0;
  while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  const del = A.slice(p, A.length - s);
  const add = B.slice(p, B.length - s);
  if (!del.length && !add.length) return null;
  const c0 = Math.max(0, p - context);
  const pre = A.slice(c0, p);
  const post = A.slice(A.length - s, Math.min(A.length, A.length - s + context));
  let body = [...pre.map((l) => " " + l), ...del.map((l) => "-" + l), ...add.map((l) => "+" + l), ...post.map((l) => " " + l)];
  if (body.length > MAX_DIFF_LINES) body = [...body.slice(0, MAX_DIFF_LINES - 1), " …"];
  const head = `@@ -${c0 + 1},${pre.length + del.length + post.length} +${c0 + 1},${pre.length + add.length + post.length} @@`;
  let diff = [`--- a/${file}`, `+++ b/${file}`, head, ...body].join("\n");
  if (Buffer.byteLength(diff) > MAX_DIFF_BYTES) diff = Buffer.from(diff).subarray(0, MAX_DIFF_BYTES - 8).toString("utf8").replace(/�+$/, "") + "\n …";
  return { diff, before: del.join("\n"), after: add.join("\n"), del, add, line: p };
}

/** True when the change is only whitespace, or only renames identifiers (same token shape, consistent mapping). */
export function trivial(before, after) {
  if (before.replace(/\s+/g, "") === after.replace(/\s+/g, "")) return true;
  const tok = (s) => s.match(/[A-Za-z_$][\w$]*|\S/g) ?? [];
  const x = tok(before);
  const y = tok(after);
  if (x.length !== y.length) return false;
  const fwd = new Map();
  const back = new Map();
  for (let i = 0; i < x.length; i++) {
    const id = /^[A-Za-z_$]/.test(x[i]) && /^[A-Za-z_$]/.test(y[i]);
    if (!id) {
      if (x[i] !== y[i]) return false;
      continue;
    }
    if ((fwd.get(x[i]) ?? y[i]) !== y[i] || (back.get(y[i]) ?? x[i]) !== x[i]) return false;
    fwd.set(x[i], y[i]);
    back.set(y[i], x[i]);
  }
  return true;
}

/** GitHub permalink to `file` at `line` (1-based) on HEAD: https://github.com/o/r/blob/<sha>/<path>#L<line>. Null outside git. */
const gitInfo = new Map();
export function permalink(root, file, line) {
  let g = gitInfo.get(root);
  if (g === undefined) {
    try {
      const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const remote = git("remote", "get-url", "origin")
        .replace(/^git@([^:]+):/, "https://$1/")
        .replace(/^ssh:\/\/git@/, "https://")
        .replace(/\.git$/, "");
      g = { remote, top: git("rev-parse", "--show-toplevel"), sha: git("rev-parse", "HEAD") };
    } catch {
      g = null;
    }
    gitInfo.set(root, g);
  }
  if (!g) return null;
  const path = relative(g.top, join(root, file)).replace(/\\/g, "/");
  return `${g.remote}/blob/${g.sha}/${path}${line ? `#L${line}` : ""}`;
}

/** The engine's answer as one plain sentence (terminal-spec §8 wording). */
export function resultLine(res, { actor, scopes }) {
  const act = res?.actions?.[0];
  const m = res?.lessons?.find((l) => l.id === act?.memoryId) ?? res?.lessons?.[0];
  const title = m ? `"${plain(m.title)}"` : "";
  // The engine's own sentence(s), verbatim: one line per lesson ("Lesson captured from @kevin's fix in f.ts:6: …").
  if (typeof res?.message === "string" && res.message.trim()) {
    const tone = act?.action === "blocked" ? "locked" : act?.action === "reinforced" || act?.action === "updated" ? "ok" : act ? "lesson" : "muted";
    return { text: res.message.trim(), tone, ...(m ? { memory: m } : {}) };
  }
  if (!act || !m) return { text: "Hivemind · Saved your fix. The team already knows this one.", tone: "muted" };
  if (act.action === "blocked") return { text: `Hivemind · Blocked: ${plain(act.note ?? `contradicts a locked rule`)}.`.replace(/\.\.$/, "."), tone: "locked", memory: m };
  if (act.action === "reinforced" || act.action === "updated") return { text: `Hivemind · Reinforced: ${title}.`, tone: "ok", memory: m };
  const owner = ownerOf(m.scopeId, scopes ?? []);
  const wait = m.status === "pending" ? ` Waiting on ${owner ? `@${owner}` : "a lead"}.` : "";
  return { text: `Hivemind · Lesson captured from @${actor}'s fix: ${title}.${wait}`, tone: "lesson", memory: m };
}

export function fixTracker({ root, cfg, state, actions, skip, code, onSeed }) {
  const http = client(cfg);
  let kPermalink = null; // K's cli/watch/git.mjs permalink(), when it lands
  import("./git.mjs").then((m) => (kPermalink = typeof m.permalink === "function" ? m.permalink : null), () => {});
  const permalinkOf = (file, line) => {
    try {
      const u = kPermalink?.({ root, file, line });
      if (typeof u === "string" && u) return u;
    } catch {}
    return permalink(root, file, line);
  };
  const cache = new Map(); // file → { text, author, agentText?, agentLines?: Set<string> }
  const timers = new Map();
  const lastSent = new Map();
  const remember = (file, entry) => {
    cache.delete(file);
    cache.set(file, entry);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  };

  // Seed with the repo's current source, so the first agent write already has a "before" (and tell the watcher every
  // file's mtime, so merely reading a file never counts as a change).
  let seen = 0;
  (function seed(dir, depth = 0) {
    if (seen >= SEED_MAX_FILES || depth > 8) return;
    let names = [];
    try {
      names = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      const abs = join(dir, d.name);
      const rel = relative(root, abs).replace(/\\/g, "/");
      if (skip.test(rel)) continue;
      if (d.isDirectory()) seed(abs, depth + 1);
      else if (code.test(d.name) && seen++ < SEED_MAX_FILES) {
        try {
          const st = statSync(abs);
          onSeed?.(rel, st.mtimeMs);
          if (cache.size < CACHE_MAX && st.size <= SEED_MAX_BYTES) cache.set(rel, { text: readFileSync(abs, "utf8"), author: null });
        } catch {}
      }
    }
  })(root);

  /** `agent:claude-code` if an agent wrote `file` in the last few seconds (hooks' activity), else null. */
  async function agentWriter(file) {
    const live = await http.get("/api/activity/live", { timeout: 4000 }).catch(() => state.live);
    const f = file.toLowerCase();
    const hit = (live?.items ?? []).find((a) => {
      const g = String(a.file ?? "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
      return a.agent && !HUMAN_AGENTS.has(a.agent) && Date.now() - Date.parse(a.createdAt) <= AGENT_WINDOW_MS && (g === f || f.endsWith("/" + g) || g.endsWith("/" + f));
    });
    return hit ? `agent:${hit.agent}` : null;
  }

  async function onChange(file, text, flagsBefore = [], flagsAfter = []) {
    const prev = cache.get(file);
    const agent = await agentWriter(file);
    if (agent) {
      const d = prev ? compactDiff(file, prev.text, text) : null;
      remember(file, { text, author: agent, agentText: text, agentLines: new Set((d?.add ?? split(text)).map((l) => l.trim()).filter(Boolean)) });
      clearTimeout(timers.get(file));
      return;
    }
    remember(file, { ...(prev ?? { author: null }), text });
    if (!prev) return;

    // Did this human edit rewrite the agent's lines, or make a flagged violation go away?
    const fromAgent = prev.author?.startsWith("agent:") && prev.agentText != null;
    const touched = fromAgent && (compactDiff(file, prev.agentText, text)?.del ?? []).some((l) => prev.agentLines?.has(l.trim()));
    const afterIds = new Set(flagsAfter.map((v) => v.ruleId));
    const gone = flagsBefore.filter((v) => !afterIds.has(v.ruleId)).sort((a, b) => Number(b.locked) - Number(a.locked))[0];
    if (!touched && !gone) return;

    const pending = {
      base: touched ? prev.agentText : prev.text,
      previousAuthor: touched ? prev.author : prev.author ? (prev.author.startsWith("agent:") ? prev.author : `@${prev.author}`) : `@${cfg.actor}`,
      violationRuleId: gone?.ruleId,
    };
    clearTimeout(timers.get(file));
    timers.set(file, setTimeout(() => (timers.delete(file), void send(file, pending)), SETTLE_MS));
  }

  async function send(file, { base, previousAuthor, violationRuleId }) {
    if (Date.now() - (lastSent.get(file) ?? 0) < PER_FILE_MS) return;
    const text = cache.get(file)?.text;
    const d = text != null ? compactDiff(file, base, text) : null;
    if (!d || trivial(d.before, d.after)) return;
    lastSent.set(file, Date.now());
    remember(file, { text, author: cfg.actor }); // the agent's lines are now the human's

    const here = (state.view.here ??= {});
    here.learning = { file, text: "Learning from your fix…", tone: "muted", at: Date.now() };
    actions.toast("Learning from your fix…", "muted", 30000);
    let res;
    try {
      res = await http.post(
        "/api/events",
        {
          type: "fix",
          actor: cfg.actor,
          sessionId: `watch-${process.pid}`,
          repo: cfg.repo,
          payload: {
            file,
            diff: d.diff,
            before: d.before,
            after: d.after,
            previousAuthor,
            line: d.line + 1,
            url: permalinkOf(file, d.line + 1),
            ...(violationRuleId ? { violationRuleId } : {}),
          },
        },
        { timeout: 60000 },
      );
    } catch (e) {
      const why = e?.status === 400 ? "This Hivemind server can't learn from fixes yet." : actions.plainError(e);
      here.learning = { file, text: why, tone: "muted", at: Date.now() };
      actions.toast(why, "muted", 5000);
      return;
    }
    const r = resultLine(res, { actor: cfg.actor, scopes: state.scopes });
    here.learning = { file, text: r.text, tone: r.tone, at: Date.now() };
    const lines = r.text.split(/\r?\n/).filter(Boolean);
    actions.toast(lines.length > 1 ? `${lines[0]} (+${lines.length - 1} more)` : lines[0], r.tone, 8000);
    lines.forEach((line, i) =>
      actions.pushCard?.({ key: `fix:${res?.id ?? Date.now()}:${i}`, kind: "captured", actor: cfg.actor, agent: "cli", line, ...(r.memory ? { memory: r.memory, scopeId: r.memory.scopeId } : {}) }),
    );
    return r;
  }

  return { onChange, send, agentWriter, cache };
}
