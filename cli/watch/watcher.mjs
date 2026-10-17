// File watching → POST /api/vscode/check → state.flags (owner: J). startWatcher({ root, cfg, state, api, actions, hooks }) → stop().
// Catches you typing/saving and agents (Claude Code, Cursor, Codex…) writing files: recursive fs.watch, ~250ms debounce
// per file, unchanged text skipped. The server's own deterministic detectors run locally first (vendor/detectors.mjs,
// a few ms), then the server's answer (~1-2s) confirms with the same slug/line/columns. No LLM guesses on screen.
// A NEW locked-rule hit jumps to Here and raises one notice (in-app toast + --notify OS toast), at most one a minute:
// `Claude Code's edit breaks a locked rule: Never mix data from different lab customers. Locked by @maya.`
import { readFileSync, statSync, watch } from "node:fs";
import { join } from "node:path";
import { fixTracker } from "./fixes.mjs";
import { notify } from "./notify.mjs";
import { plain, toolName } from "./theme.mjs";
import { detect } from "./vendor/detectors.mjs";

const CODE = /\.(m?[jt]sx?|cjs|cts|py|go|rb|java|kt|rs|sql|cs|php|swift|scala|sh)$/i;
// Tool/agent state dirs too (.paseo worktrees, .claude, caches): a watch started too high must never flag those.
const SKIP = /(^|[\\/])(node_modules|\.git|\.next|dist|build|out|coverage|\.vscode-test|\.paseo|\.claude|\.cache|\.turbo|\.vercel)([\\/]|$)/;
const DEBOUNCE_MS = 250; // write → flag on screen in ~300ms (QA2); a save that lands in chunks is re-checked, the text guard dedupes
const NOTICE_GAP_MS = 60 * 1000;
const AGENT_WINDOW_MS = 3 * 60 * 1000;

const keyOf = (v, lines) => `${v.ruleSlug}:${(lines[v.startLine] ?? "").trim()}`;
const at = (h) => (String(h).startsWith("@") ? h : `@${h}`);

/** Which agent just wrote `file`, from the hooks' activity feed (state.live.items, polled by the shell). */
function writerOf(state, file) {
  const f = file.toLowerCase();
  const since = Date.now() - AGENT_WINDOW_MS;
  const hit = (state.live?.items ?? []).find((a) => {
    const g = String(a.file ?? "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
    return a.agent && a.agent !== "vscode" && Date.parse(a.createdAt) >= since && (g === f || f.endsWith("/" + g) || g.endsWith("/" + f));
  });
  return hit ? toolName(hit.agent) : "";
}

/** `Claude Code's edit breaks a locked rule: {title}. Locked by @maya.` (editor-spec §2f, toast 1) */
export function breakSentence(v, tool) {
  const owner = String(v.owner ?? "").split(/[\s(,]/)[0] || "a lead";
  return `${tool ? `${tool}'s edit` : "This edit"} breaks a locked rule: ${plain(v.ruleTitle)}. Locked by ${at(owner)}.`;
}

export function startWatcher({ root, cfg, state, api, actions }) {
  const timers = new Map();
  const known = new Map(); // file → violation keys already shown (only NEW ones flash, jump and notify)
  let lastNotice = 0;
  let w;
  try {
    w = watch(root, { recursive: true }, (_ev, name) => {
      if (!name) return;
      const file = String(name).replace(/\\/g, "/");
      if (SKIP.test(file) || !CODE.test(file)) return;
      clearTimeout(timers.get(file));
      timers.set(file, setTimeout(() => (timers.delete(file), void check(file)), DEBOUNCE_MS));
    });
  } catch {
    return () => {};
  }
  // Fixes as learning events: a human rewriting an agent's lines, or making a flag go away (fixes.mjs).
  const mtimes = new Map(); // file → mtime last checked (seeded at start, so existing files only count once written)
  const tracker = fixTracker({ root, cfg, state, actions, skip: SKIP, code: CODE, onSeed: (file, mtime) => mtimes.set(file, mtime) });

  async function check(file) {
    let text;
    try {
      const st = statSync(join(root, file));
      // Windows reports reads (last-access) as changes too: only a new mtime is a write.
      if (!st.isFile() || mtimes.get(file) === st.mtimeMs) return;
      mtimes.set(file, st.mtimeMs);
      text = readFileSync(join(root, file), "utf8");
    } catch {
      return; // deleted or mid-write; the next event retries
    }
    const prev = state.files[file];
    if (prev && prev.text === text && !prev.checking) return; // fs.watch fires twice per save on Windows
    state.lastFile = file;
    state.files[file] = { text, at: Date.now(), checking: true, checkedAt: prev?.checkedAt };
    const lines = text.split(/\r?\n/);
    const flagsBefore = state.flags[file] ?? [];
    let tracked = false;

    // Instant: the server's detectors, locally, with the rules the shell already loaded.
    const rules = (state.rules ?? []).filter((r) => r.kind !== "owner");
    if (rules.length) {
      try {
        const local = detect(lines, rules);
        publish(file, lines, local);
        void tracker.onChange(file, text, flagsBefore, local);
        tracked = true;
      } catch {
        actions.render(); // the vendored copy can't run a detector the server changed: wait for the server
      }
    } else actions.render();

    // Then the server confirms (same hits; its rules may be newer than ours).
    let vs;
    try {
      const res = await api.check(file, text);
      vs = (res.violations ?? []).filter((v) => v.source !== "llm");
    } catch (e) {
      if (state.files[file]?.text === text) state.files[file].checking = false;
      if (!rules.length) actions.toast(actions.plainError(e), "locked");
      if (!tracked) void tracker.onChange(file, text, flagsBefore, flagsBefore);
      return actions.render();
    }
    if (state.files[file]?.text !== text) return; // a newer write is already being checked
    state.files[file] = { ...state.files[file], checking: false, checkedAt: Date.now() };
    publish(file, lines, vs);
    if (!tracked) void tracker.onChange(file, text, flagsBefore, vs);
  }

  /** Show a file's hits; NEW ones flash in and jump to Here, and a new locked one raises the notice. */
  function publish(file, lines, vs) {
    state.flags[file] = vs;
    const seen = known.get(file) ?? new Set();
    const fresh = vs.filter((v) => !seen.has(keyOf(v, lines)));
    known.set(file, new Set(vs.map((v) => keyOf(v, lines))));
    if (!fresh.length) return actions.render();

    // The soft-flash entrance (views/here.mjs): faint → muted → full over 3 frames.
    const here = (state.view.here ??= {});
    here.born = { ...(here.born ?? {}) };
    for (const v of fresh) here.born[`${file}|${keyOf(v, lines)}`] = Date.now();
    here.index = 0;
    actions.setTab("here");
    actions.animate(250);

    const locked = fresh.find((v) => v.locked);
    if (!locked || Date.now() - lastNotice < NOTICE_GAP_MS) return;
    lastNotice = Date.now();
    // The shell's live poll can lag the write by a couple of seconds: ask the hooks' activity directly if needed.
    const wrote = writerOf(state, file);
    void (wrote ? Promise.resolve(wrote) : tracker.agentWriter(file).then((a) => (a ? toolName(a.slice("agent:".length)) : ""))).then((tool) => {
      const sentence = breakSentence(locked, tool);
      actions.toast(sentence, "locked", 6000);
      if (cfg?.flags?.notify) notify("Hivemind", sentence);
    });
  }

  return () => {
    w?.close();
    for (const t of timers.values()) clearTimeout(t);
  };
}
