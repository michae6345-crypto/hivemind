// Rules (owner: I): every active rule for this repo by layer, #org › #team/… › #repo/… › you, with locked rules pinned
// on top. `/` filters, j/k move, enter opens the rule (or folds a section), p switches persona. `?` from the shell
// sets state.view.rules.file to show only the rules for the file that last changed.
import { allMemories, isNew, ownerHandle, switchPersona } from "./rulekit.mjs";

const LAYERS = [
  { key: "org", word: "ORG" },
  { key: "team", word: "TEAM" },
  { key: "repo", word: "REPO" },
  { key: "you", word: "YOU" },
];

const view = (state) => (state.view.rules ??= { index: 0, filter: "", filtering: false, collapsed: {} });

function matches(m, q) {
  if (!q) return true;
  const hay = `${m.title} ${m.body ?? ""} ${m.scopeId} ${m.author} ${ownerHandle(m)}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w.replace(/^[@#]/, "")));
}

/** Rules that touch `file`: flagged there, or a symbol they name appears in its text. */
function forFile(file, state) {
  const ids = new Set((state.flags?.[file] ?? []).map((v) => v.ruleId));
  const text = state.files?.[file]?.text ?? "";
  for (const r of state.rules ?? []) if (r.mentionsFile || (r.symbols ?? []).some((s) => text.includes(s))) ids.add(r.id);
  return ids;
}

/** Sections and the flat, selectable item list (headers + rows). */
function model(state, ctx) {
  const v = view(state);
  const mine = `personal/${state.actor}`;
  const chain = state.chain ?? [];
  const only = v.file ? forFile(v.file, state) : null;
  const rules = allMemories(state, ctx).filter(
    (m) =>
      m.status === "active" &&
      (chain.includes(m.scopeId) || m.scopeId === mine) &&
      matches(m, v.filter) &&
      (!only || only.has(m.id)),
  );
  const byTitle = (a, b) => (isNew(b, ctx.now) - isNew(a, ctx.now)) || a.title.localeCompare(b.title);
  const sections = [{ key: "locked", word: "LOCKED", scopeId: null, rows: rules.filter((m) => m.locked).sort(byTitle) }];
  for (const L of LAYERS) {
    const scopeId = L.key === "you" ? mine : L.key === "org" ? "org" : chain.find((id) => id.startsWith(`${L.key}/`));
    if (!scopeId) continue;
    sections.push({ key: L.key, word: L.word, scopeId, rows: rules.filter((m) => !m.locked && m.scopeId === scopeId).sort(byTitle) });
  }
  const shown = v.filter || only ? sections.filter((s) => s.rows.length) : sections;
  const items = [];
  for (const s of shown) {
    items.push({ type: "head", s });
    if (!v.collapsed[s.key]) for (const m of s.rows) items.push({ type: "row", m, s });
  }
  return { sections: shown, items, total: rules.length };
}

export default {
  id: "rules",
  title: "Rules",
  count: (state) => (state.memories ?? []).filter((m) => m.status === "active" && m.kind !== "owner").length || null,
  keys: (state) =>
    view(state).filtering
      ? [["enter", "done"], ["esc", "clear"]]
      : [["/", "filter"], ["j/k", "move"], ["enter", "open"], ["p", "persona"]],

  render(state, ctx) {
    const th = ctx.theme;
    const { t } = th;
    const w = ctx.width;
    const v = view(state);
    const { items, total } = model(state, ctx);
    v.index = Math.max(0, Math.min(v.index, items.length - 1));

    // filter line
    const top = [];
    const caret = v.filtering ? t.blue("▏") : "";
    const filterText = v.filter ? t.text(v.filter) + caret : v.filtering ? caret + t.faint("type to filter by title, @owner or #scope") : t.faint("/ filter");
    const lead = v.filtering ? t.blue(" / ") : t.faint("   ");
    const right = v.file ? `${t.muted("rules for ")}${t.blueText(v.file)}${t.faint("  esc all rules")} ` : t.faint(`${total} rules `);
    top.push(th.spread(`${lead}${filterText}`, right, w));
    top.push("");

    // lines, remembering which line each item starts on (for scrolling)
    const lines = [];
    let selLine = 0;
    items.forEach((it, i) => {
      const sel = i === v.index;
      if (it.type === "head") {
        const s = it.s;
        if (lines.length) lines.push("");
        if (sel) selLine = lines.length;
        const caretCh = v.collapsed[s.key] ? "▸" : "▾";
        const word = s.key === "locked" ? th.label("locked", s.word) : th.bold(t.muted(s.word));
        const chip = s.scopeId ? " " + th.scopeChip(s.scopeId) : "";
        const n = t.faint(` ${s.rows.length}`);
        const bar = sel ? t.blue("▌") : " ";
        lines.push(th.clip(`${bar}${t.faint(caretCh)} ${word}${chip}${n}`, w));
        return;
      }
      const m = it.m;
      if (sel) selLine = lines.length;
      const bar = sel ? t.blue("▌") : m.locked ? t.locked("│") : m.kind === "owner" || m.kind === "fact" ? " " : t.lesson("│");
      const dot = isNew(m, ctx.now) ? t.ok("●") + " " : "  ";
      const title = th.rich(th.plain(m.title), { locked: m.locked, base: sel ? (s) => th.bold(t.text(s)) : t.text });
      const who = ownerHandle(m);
      const owner = who && !String(who).startsWith("agent") ? th.handleChip(who) : t.muted("an agent");
      const tag = m.locked ? " " + th.bold(t.locked("locked")) : "";
      lines.push(th.spread(`${bar} ${dot}${title}`, `${owner}${tag} `, w));
    });
    if (!items.length) lines.push(t.muted(v.filter ? `   No rules match "${v.filter}".` : "   No team rules yet."));

    // keep the selection in view
    const room = Math.max(3, ctx.height - top.length);
    const start = Math.max(0, Math.min(selLine - Math.floor(room / 3), lines.length - room));
    return [...top, ...lines.slice(start, start + room)];
  },

  onKey(key, state, ctx) {
    const v = view(state);
    if (v.filtering) {
      if (key.name === "escape") Object.assign(v, { filter: "", filtering: false, index: 0 });
      else if (key.name === "return" || key.name === "enter" || key.name === "down") v.filtering = false;
      else if (key.name === "backspace") v.filter = v.filter.slice(0, -1);
      else if (key.ctrl && key.name === "u") v.filter = "";
      else if (key.ch && !key.ctrl && !key.meta && key.ch >= " " && key.ch !== "\x7f") (v.filter += key.ch), (v.index = 0);
      return true; // the filter owns the keyboard (so t / q / 1-4 type into it)
    }
    const { items } = model(state, ctx);
    const it = items[v.index];
    if (key.ch === "/") return (v.filtering = true), true;
    if (key.name === "j" || key.name === "down") return (v.index = Math.min(items.length - 1, v.index + 1)), true;
    if (key.name === "k" || key.name === "up") return (v.index = Math.max(0, v.index - 1)), true;
    if (key.ch === "g") return (v.index = 0), true;
    if (key.ch === "G") return (v.index = items.length - 1), true;
    if (key.name === "p") return switchPersona(state, ctx), true;
    if ((key.name === "return" || key.name === "enter" || key.name === "space") && it) {
      if (it.type === "head") v.collapsed[it.s.key] = !v.collapsed[it.s.key];
      else ctx.actions.openDetail(it.m.id);
      return true;
    }
    if (key.name === "escape" && (v.filter || v.file)) return Object.assign(v, { filter: "", file: null, index: 0 }), true;
    return false;
  },
};
