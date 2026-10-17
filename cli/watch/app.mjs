// `hivemind watch`: the shell. Header, tab bar (Here · Rules · Queue · Feed), key routing, the teach input docked at
// the bottom, toasts, polling, resize, alternate screen. Views live in ./views/<id>.mjs (contract: ./README.md).
import { appendFileSync } from "node:fs";
import { relative } from "node:path";
import * as theme from "./theme.mjs";
import { HEX, P, REDUCED, bold, fg, label, plain, scopeChip, sep, t } from "./theme.mjs";
import { Screen, clip, keys, padEnd, spread, strip, width } from "./term.mjs";
import { chainOf, makeApi, ownerOf, plainError, toCards } from "./data.mjs";
import here from "./views/here.mjs";
import rules from "./views/rules.mjs";
import queue from "./views/queue.mjs";
import feed from "./views/feed.mjs";
import detail from "./views/detail.mjs";
import { celebration } from "./celebrate.mjs";
import { startWatcher } from "./watcher.mjs";

const TABS = [here, rules, queue, feed];
const POLL_MS = 2000;
const SLOW_MS = 15000;
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export async function cmdWatch(cfg) {
  const short = cfg.repo.replace(/^repo\//, "");
  const state = {
    me: null, // Person
    role: "engineer",
    workspace: { org: "Hivemind", project: short, root: cfg.root },
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
  const tty = !!process.stdout.isTTY && !cfg.flags.once;
  const screen = new Screen();
  const recordFile = typeof cfg.flags.record === "string" ? cfg.flags.record : null;

  // ---------- actions (ctx.actions) ----------
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
      state.celebration = celebration(lesson, { now: Date.now(), reduced: REDUCED, me: state.actor });
      actions.animate(state.celebration.duration ?? 6000);
    },
    /** Keep redrawing at ~30fps for `ms` (eases, the seal, the spinner). Nothing loops forever. */
    animate: (ms) => {
      animUntil = Math.max(animUntil, Date.now() + (REDUCED ? 0 : ms));
      if (!timer) tick();
      else render();
    },
    busy: async (labelText, fn) => {
      state.busy = { label: labelText, since: Date.now() };
      actions.animate(60000);
      try {
        return await fn();
      } finally {
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
    timer = Date.now() < animUntil ? setTimeout(tick, 33) : null;
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
      const [live, memories, rulesRes, sc] = await Promise.all([
        api.live(),
        api.memories(),
        slow ? api.rules(state.lastFile ?? "") : null,
        slow ? api.scopes() : null,
      ]);
      if (sc) {
        state.scopes = sc.scopes ?? [];
        state.people = sc.people ?? [];
        state.me = state.people.find((p) => p.id === state.actor) ?? null;
        state.role = typeof cfg.flags.role === "string" ? cfg.flags.role : (state.me?.role ?? "engineer");
        state.chain = chainOf(cfg.repo, state.scopes);
      }
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
    if (c.kind === "approved") actions.celebrate(c.memory);
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

  function header(w) {
    const who = state.me ? `${t.handle(`@${state.me.id}`)}${sep()}${t.muted(cap(state.role))}` : t.handle(`@${state.actor}`);
    const left = ` ${fg(P.lesson)(HEX)} ${bold(t.text("Hivemind"))}${sep()}${t.text(state.workspace.org)}${t.faint(" / ")}${t.text(state.workspace.project)}${sep()}${who}`;
    const status = state.online === null ? t.faint("connecting") : state.online ? `${t.ok("●")} ${t.muted("live")}` : `${t.faint("○")} ${t.faint("offline")}`;
    const locked = state.rules.filter((r) => r.locked).length;
    const waiting = state.pending?.count ?? 0;
    const counts = ` ${t.muted(`${state.rules.length} rules`)}${sep()}${t.muted(`${locked} locked`)}${sep()}${waiting ? t.lessonText(`${waiting} waiting`) : t.muted("0 waiting")}${state.approver && waiting ? t.faint(` on @${state.approver.id}`) : ""}`;
    const watching = state.lastFile ? t.faint(`last change ${state.lastFile}`) : t.faint(`watching ${relative(process.cwd(), cfg.root) || "."}`);
    return [spread(left, status + " ", w), spread(counts, watching + " ", w)];
  }

  function tabBar(w) {
    let top = " ";
    let under = t.hair("─");
    for (const v of TABS) {
      const n = typeof v.count === "function" ? v.count(state) : null;
      const name = ` ${v.title}${n ? ` ${n}` : ""} `;
      const active = state.tab === v.id && !state.detail;
      top += (active ? bold(t.text(` ${v.title}`)) + (n ? t.lessonText(` ${n}`) : "") + " " : t.muted(` ${v.title}`) + (n ? t.faint(` ${n}`) : "") + " ") + " ";
      under += (active ? t.blue("━".repeat(width(name))) : t.hair("─".repeat(width(name)))) + t.hair("─");
    }
    under += t.hair("─".repeat(Math.max(0, w - width(under))));
    const hint = state.detail ? t.faint("esc back ") : t.faint("tab switch ");
    return [spread(top, hint, w), clip(under, w, "")];
  }

  function teachBox(w) {
    const focus = state.teach.focus;
    const border = focus ? t.blue : t.hair;
    const inner = w - 4;
    const chipText = scopeChip(cfg.repo);
    const room = inner - width(chipText) - 4;
    const text = state.teach.text;
    const shown = text.length > room ? "…" + text.slice(text.length - room + 1) : text;
    const body = text ? t.text(shown) : t.faint(focus ? "Teach Hivemind a rule…  (enter sends, esc cancels)" : "Teach Hivemind a rule…");
    const send = text ? t.blue("↵") : t.faint(focus ? "↵" : "t");
    const line = `${chipText} ${body}`;
    return {
      lines: [
        " " + border("╭" + "─".repeat(w - 4) + "╮"),
        " " + border("│") + " " + spread(line, send, inner - 2) + " " + border("│"),
        " " + border("╰" + "─".repeat(w - 4) + "╯"),
      ],
      caret: focus ? { col: 3 + width(chipText) + 1 + width(shown) } : null,
    };
  }

  function footer(w, now) {
    const k = (key, what) => `${t.blueText(key)} ${t.faint(what)}`;
    const v = state.detail ? detail : TABS.find((x) => x.id === state.tab);
    const own = (v?.keys?.(state) ?? []).map(([a, b]) => k(a, b));
    const hints = state.teach.focus
      ? [k("enter", "send"), k("esc", "cancel")]
      : [...own, k("t", "teach"), k("?", "rules here"), k("q", "quit")];
    let left = " " + hints.join(t.faint("  "));
    if (state.busy && now - state.busy.since > 400) {
      const f = SPIN[Math.floor((now - state.busy.since) / 80) % SPIN.length];
      left = ` ${t.blue(f)} ${t.muted(state.busy.label + "…")}`;
    }
    return clip(left, w);
  }

  function toastLine(w, now) {
    const tt = state.toast;
    if (!tt || now - tt.at > tt.ms) return "";
    const age = now - tt.at;
    const a = REDUCED ? 1 : Math.min(1, age / 200, (tt.ms - age) / 300);
    return theme.faded(a, () => {
      const col = { ok: t.ok, locked: t.lockedText, lesson: t.lessonText, muted: t.muted }[tt.tone] ?? t.muted;
      const mark = { ok: t.ok, locked: t.locked, lesson: t.lesson, muted: t.faint }[tt.tone] ?? t.faint;
      return clip(` ${mark(HEX)} ${col(theme.rich(plain(tt.msg), { base: col }))}`, w);
    });
  }

  let lastFrame = [];
  function compose() {
    const w = Math.max(40, tty ? screen.cols : Number(cfg.flags.cols) || 100);
    const h = Math.max(16, tty ? screen.rows : Number(cfg.flags.rows) || 36);
    const now = Date.now();
    const top = [...header(w), "", ...tabBar(w)];
    const box = teachBox(w);
    const bottom = [toastLine(w, now), ...box.lines, footer(w, now)];
    const bodyH = h - top.length - bottom.length;
    const ctx = ctxFor(w, bodyH);

    let body = [];
    const cel = state.celebration;
    if (cel && !cel.done(now)) {
      body.push(...cel.lines({ ...ctx, height: bodyH }, now), "");
      ctx.height = bodyH - body.length;
    } else if (cel) state.celebration = null;
    const view = state.detail ? detail : TABS.find((v) => v.id === state.tab);
    try {
      body.push(...view.render(state, ctx));
    } catch (e) {
      body.push(t.lockedText(` view ${view.id} crashed: ${e.message}`));
    }
    body = body.slice(0, bodyH).map((l) => clip(l, w));
    while (body.length < bodyH) body.push("");
    const lines = [...top, ...body, ...bottom];
    const caret = box.caret ? { row: h - 4, col: box.caret.col } : null;
    return { lines, caret };
  }

  function render() {
    const { lines, caret } = compose();
    lastFrame = lines;
    if (tty) screen.draw(lines, caret);
    if (recordFile) appendFileSync(recordFile, `\x1b[2J\x1b[H${lines.join("\n")}\n␞\n`);
  }

  // ---------- keys ----------
  async function sendTeach() {
    const text = state.teach.text.trim();
    state.teach = { focus: false, text: "" };
    if (!text) return render();
    try {
      const res = await actions.busy("Teaching", () => api.teach(text));
      const m = res.lessons?.[0];
      if (!m) return actions.toast("Nothing new to learn: Hivemind already knows that, or found no reusable rule.", "muted");
      const owner = ownerOf(m.scopeId, state.scopes) ?? "a lead";
      if (m.status === "blocked") {
        const memById = new Map(state.memories.map((x) => [x.id, x]));
        const { blockedBy } = await import("./data.mjs");
        const b = blockedBy(m, memById);
        actions.toast(`Blocked: contradicts @${b.owner}'s locked rule "${plain(b.title)}".`, "locked", 6000);
      } else actions.toast(`Lesson proposed. Waiting on @${owner}.`, "lesson", 3000);
      await poll(true);
    } catch (e) {
      actions.toast(plainError(e), "locked", 5000);
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

  function onKey(str, raw = {}) {
    const key = { ...raw, name: raw.name ?? str, ch: str };
    if (key.ctrl && key.name === "c") return quit();
    if (state.teach.focus) return onTeachKey(str, key);
    const ctx = ctxFor(screen.cols, screen.rows);
    if (state.detail) {
      if (key.name === "escape" || key.name === "backspace") return actions.closeDetail();
      if (detail.onKey?.(key, state, ctx)) return render();
    } else {
      const v = TABS.find((x) => x.id === state.tab);
      if (v.onKey?.(key, state, ctx)) return render();
    }
    const i = TABS.findIndex((x) => x.id === state.tab);
    if (key.name === "q") return quit();
    if (key.name === "tab") return actions.setTab(TABS[(i + (key.shift ? TABS.length - 1 : 1)) % TABS.length].id);
    if (key.name === "right") return actions.setTab(TABS[(i + 1) % TABS.length].id);
    if (key.name === "left") return actions.setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
    if (/^[1-4]$/.test(str ?? "")) return actions.setTab(TABS[Number(str) - 1].id);
    if (key.name === "t") {
      state.teach.focus = true;
      return render();
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

  if (cfg.flags.once) {
    await poll(true);
    if (typeof cfg.flags.tab === "string") state.tab = cfg.flags.tab;
    process.stdout.write(compose().lines.join("\n") + "\n");
    return;
  }
  if (!tty) return logMode(cfg, state, poll, hooks);

  screen.start();
  screen.onResize = () => render();
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, quit);
  process.on("uncaughtException", (e) => {
    screen.stop();
    console.error(e);
    process.exit(1);
  });
  stopKeys = keys(onKey);
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
