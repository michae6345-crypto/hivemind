// Rules (owner: I), public/brand/terminal/terminal-spec.md "Rules": LOCKED first in its own section, then
// ORG › TEAM › REPO › YOU. Two-line rows: ▎ + title (code tokens underlined), then scope chip, owner chip, age.
// Selected = blue wash + chrome ▎. A green "new" dot marks rules approved in the last 10 minutes.
// Keys: j/k move · enter opens (or folds a section) · / filters · p switches persona. `?` from the shell sets
// state.view.rules.file to show only the rules for the file that last changed.
import { age, allMemories, atoms, C, isNew, ownerHandle, switchPersona } from "./rulekit.mjs";

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

/** Sections and the flat, selectable item list (section heads + rows). */
function model(state, ctx) {
  const v = view(state);
  const mine = `personal/${state.actor}`;
  const chain = state.chain ?? [];
  const only = v.file ? forFile(v.file, state) : null;
  const symbolsById = new Map((state.rules ?? []).map((r) => [r.id, r.symbols]));
  const rules = allMemories(state, ctx)
    .filter((m) => m.status === "active" && (chain.includes(m.scopeId) || m.scopeId === mine) && matches(m, v.filter) && (!only || only.has(m.id)))
    .map((m) => ({ ...m, symbols: symbolsById.get(m.id) ?? m.symbols }));
  const order = (a, b) => isNew(b, ctx.now) - isNew(a, ctx.now) || a.title.localeCompare(b.title);
  const sections = [{ key: "locked", word: "LOCKED", scopeId: null, rows: rules.filter((m) => m.locked).sort(order) }];
  for (const L of LAYERS) {
    const scopeId = L.key === "you" ? mine : L.key === "org" ? "org" : chain.find((id) => id.startsWith(`${L.key}/`));
    if (!scopeId) continue;
    sections.push({ key: L.key, word: L.word, scopeId, rows: rules.filter((m) => !m.locked && m.scopeId === scopeId).sort(order) });
  }
  const shown = v.filter || only ? sections.filter((s) => s.rows.length) : sections;
  const items = [];
  for (const s of shown) {
    items.push({ type: "head", s });
    if (!v.collapsed[s.key]) for (const m of s.rows) items.push({ type: "row", m, s });
  }
  return { items, total: rules.length };
}

export default {
  id: "rules",
  title: "Rules",
  // The context pack's count, so the tab matches the agents' "Loaded N team rules" banner.
  count: (state) => state.pack?.rules ?? ((state.memories ?? []).filter((m) => m.status === "active" && m.kind !== "owner").length || null),
  keys: (state) =>
    view(state).filtering ? [["enter", "done"], ["esc", "clear"]] : [["j/k", "move"], ["enter", "open"], ["/", "filter"], ["p", "persona"]],

  render(state, ctx) {
    const th = ctx.theme;
    const { t } = th;
    const w = ctx.width;
    const a = atoms(state, ctx);
    const v = view(state);
    const { items, total } = model(state, ctx);
    // First open: the cursor starts on the first rule, not on the LOCKED header (headers stay selectable to fold).
    if (!v.placed && items.some((x) => x.type === "row")) {
      v.placed = true;
      if (items[v.index]?.type === "head") v.index = items.findIndex((x) => x.type === "row");
    }
    v.index = Math.max(0, Math.min(v.index, items.length - 1));

    const top = [];
    if (v.filtering || v.filter || v.file) {
      const caret = v.filtering ? a.chrome("▏") : "";
      const q = v.filter ? t.text(v.filter) + caret : caret + t.faint(v.filtering ? "filter by title, @owner or #scope" : "");
      const right = v.file ? `${t.faint("rules for ")}${t.text(v.file)}` : t.faint(`${total} match${total === 1 ? "" : "es"}`);
      top.push(th.spread(`${v.filtering ? a.chromeText("/ ") : t.faint("/ ")}${q}`, right, w), "");
    }

    const lines = [];
    let selFrom = 0;
    let selTo = 0;
    items.forEach((it, i) => {
      const sel = i === v.index;
      if (it.type === "head") {
        const s = it.s;
        if (lines.length) lines.push("");
        if (sel) selFrom = lines.length;
        const fold = v.collapsed[s.key] ? t.faint("▸ ") : "";
        const scopeText = s.key === "you" || s.key === "org" || !s.scopeId ? null : `#${s.scopeId}`;
        lines.push(th.rowMark(i) + a.wash(fold + a.section(s.word, s.rows.length, scopeText), sel ? C.selBg : null, w));
        if (sel) selTo = lines.length;
        return;
      }
      const m = it.m;
      const bg = sel ? C.selBg : null;
      const bar = sel ? a.chrome("▎ ") : m.locked ? t.locked("▎ ") : m.kind === "owner" || m.kind === "fact" ? t.faint("▎ ") : t.lesson("▎ ");
      if (sel) selFrom = lines.length;
      lines.push(th.rowMark(i) + a.wash(bar + a.title(m), bg, w));
      const when = m.locked ? t.lockedText("locked ") + t.faint(a.day(m.createdAt)) : t.faint(age(m.createdAt, ctx.now));
      const fresh = isNew(m, ctx.now) ? "  " + a.ok("● new") : "";
      // ages right-aligned and faint, like the Feed (one column of air at the edge)
      lines.push(a.wash(th.spread(`  ${a.scope(m.scopeId)} ${a.handle(ownerHandle(m))}${fresh}`, `${when} `, w), bg, w));
      if (sel) selTo = lines.length;
    });
    if (!items.length && !v.filter) return [...top, ...th.empty({ title: "No team rules yet.", hint: "Correct an agent and approve the lesson; it shows up here.", key: "t", what: "teach a rule", width: w, height: ctx.height - top.length })];
    if (!items.length) lines.push(t.muted(v.filter ? `No rules match "${v.filter}".` : "No team rules yet."), t.faint(v.filter ? "esc clears the filter." : "Correct an agent and approve the lesson."));

    // keep the selection in view
    const room = Math.max(3, ctx.height - top.length);
    let start = 0;
    if (selTo > room) start = Math.min(selFrom - 2, lines.length - room);
    return [...top, ...lines.slice(Math.max(0, start), Math.max(0, start) + room)];
  },

  /** Mouse: items (section heads and rules) in render order. */
  select(i, state) {
    view(state).index = i;
  },
  selected: (state) => view(state).index,
  onKey(key, state, ctx) {
    const v = view(state);
    if (v.filtering) {
      if (key.name === "escape") Object.assign(v, { filter: "", filtering: false, index: 0 });
      else if (key.name === "return" || key.name === "enter" || key.name === "down") v.filtering = false;
      else if (key.name === "backspace") (v.filter = v.filter.slice(0, -1)), (v.index = 0);
      else if (key.ctrl && key.name === "u") v.filter = "";
      else if (key.ch && !key.ctrl && !key.meta && key.ch >= " " && key.ch !== "\x7f") (v.filter += key.ch), (v.index = 0);
      return true; // the filter owns the keyboard, so t / q / 1-4 type into it
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
      else {
        (state.view.detail ??= {}).from = "Rules";
        ctx.actions.openDetail(it.m.id);
      }
      return true;
    }
    if (key.name === "escape" && (v.filter || v.file)) return Object.assign(v, { filter: "", file: null, index: 0 }), true;
    return false;
  },
};
