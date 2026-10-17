// Feed (owner: H). Adrian's terminal-spec.md §4 "Feed row" + shots/feed.png:
//
//   NOW · 3
//   ● @noor     Cursor       edited src/export.ts  just now        handle chip (11 cells), tool faint (13), verb text,
//   ● @alex     Claude Code  edited src/export.ts  2m              object muted, age faint
//   ▎ Heads up: two agents in src/export.ts within 10 minutes     collision: one honey line (▎ bar when it's the file
//                                                                  watch last flagged)
//   EARLIER · 4
//   ● @noor     Claude Code  blocked by a locked rule  21m         "blocked" in locked text
//
// Newest first. NOW = the last 10 minutes. A row that just arrived starts on the selected wash and steps back to the
// background over 3 frames, 100 ms apart (spec §6). ↑↓ move the selection (selected row on the wash); enter opens the
// lesson behind a card. Empty: "No agents working right now." (editor-spec wording).
import { link, linkFile } from "../git.mjs";
const NOW_MS = 10 * 60000;
const EDIT_WINDOW_MS = 30 * 60000; // edits older than this are noise
const WASH = ["#232A45", "#21263A", "#1F222F"]; // selected wash, then two steps back (pre-blended on #1C1C1E)
const CHIP_CELLS = 10; // chips are bare text now: "@michael" / "an agent" + air
const TOOL_CELLS = 13;

/** verb + object for each card kind (data.toCards). */
function words(c) {
  switch (c.kind) {
    case "edit":
      return ["edited", c.file ?? "a file"];
    case "session": {
      const n = String(typeof c.line === "string" ? c.line : "").match(/loaded (\d+)/)?.[1];
      return ["loaded", `${n ? `${n} team rules` : "the team rules"}${c.times > 1 ? ` · ${c.times} sessions` : ""}`];
    }
    case "approved":
      return ["approved", "a lesson"];
    case "rejected":
      return ["rejected", "a lesson"];
    case "blocked":
      return ["blocked", "by a locked rule"];
    case "proposed":
      return ["proposed", "a lesson"];
    case "captured":
    case "correction":
      return ["corrected", "its agent"];
    case "flag":
      return ["broke", "a team rule"];
    case "fix":
      return ["fixed", c.file ?? "a file"];
    default:
      return [c.kind, ""];
  }
}

/** `src/welcome.ts#L2 → lesson proposed "…"`: the file links to the engine's permalink (else ours), the outcome in honey. */
function fixObject(th, c, state, room = Infinity) {
  const label = c.file ? `${c.file}${c.fileLine ? `#L${c.fileLine}` : ""}` : "a file";
  const file = c.url ? link(c.url, th.t.blueText(label)) : c.file ? linkFile(c.file, c.fileLine ?? undefined, undefined, { root: state.workspace?.root, label }) : th.t.muted(label);
  const outcome = c.outcome === "blocked" ? th.t.lockedText(c.outcome) : th.t.lessonText(c.outcome ?? "lesson proposed");
  const head = ` ${file} ${th.t.faint("→")} ${outcome} `;
  const left = room - th.width(head);
  if (left < 10) {
    // Narrow pane: no title, and the short outcome ("proposed", "live", "reinforced") so it isn't cut.
    const short = ` ${file} ${th.t.faint("→")} ${(c.outcome === "blocked" ? th.t.lockedText : th.t.lessonText)(String(c.outcome ?? "").replace(/^lesson /, ""))}`;
    return th.width(head) <= room ? head.trimEnd() : short;
  }
  return head + th.t.muted(th.clip(`"${th.plain(c.memory?.title ?? "")}"`, left));
}

const ago = (iso, now) => {
  const s = (now - Date.parse(iso)) / 1000;
  return s < 45 ? "just now" : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};

