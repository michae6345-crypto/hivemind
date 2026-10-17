// `hivemind watch`: the shell. Header, tab bar (Here · Rules · Queue · Feed), key routing, the teach input docked at
// the bottom, toasts, polling, resize, alternate screen. Views live in ./views/<id>.mjs (contract: ./README.md).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import * as theme from "./theme.mjs";
import { HEX, P, REDUCED, ROW_MARK_RE, bold, fg, label, plain, scopeChip, sep, t } from "./theme.mjs";
import { MOUSE_OFF, Screen, clip, keys, padEnd, spread, strip, width, wrap } from "./term.mjs";
import { blockedBy, chainOf, makeApi, ownerOf, plainError, toCards } from "./data.mjs";
import here from "./views/here.mjs";
import rules from "./views/rules.mjs";
import queue from "./views/queue.mjs";
import feed from "./views/feed.mjs";
import detail from "./views/detail.mjs";
import { switchPersona } from "./views/rulekit.mjs";
import { celebration } from "./celebrate.mjs";
import { startWatcher } from "./watcher.mjs";
import { writeWatchState } from "./statusline.mjs";

const TABS = [here, rules, queue, feed];
const POLL_MS = 2000;
const SLOW_MS = 15000;

export async function cmdWatch(cfg) {
  const short = cfg.repo.replace(/^repo\//, "");
  const state = {
    me: null, // Person
    role: "engineer",
    workspace: { org: null, project: short, root: cfg.root }, // org arrives with the rules (spec §0.5: no guesses)
    repo: cfg.repo,
    actor: cfg.actor,
    scopes: [],
    people: [],
    memories: [],
    live: { items: [], feed: [] },
    cards: [], // feed cards (data.toCards), newest first; card.born = ms when it arrived live (for the ease-in)
    rules: [], // VsRule[] for the repo (GET /api/vscode/rules)
    pending: { count: 0, items: [] },
    approver: null,
    flags: {}, // { [file]: Violation[] }
    fired: {}, // { [ruleId]: times watch flagged it this session } (why)
    files: {}, // { [file]: { text, at, checking } } (the watcher keeps the text the flags point into)
    lastFile: null,
    detail: null, // rule/memory id shown by views/detail.mjs over the current tab
    tab: "feed",
    online: null,
    toast: null, // { msg, tone, at }
    celebration: null,
    busy: null, // { label, since }
    teach: { focus: false, text: "" },
    view: {}, // per-view scratch state: state.view.queue.index etc.
  };

  const api = makeApi(cfg, () => state);
  const snapshot = !!(cfg.flags.once || cfg.flags.snapshot);
  const tty = !!process.stdout.isTTY && !snapshot;
  const screen = new Screen();
  const recordFile = typeof cfg.flags.record === "string" ? cfg.flags.record : null;

  // ---------- actions (ctx.actions) ----------
  const celebrated = new Set();
  let animUntil = 0;
  let timer = null;
  const actions = {
    setTab: (id) => {
      if (TABS.some((v) => v.id === id)) state.tab = id;
      state.detail = null;
      render();
    },
    openDetail: (id) => {
      state.detail = id;
      render();
    },
    closeDetail: () => {
      state.detail = null;
      render();
    },
    toast: (msg, tone = "muted", ms = 4000) => {
      state.toast = { msg, tone, at: Date.now(), ms };
      actions.animate(ms + 50);
    },
    celebrate: (lesson) => {
      // Once per lesson: approving in Queue celebrates, and the feed's approval card for it arrives a poll later.
      const id = lesson?.id ?? lesson?.slug ?? lesson?.title;
      if (id && celebrated.has(id)) return;
      if (id) celebrated.add(id);
      // lesson.approver = who approved it (the approved card's actor); rules = the count that ticks 10 → 11.
      state.celebration = celebration(lesson, { now: Date.now(), reduced: REDUCED, me: state.actor, rules: state.pack?.rules ?? state.rules.length });
      actions.animate(1700); // the motion is 1.6s; the card then holds until a key (or its duration) without redraws
    },
    /** Keep redrawing at ~20fps for `ms` (eases, the seal). Nothing loops forever. */
    animate: (ms) => {
      animUntil = Math.max(animUntil, Date.now() + (REDUCED ? 0 : ms));
      if (!timer) tick();
      else render();
    },
    busy: async (labelText, fn) => {
      state.busy = { label: labelText, since: Date.now() };
      const later = setTimeout(render, 420); // the word appears after 400ms; no spinner
      try {
        return await fn();
      } finally {
        clearTimeout(later);
        state.busy = null;
        render();
      }
    },
    approve: (m) => decide(m, "approve"),
    reject: (m) => decide(m, "reject"),
    refresh: () => poll(true),
    render: () => render(),
    plainError: (e, scopeId) => plainError(e, { scopes: state.scopes, scopeId }),
  };
  function tick() {
    render();
    timer = Date.now() < animUntil ? setTimeout(tick, 50) : null;
  }

  async function decide(m, how) {
    try {
      await actions.busy(how === "approve" ? "Approving" : "Rejecting", () => (how === "approve" ? api.approve(m.id) : api.reject(m.id)));
      actions.toast(how === "approve" ? `Approved "${plain(m.title)}". Every agent gets it next session.` : `Rejected "${plain(m.title)}".`, how === "approve" ? "ok" : "muted");
      await poll(true);
    } catch (e) {
      actions.toast(plainError(e, { scopes: state.scopes, scopeId: m.scopeId }), "locked", 5000);
    }
  }

  // ---------- data ----------
  let loaded = false;
  const seen = new Set();
  let lastSlow = 0;
  async function poll(force = false) {
    try {
      const slow = force || Date.now() - lastSlow > SLOW_MS;
      const [live, memories, rulesRes, sc, pack] = await Promise.all([
        api.live(),
        api.memories(),
        slow ? api.rules(state.lastFile ?? "") : null,
        slow ? api.scopes() : null,
        slow ? api.pack().catch(() => null) : null,
      ]);
      if (sc) {
        state.scopes = sc.scopes ?? [];
        state.people = sc.people ?? [];
        state.me = state.people.find((p) => p.id === state.actor) ?? null;
        theme.setPeople(state.people);
        state.role = typeof cfg.flags.role === "string" ? cfg.flags.role : (state.me?.role ?? "engineer");
        state.chain = chainOf(cfg.repo, state.scopes);
      }
      // One count everywhere: the context pack's (what the SessionStart banner says agents loaded).
      if (pack) state.pack = { rules: pack.rules ?? pack.memoryIds?.length ?? 0, locked: pack.locked ?? 0, memoryIds: pack.memoryIds ?? [] };
      if (rulesRes) {
        lastSlow = Date.now();
        state.rules = rulesRes.rules ?? [];
        state.pending = rulesRes.pending ?? state.pending;
        state.approver = rulesRes.approver;
        state.workspace.org = rulesRes.org || state.workspace.org;
      }
      state.memories = memories;
      state.live = live;
      const memById = new Map(memories.map((m) => [m.id, m]));
      const now = Date.now();
      const cards = toCards(live, memById, { shortRepo: short, now, approverOf: (s) => ownerOf(s, state.scopes) });
      for (const c of cards) {
        if (seen.has(c.key)) {
          c.born = state.cards.find((o) => o.key === c.key)?.born ?? 0;
          continue;
        }
        seen.add(c.key);
        c.born = loaded ? now : 0;
        if (loaded) onNew(c);
      }
      state.cards = mergeLocal(cards);
      state.online = true;
      loaded = true;
    } catch (e) {
      if (state.online !== false) state.offlineReason = plainError(e);
      state.offlineStatus = e?.status ?? null; // 401/403 = the token; anything else = the network or the server
      state.online = false;
    }
    render();
  }
  // Cards the shell made itself (flags, teach results) stay in the feed next to the server's.
  const local = [];
  const mergeLocal = (cards) => [...cards, ...local].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 80);
  actions.pushCard = (c) => {
    local.push({ born: Date.now(), at: new Date().toISOString(), ...c });
    state.cards = mergeLocal(state.cards.filter((x) => !local.includes(x)));
    actions.animate(400);
  };

  function onNew(c) {
    actions.animate(400); // the card's ease-in
    // The seal plays on the proposer's screen (terminal-spec §6); the approver gets the Queue's green flash.
    if (c.kind === "approved" && c.memory?.author === state.actor) actions.celebrate({ ...c.memory, approver: c.actor });
    if (c.kind === "collision") actions.toast(`Heads up: ${typeof c.line === "function" ? c.line(Date.now()) : c.line}`, "lesson", 5000);
    hooks.onCard?.(c);
  }
  const hooks = {}; // watcher/notify wiring can subscribe: hooks.onCard = (card) => …

  // ---------- render ----------
  function ctxFor(w, h) {
    return {
      width: w,
      height: h,
      theme: { ...theme, fit: padEnd, clip, spread, width, strip },
      api,
      actions,
      focus: !state.teach.focus,
      now: Date.now(),
      cfg,
    };
  }

  // Footer keycaps: the key on a dim chip, the word faint (Cursor-style). Under NO_COLOR the chip is just the key.
  const KEY = (k, what) => `${theme.COLOR ? theme.bg(P.pill)(` ${t.blueText(k)} `) : k} ${t.faint(what)}`;
  const hairline = (n) => fg(P.hair)("─".repeat(Math.max(0, n)));

  /** One line (terminal-spec §0.2): `⬢ Hivemind · Org / project` left, who you are right. Counts live on the tabs. */
  function header(w) {
    const mark = ` ${fg(P.lesson)(HEX)} ${bold(t.text("Hivemind"))}`;
    // Right side: who you are; a small rose dot joins it only while Hivemind is unreachable (nothing in the corner when live).
    const me = `${state.online === false ? `${t.locked("●")} ` : ""}${theme.handleChip(state.actor)} ${t.faint(cap(state.role))}`;
    const where = state.workspace.org ? `${state.workspace.org} / ${state.workspace.project}` : state.workspace.project;
    const full = `${mark}${sep()}${t.muted(where)}`;
    const short = `${mark}${sep()}${t.muted(state.workspace.project)}`;
    if (width(full) + width(me) + 2 <= w) return [spread(full, me, w)];
    if (width(short) + width(me) + 2 <= w) return [spread(short, me, w)];
    return [clip(short, w), clip(`   ${me}`, w)];
  }

  /** Labels, then a hairline with a heavy chrome-blue segment under the active tab. Under 50 columns: H R Q F. */
  function tabBar(w) {
    const narrow = w < 50;
    let row = "";
    let bar = "";
    layout.tabs = []; // where each label sits, for clicks
    for (const v of TABS) {
      const n = typeof v.count === "function" ? v.count(state) : null;
      const text = narrow ? ` ${v.title[0]} ` : ` ${v.title}${n ? ` ${n}` : ""} `;
      const on = state.tab === v.id && !state.detail;
      layout.tabs.push({ id: v.id, from: width(row), to: width(row) + width(text) });
      // Pills: the active tab sits on a soft blue tint (and keeps the blue underline below); the rest are muted.
      const label = narrow ? text : ` ${v.title}${n ? " " : ""}`;
      const count = !narrow && n ? `${n} ` : narrow ? "" : " ";
      row += (on
        ? theme.bg(P.tabBg)(bold(t.text(label)) + (n && !narrow ? t.blueText(count) : t.text(count)))
        : t.muted(label) + t.faint(count)) + " ";
      bar += (on ? t.blue("━".repeat(width(text))) : hairline(width(text))) + hairline(1);
    }
    return [clip(row, w), clip(bar + hairline(w - width(bar)), w, "")];
  }

  /** The teach box: only while open (t), docked at the bottom like a chat input. */
  function teachBox(w, now) {
    const tt = state.teach;
    const sent = tt.sent && now - tt.sent.at < tt.sent.ms ? tt.sent : null;
    if (!tt.focus && !tt.sending && !sent) return { lines: [], caret: null };
    const b = t.blue;
    const inner = w - 4;
    const top = `${b("╭─ ")}${bold(t.text("Teach Hivemind"))} ${b("─".repeat(Math.max(0, w - 19)) + "╮")}`;
    let mid;
    let caret = null;
    if (sent) {
      // The answer wraps inside the box (up to 3 lines): "Blocked: contradicts @greg's locked rule "…"." must be whole.
      const col = sent.tone === "locked" ? t.lockedText : t.lessonText;
      mid = wrap(plain(sent.msg), inner, 3).map((l) => theme.rich(l, { base: col }));
    } else {
      const room = inner - 3;
      const text = tt.text;
      const shown = text.length > room ? "…" + text.slice(text.length - room + 1) : text;
      mid = `${t.blueText("›")} ${tt.sending ? t.muted(shown) : text ? t.text(shown) : t.faint("Teach Hivemind a rule…")}`;
      if (tt.focus) caret = { col: 4 + width(shown) };
    }
    const chipText = scopeChip(cfg.repo);
    const right = tt.sending ? t.faint("sending") : t.blueText("enter");
    const bottom = `${b("╰─ ")}${chipText} ${b("─".repeat(Math.max(0, w - 8 - width(chipText) - width(right))))} ${right} ${b("─╯")}`;
    const rows = [mid].flat().map((m) => `${b("│")} ${padEnd(m, inner)} ${b("│")}`);
    return { lines: [clip(top, w, ""), ...rows, clip(bottom, w, "")], caret };
  }

  /** A hairline, then key hints: key bold in chrome text, the word faint, three spaces between pairs. */
  function footer(w, now) {
    const v = state.detail ? detail : TABS.find((x) => x.id === state.tab);
    const H = (k, what) => ({ k, s: KEY(k, what) }); // a hint you can also click
    const own = (v?.keys?.(state) ?? []).map(([a, b]) => H(a, b));
    let hints = state.help
      ? [H("esc", "close help"), H("q", "quit")]
      : state.teach.focus
        ? [H("enter", "send"), H("esc", "cancel")]
        : [...own, ...(!state.detail && v?.why?.(state) ? [H("w", "why")] : []), H("t", "teach"), H("?", "rules here"), H("h", "help"), H("tab", "switch"), H("q", "quit")];
    if (state.busy && now - state.busy.since > 400) hints = [{ k: null, s: t.muted(`${state.busy.label}…`) }]; // a word, not a spinner
    // Fit whole pairs, never a cut "t…": drop from the end, but `q quit` always stays last.
    const quit = hints.at(-1);
    const keep = [];
    const seen = new Set();
    for (const h of hints.slice(0, -1)) {
      if (seen.has(h.s)) continue;
      seen.add(h.s);
      if (width(" " + [...keep, h, quit].map((x) => x.s).join("   ")) <= w) keep.push(h);
    }
    if (quit) keep.push(quit);
    layout.hints = [];
    let col = 1;
    for (const h of keep) {
      layout.hints.push({ k: h.k, from: col, to: col + width(h.s) });
      col += width(h.s) + 3;
    }
    return [hairline(w), clip(" " + keep.map((x) => x.s).join("   "), w)];
  }

  /** Up to two lines above the footer for errors and confirmations (403s in plain words, approvals). Wrapped, not
   * clipped: the end of the sentence carries the point ("… Locked by @greg.", "… @ben can."). */
  function toastLines(w, now) {
    const tt = state.toast;
    if (!tt || now - tt.at > tt.ms) return [];
    const col = { ok: t.ok, locked: t.lockedText, lesson: t.lessonText, muted: t.muted }[tt.tone] ?? t.muted;
    return wrap(plain(tt.msg), w - 1, 2).map((l) => clip(` ${theme.rich(l, { base: col })}`, w));
  }

  let lastFrame = [];
  // Where things are on screen (for the mouse): tab labels, footer hints, body rows → item marks, the teach box.
  let layout = { tabs: [], hints: [], tabsRow: 0, bodyTop: 0, marks: [], boxFrom: -1, boxTo: -1, footerRow: -1 };
  let lastWatchState = "";
  const firedSeen = new Set();
  function compose() {
    const w = Math.max(40, tty ? screen.cols : Number(cfg.flags.cols) || 100);
    const h = Math.max(12, tty ? screen.rows : Number(cfg.flags.rows) || 36);
    const now = Date.now();
    const top = [...header(w), ...tabBar(w), ""]; // one quiet line under the tabs: the body never touches the bar
    const box = teachBox(w, now);
    const bottom = [...toastLines(w, now), ...box.lines, ...footer(w, now)];
    const bodyH = Math.max(1, h - top.length - bottom.length);
    const ctx = ctxFor(w, bodyH);

    let body = [];
    if (state.online === false) {
      // Said once, in the body (spec §0.1). Only a rejected token needs a restart; the network and 5xx recover on their own.
      const auth = !cfg.token || state.offlineStatus === 401 || state.offlineStatus === 403;
      const msg = auth ? "Not connected to Hivemind. Set HIVEMIND_TOKEN and restart watch." : "Not connected to Hivemind. Retrying every few seconds.";
      body.push("", ...wrap(msg, w - 2, 2).map((l) => `  ${l.split(/(HIVEMIND_TOKEN)/).map((x, i) => (i % 2 ? t.blueText(x) : t.muted(x))).join("")}`));
      ctx.height = bodyH - body.length;
    }
    const cel = state.celebration;
    if (cel && !cel.done(now)) {
      body.push(...cel.lines({ ...ctx, height: bodyH }, now), "");
      ctx.height = bodyH - body.length;
    } else if (cel) state.celebration = null;
    const view = state.detail ? detail : TABS.find((v) => v.id === state.tab);
    const bodyStart = body.length;
    try {
      const rendered = state.help ? helpLines(w) : view.render(state, ctx);
      // The shell already leaves one quiet line under the tabs; a view's own leading blank would make it two.
      if (!body.length && rendered.length && !strip(rendered[0]).trim() && !ROW_MARK_RE.test(rendered[0])) rendered.shift();
      body.push(...rendered);
    } catch (e) {
      body.push(t.lockedText(` ${view.id} view crashed: ${e.message}`));
    }
    body = body.slice(0, bodyH).map((l) => clip(l, w));
    // Row marks (theme.rowMark): an item owns its marked line and the lines under it, up to a blank line or the next
    // mark. Read them for clicks, then strip them so the terminal never sees them.
    const marks = [];
    let cur = null;
    body = body.map((l, r) => {
      const m = r >= bodyStart ? l.match(ROW_MARK_RE) : null;
      if (m) cur = m[1];
      else if (!strip(l).trim()) cur = null;
      marks.push(r >= bodyStart ? cur : null);
      return m ? l.replace(ROW_MARK_RE, "") : l;
    });
    while (body.length < bodyH) body.push("");
    const lines = [...top, ...body, ...bottom];
    const boxFrom = top.length + bodyH + toastLines(w, now).length;
    // top = header line(s) · tabs · bar · spacer
    layout = { ...layout, tabsRow: top.length - 3, bodyTop: top.length, marks, boxFrom, boxTo: boxFrom + box.lines.length - 1, footerRow: h - 1 };
    const caret = box.caret ? { row: h - 2 - 2, col: box.caret.col } : null;
    return { lines, caret };
  }

  function render() {
    const { lines, caret } = compose();
    lastFrame = lines;
    if (tty) screen.draw(lines, caret);
    if (recordFile) appendFileSync(recordFile, `\x1b[2J\x1b[H${lines.join("\n")}\n\u241E\n`);
    // "fired N× this session" (why): each new (file, rule, line) hit the watcher reports counts once.
    for (const [file, list] of Object.entries(state.flags ?? {}))
      for (const f of list ?? []) {
        const k = `${file}|${f.ruleId}|${f.startLine}`;
        if (firedSeen.has(k)) continue;
        firedSeen.add(k);
        state.fired[f.ruleId] = (state.fired[f.ruleId] ?? 0) + 1;
      }
    // Tell the Claude Code status line what watch flagged (statusline.mjs reads it for 30s).
    const flags = state.lastFile ? (state.flags[state.lastFile] ?? []) : [];
    const sig = `${state.lastFile}|${flags.map((v) => `${v.ruleId}:${v.startLine}`).join(",")}`;
    // Snapshots (e2e, screenshots) never publish: the state file is shared by every watch on this machine.
    if (!snapshot && state.lastFile && sig !== lastWatchState) {
      lastWatchState = sig;
      writeWatchState(cfg, { file: state.lastFile, flags });
    }
  }

  // ---------- help (h) ----------
  function helpLines(w) {
    const k = (key, what) => `  ${bold(t.blueText(key.padEnd(16)))} ${t.muted(what)}`;
    const lines = [
      bold(t.faint("KEYS")),
      k("1-4  tab  ← →", "switch Here · Rules · Queue · Feed"),
      k("j/k  ↑ ↓", "move · enter opens · esc goes back"),
      k("a  r", "approve / reject the selected lesson (Queue)"),
      k("w  e", "why: the rule's full history"),
      k("f", "apply the suggested fix (Here)"),
      k("t", "teach Hivemind a rule"),
      k("?", "rules for the file that last changed"),
      k("p", "switch persona (kevin · emily · ben · greg)"),
      k("i", `invert scrolling (now ${state.invertScroll ? "inverted" : "as your OS sets it"})`),
      k("h", "this help"),
      k("q  ctrl+c", "quit"),
      "",
      bold(t.faint("MOUSE")),
      mouseOn ? k("click", "a tab, a row (click again to open), a key hint below") : k("off", "started with --no-mouse"),
      k("wheel", "scrolls the list; follows your touchpad's natural/inverted setting"),
      k("shift + drag", "select text to copy while the mouse is on (Windows Terminal, VS Code)"),
      k("--no-mouse", "start without mouse support · --invert-scroll starts inverted"),
    ];
    return lines.map((l) => clip(l, w));
  }

  // ---------- mouse ----------
  const mouseOn = !cfg.flags["no-mouse"] && !process.env.HIVEMIND_NO_MOUSE;
  const persisted = (() => {
    try {
      return JSON.parse(readFileSync(join(homedir(), ".hivemind", "state.json"), "utf8"));
    } catch {
      return {};
    }
  })();
  state.invertScroll = !!(cfg.flags["invert-scroll"] || /^(1|true|yes)$/i.test(process.env.HIVEMIND_INVERT_SCROLL ?? "") || persisted.invertScroll === true);
  function toggleInvert() {
    state.invertScroll = !state.invertScroll;
    try {
      // Remember it (~/.hivemind/state.json, next to the recent repos), without touching the other keys.
      const dir = join(homedir(), ".hivemind");
      let s = {};
      try {
        s = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
      } catch {
        /* first write */
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "state.json"), JSON.stringify({ ...s, invertScroll: state.invertScroll }, null, 2) + "\n");
    } catch {
      /* read-only home: the toggle still holds for this session */
    }
    actions.toast(state.invertScroll ? "Scrolling inverted (i to undo)." : "Scrolling follows your OS setting again.", "muted", 2500);
  }

  const wheel = { n: 0, timer: null };
  let lastClick = { row: -1, mark: null, at: 0 };
  /** One mouse report from term.keys(): { b, x, y (0-based), down }. */
  function onMouse(ev) {
    if (ev.b & 64) {
      // Wheel: 64 up, 65 down (the terminal already applied the OS natural/inverted setting). Touchpads send bursts;
      // add them up and apply once per frame.
      const dir = (ev.b & 1 ? 1 : -1) * (state.invertScroll ? -1 : 1);
      wheel.n += dir;
      if (!wheel.timer) wheel.timer = setTimeout(flushWheel, 16);
      return;
    }
    if (!ev.down || ev.b & 32 || (ev.b & 3) !== 0) return; // left press only (no drags, no right/middle)
    click(ev.x, ev.y);
  }
  function flushWheel() {
    wheel.timer = null;
    const n = wheel.n;
    wheel.n = 0;
    if (!n || state.teach.focus || state.help) return;
    const v = state.detail ? detail : TABS.find((x) => x.id === state.tab);
    const ctx = ctxFor(screen.cols, screen.rows);
    const key = n > 0 ? { name: "down", ch: undefined } : { name: "up", ch: undefined };
    const steps = Math.min(60, Math.abs(n) * (v.wheelStep ?? 1));
    for (let i = 0; i < steps; i++) safeKey(v, key, ctx);
    render();
  }
  /** A footer hint's key → the same keypress the keyboard would send. */
  function press(k) {
    if (!k || k === "j/k" || k === "↑↓" || k.includes("/")) return;
    const named = { enter: ["\r", "return"], esc: ["\x1b", "escape"], tab: ["\t", "tab"] }[k];
    onKey(named ? named[0] : k, { name: named ? named[1] : k });
  }
  function click(x, y) {
    const now = Date.now();
    const inBox = y >= layout.boxFrom && y <= layout.boxTo;
    if (state.teach.focus && !inBox) {
      state.teach = { focus: false, text: "" }; // a click anywhere else closes the teach box
      return render();
    }
    if (state.help) {
      state.help = false;
      return render();
    }
    if (y === layout.tabsRow) {
      const tab = layout.tabs.find((tb) => x >= tb.from && x < tb.to);
      if (tab) actions.setTab(tab.id);
      return;
    }
    if (y === layout.footerRow) {
      const h = layout.hints.find((hn) => x >= hn.from && x < hn.to);
      if (h) press(h.k);
      return;
    }
    const r = y - layout.bodyTop;
    const mark = layout.marks[r];
    if (mark == null) return;
    if (mark === "back") return actions.closeDetail();
    const v = state.detail ? detail : TABS.find((tb) => tb.id === state.tab);
    if (!v.select) return;
    const i = Number(mark);
    const again = v.selected?.(state) === i || (lastClick.mark === mark && now - lastClick.at < 450);
    lastClick = { row: r, mark, at: now };
    v.select(i, state);
    if (again) safeKey(v, { name: "return", ch: "\r" }, ctxFor(screen.cols, screen.rows)); // second click = enter
    render();
  }

  // ---------- keys ----------
  async function sendTeach() {
    const text = state.teach.text.trim();
    if (!text) {
      state.teach = { focus: false, text: "" };
      return render();
    }
    state.teach = { focus: false, text, sending: true };
    const done = (msg, tone, ms = 3000) => {
      state.teach = { focus: false, text: "", sent: { msg, tone, at: Date.now(), ms } };
      actions.animate(0);
      setTimeout(render, ms + 20); // the box closes on its own
    };
    try {
      const res = await actions.busy("Teaching", () => api.teach(text));
      const m = res.lessons?.[0];
      const act = (res.actions ?? []).find((x) => x.memoryId === m?.id);
      const owner = m ? (ownerOf(m.scopeId, state.scopes) ?? "a lead") : null;
      if (!m) done("Nothing new to learn: Hivemind already knows that.", "muted");
      else if (m.status === "blocked") {
        const b = blockedBy(m, new Map(state.memories.map((x) => [x.id, x])));
        done(`Blocked: contradicts @${b.owner}'s locked rule "${plain(b.title)}".`, "locked", 6000);
      } else if (act?.action === "reinforced" || act?.action === "updated" || m.status === "active")
        done(`Already known. Your correction was added as evidence${m.status === "pending" ? `; still waiting on @${owner}` : ""}.`, "lesson");
      else done(`Lesson proposed. Waiting on @${owner}.`, "lesson");
      await poll(true);
    } catch (e) {
      done(plainError(e, { scopes: state.scopes }), "locked", 5000);
    }
  }

  function onTeachKey(str, key) {
    if (key.name === "escape") state.teach = { focus: false, text: "" };
    else if (key.name === "return" || key.name === "enter") return void sendTeach();
    else if (key.name === "backspace") state.teach.text = state.teach.text.slice(0, -1);
    else if (key.ctrl && key.name === "u") state.teach.text = "";
    else if (str && !key.ctrl && !key.meta && str >= " " && str !== "\x7f") state.teach.text += str;
    render();
  }

  /** A view's key handler must never take the app down: a throw becomes a toast. */
  function safeKey(view, key, ctx) {
    try {
      return view.onKey?.(key, state, ctx);
    } catch (e) {
      actions.toast(`${view.id}: ${plainError(e)}`, "locked", 5000);
      return true;
    }
  }

  function onKey(str, raw = {}) {
    if (state.help && !(raw.ctrl && raw.name === "c") && raw.name !== "q") {
      state.help = false; // any key closes the help (q still quits)
      return render();
    }
    const key = { ...raw, name: raw.name ?? str, ch: str };
    if (key.ctrl && key.name === "c") return quit();
    if (state.teach.focus) return onTeachKey(str, key);
    if (state.celebration && !state.celebration.moving?.(Date.now())) {
      state.celebration = null;
      if (key.name === "escape") return render();
    }
    const ctx = ctxFor(screen.cols, screen.rows);
    if (state.detail) {
      if (key.name === "escape" || key.name === "backspace") return actions.closeDetail();
      if (safeKey(detail, key, ctx)) return render();
    } else {
      const v = TABS.find((x) => x.id === state.tab);
      if (safeKey(v, key, ctx)) return render();
    }
    const i = TABS.findIndex((x) => x.id === state.tab);
    if (key.name === "q") return quit();
    if (key.name === "tab") return actions.setTab(TABS[(i + (key.shift ? TABS.length - 1 : 1)) % TABS.length].id);
    if (key.name === "right") return actions.setTab(TABS[(i + 1) % TABS.length].id);
    if (key.name === "left") return actions.setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
    if (/^[1-4]$/.test(str ?? "")) return actions.setTab(TABS[Number(str) - 1].id);
    // p cycles kevin → emily → ben → greg from any tab (Rules and Queue handle it themselves).
    if (key.name === "p" && !key.ctrl && !key.meta) {
      switchPersona(state, ctx);
      return render();
    }
    if (key.name === "h" && !key.ctrl && !key.meta) {
      state.help = !state.help;
      return render();
    }
    if (key.name === "i" && !key.ctrl && !key.meta) {
      toggleInvert();
      return render();
    }
    if (key.name === "t") {
      state.teach = { focus: true, text: "" };
      return render();
    }
    if ((key.name === "w" || key.name === "e") && !key.ctrl && !key.meta) {
      // why: the focused rule's full history (Detail), from Here's selected violation or Feed's block / fix row
      const id = TABS.find((x) => x.id === state.tab)?.why?.(state, ctx);
      if (!id) return actions.toast("Nothing to explain here. Select a flagged rule (Here) or a block or fix (Feed).", "muted", 3000);
      state.view.detail = { ...(state.view.detail ?? {}), from: state.tab, why: true };
      return actions.openDetail(id);
    }
    if (str === "?") {
      state.view.rules = { ...(state.view.rules ?? {}), file: state.lastFile };
      return actions.setTab("rules");
    }
    if (key.name === "escape" && state.celebration) {
      state.celebration = null;
      return render();
    }
  }

  // ---------- lifecycle ----------
  let stopKeys = () => {};
  let stopWatch = () => {};
  let interval = null;
  function quit() {
    clearInterval(interval);
    clearTimeout(timer);
    stopWatch();
    stopKeys();
    screen.stop();
    process.exit(0);
  }

  if (snapshot) {
    // One frame, no screen/keys/timers: --view here|rules|queue|feed, --file <path> (checked first), --wait <ms> (watch first).
    const view = cfg.flags.view ?? cfg.flags.tab;
    // --wait watches from the start: the first poll is 5 calls (~2s on prod) and a write during it must not be missed.
    const waiting = typeof cfg.flags.file !== "string" && cfg.flags.wait !== undefined;
    const stop = waiting
      ? (startWatcher({ root: cfg.root, cfg, state, api, actions: { ...actions, render() {}, setTab: (id) => (state.tab = view ?? id), toast() {} }, hooks }) ?? (() => {}))
      : null;
    await poll(true);
    if (typeof view === "string") state.tab = view;
    if (typeof cfg.flags.file === "string") {
      const abs = resolve(cfg.root, cfg.flags.file);
      const file = relative(cfg.root, abs).replace(/\\/g, "/");
      const text = readFileSync(abs, "utf8");
      state.lastFile = file;
      state.files[file] = { text, at: Date.now(), checking: false };
      const res = await api.check(file, text).catch((e) => ({ violations: [], error: e }));
      state.flags[file] = (res.violations ?? []).filter((v) => v.source !== "llm");
      if (typeof view !== "string") state.tab = "here";
    } else if (waiting) {
      await new Promise((r) => setTimeout(r, Number(cfg.flags.wait) || 1500));
      stop();
    }
    // --press "jw": keys typed in order before the frame (e2e: `--view feed --press w` opens why)
    for (const ch of typeof cfg.flags.press === "string" ? cfg.flags.press : "") onKey(ch, { name: ch === "\x1b" ? "escape" : ch });
    if (typeof cfg.flags.press !== "string") state.toast = null;
    animUntil = 0;
    process.stdout.write(compose().lines.join("\n") + "\n");
    // Snapshots never turn the mouse on; still, on a real terminal make sure it's off (a crashed watch may have left it).
    if (process.stdout.isTTY) process.stdout.write(MOUSE_OFF);
    // No process.exit(): on Windows it can abort inside libuv while fetch sockets are closing. Nothing else is pending.
    process.exitCode = 0;
    return;
  }
  if (!tty) return logMode(cfg, state, poll, hooks);

  screen.start({ mouse: mouseOn });
  screen.onResize = () => render();
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, quit);
  // An async slip in a view (a failed approve, a fetch) is a toast, not a dead pane.
  process.on("unhandledRejection", (e) => actions.toast(plainError(e), "locked", 5000));
  process.on("uncaughtException", (e) => {
    stopKeys(); // raw mode off too, not just the screen and the mouse
    screen.stop();
    console.error(e);
    process.exit(1);
  });
  stopKeys = keys(onKey, { onMouse: mouseOn ? onMouse : undefined });
  render();
  await poll(true);
  interval = setInterval(() => poll(), POLL_MS);
  stopWatch = startWatcher({ root: cfg.root, cfg, state, api, actions, hooks }) ?? (() => {});
}

const cap = (s) => String(s ?? "").replace(/^./, (c) => c.toUpperCase());

/** Not a TTY (piped, CI, a log file): one plain line per new card, no screen, no keys. */
async function logMode(cfg, state, poll, hooks) {
  const line = (c) => {
    const text = typeof c.line === "function" ? c.line(Date.now()) : c.line;
    return `${new Date(c.at).toLocaleTimeString()}  ${strip(label(c.kind))}  ${plain(text)}`;
  };
  hooks.onCard = (c) => console.log(line(c));
  console.log(`${HEX} Hivemind · watching ${cfg.repo} as @${cfg.actor} (not a terminal: printing new events as lines)`);
  await poll(true);
  for (const c of state.cards.slice(0, 5).reverse()) console.log(line(c));
  setInterval(() => poll(), POLL_MS);
}