/** Paint a whole row on a wash: re-open the background after every inner reset (chips close their own bg). */
function washed(th, line, hex, width) {
  if (!hex) return line;
  const open = th.bg(hex)("\u0000").split("\u0000")[0];
  if (!open) return line; // NO_COLOR
  const padded = th.fit(line, width);
  return open + padded.replace(/\x1b\[49m/g, "\x1b[49m" + open) + "\x1b[49m";
}

/** Cards worth a row. Back-to-back session starts by the same person and tool that loaded the same rules fold into
 * the newest one ("loaded 16 team rules · 4 sessions"), so a busy hour isn't six identical rows (Adrian, watch-v2). */
function visible(state, now) {
  const out = [];
  for (const c of (state.cards ?? []).filter((x) => (x.kind === "edit" ? now - Date.parse(x.at) < EDIT_WINDOW_MS : true))) {
    const prev = out.at(-1);
    if (prev && c.kind === "session" && prev.kind === "session" && prev.actor === c.actor && prev.agent === c.agent && String(prev.line) === String(c.line)) {
      prev.times = (prev.times ?? 1) + 1;
      continue;
    }
    out.push(c.kind === "session" ? { ...c } : c);
  }
  return out;
}

export default {
  id: "feed",
  title: "Feed",
  keys: (state) => (visible(state, Date.now()).some((c) => c.memory) ? [["↑↓", "move"], ["enter", "open"]] : [["↑↓", "move"]]),

  render(state, ctx) {
    const { theme: th, width: w, now } = ctx;
    const cards = visible(state, now).filter((c) => c.kind !== "collision");
    const collisions = (state.cards ?? []).filter((c) => c.kind === "collision" && now - Date.parse(c.at) < NOW_MS);
    if (!cards.length && !collisions.length) {
      return th.empty({ title: "No agents working right now.", hint: "Edits, corrections, approvals and collisions show up here as they happen.", key: "t", what: "teach a rule", width: w, height: ctx.height });
    }
    const sel = Math.min(state.view.feed?.sel ?? -1, cards.length - 1);
    const fresh = cards.some((c) => c.born && now - c.born < WASH.length * 100);
    if (fresh && !th.REDUCED) ctx.actions?.animate?.(WASH.length * 100 + 50);

    const row = (c, i) => {
      const isAgent = th.isBot(c.actor); // agent sessions and the CLI read "an agent", never "@cli"
      const chip = th.handleChip(c.actor); // agents get a neutral chip too
      const pad = " ".repeat(Math.max(0, CHIP_CELLS - th.width(chip)));
      const tool = th.t.faint(` ${th.toolName(c.agent) || (c.kind === "approved" || c.kind === "rejected" ? "Hivemind" : "")}`.padEnd(TOOL_CELLS));
      const [verb, obj] = words(c);
      // A fix has no tool; on a narrow pane its empty tool column goes so the file and outcome fit.
      const toolCell = c.kind === "fix" && !c.agent && w < 80 ? " " : tool;
      const v = c.kind === "blocked" ? th.t.lockedText(verb) : th.t.text(verb);
      // Edits link to the file on GitHub (OSC 8), at the line watch flagged in it if any.
      const flagged = c.kind === "edit" && c.file ? (state.flags?.[c.file] ?? [])[0] : null;
      const object =
        c.kind === "fix"
          ? fixObject(th, c, state, w - th.width(` ${chip}${pad}${toolCell}${v}`) - th.width(`  ${ago(c.at, now)}`))
          : c.kind === "edit" && c.file
            ? ` ${linkFile(c.file, flagged ? flagged.startLine + 1 : undefined, undefined, { root: state.workspace?.root })}`
            : obj
              ? th.t.muted(` ${obj}`)
              : "";
      // The age stays on the row however narrow the pane: when the row doesn't fit, the object is cut, not "just …".
      const head = ` ${chip}${pad}${c.kind === "fix" ? toolCell : tool}${v}${object}`;
      const when = th.t.faint(ago(c.at, now));
      const line = th.spread(head, ` ${when} `, w); // ages right-aligned, faint (one column of air at the edge)
      const age = c.born ? Math.floor((now - c.born) / 100) : Infinity;
      const wash = i === sel ? WASH[0] : age < WASH.length ? WASH[age] : null;
      return washed(th, th.clip(th.rowMark(i) + line, w), wash, w);
    };

    // Collisions: one honey line under the newest edit of that file; ▎ bar when it's the file watch last flagged.
    const headsUp = new Map();
    for (const col of collisions) {
      const f = col.file;
      if (!f || headsUp.has(f)) continue;
      const bar = state.lastFile && (state.lastFile === f || state.lastFile.endsWith(`/${f}`) || f.endsWith(`/${state.lastFile}`)) ? th.fg(th.P.lesson)("▎") : " ";
      headsUp.set(f, th.clip(`${bar}${th.t.lessonText(` Heads up: two agents in ${f} within 10 minutes`)}`, w));
    }

    const out = [];
    const groups = [
      ["NOW", cards.filter((c) => now - Date.parse(c.at) < NOW_MS)],
      ["EARLIER", cards.filter((c) => now - Date.parse(c.at) >= NOW_MS)],
    ];
    let i = 0;
    for (const [name, list] of groups) {
      if (!list.length) {
        if (name === "NOW" && headsUp.size) out.push("", ` ${th.bold(th.t.faint(name))}`, ...headsUp.values());
        continue;
      }
      out.push("", ` ${th.bold(th.t.faint(name))}${th.t.faint(` · ${list.length}`)}`);
      for (const c of list) {
        out.push(row(c, i++));
        const h = c.kind === "edit" && c.file ? headsUp.get(c.file) : null;
        if (h) {
          out.push(h);
          headsUp.delete(c.file);
        }
        if (out.length > ctx.height) break;
      }
      if (name === "NOW") out.push(...headsUp.values()); // collisions whose edits scrolled out of NOW
      if (out.length > ctx.height) break;
    }
    return out;
  },

  /** Mouse: rows are the non-collision cards, in render order. The wheel moves 3 rows a notch. */
  wheelStep: 3,
  select(i, state) {
    (state.view.feed ??= { sel: -1 }).sel = i;
  },
  selected: (state) => state.view.feed?.sel ?? -1,
  /** w / e (why): the selected row's rule; with nothing selected, the newest block or fix. A block explains the locked rule that stopped it. */
  why(state) {
    const list = visible(state, Date.now()).filter((c) => c.kind !== "collision");
    const c = list[state.view.feed?.sel ?? -1] ?? list.find((x) => x.kind === "blocked" || x.kind === "fix");
    if (!c) return null;
    if (c.kind === "blocked") return c.block?.id ?? c.block?.slug ?? c.memory?.id ?? null;
    return c.memory?.id ?? null;
  },
  onKey(key, state, ctx) {
    const list = visible(state, Date.now()).filter((c) => c.kind !== "collision");
    const v = (state.view.feed ??= { sel: -1 });
    if (key.name === "down" || key.ch === "j") return (v.sel = Math.min(list.length - 1, v.sel + 1)), true;
    if (key.name === "up" || key.ch === "k") return (v.sel = Math.max(-1, v.sel - 1)), true;
    if (key.name === "return" && list[v.sel]?.memory) return ctx.actions.openDetail(list[v.sel].memory.id), true;
    return false;
  },
};
