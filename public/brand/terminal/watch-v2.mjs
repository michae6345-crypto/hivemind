#!/usr/bin/env node
// hivemind watch, polish v2: the frames Michael asked for on 17 Oct (header, tab pills, cards, Ctrl+K palette,
// empty states, celebration), drawn with the atoms in tui-reference.mjs so they can be lifted straight into cli/watch.
//
//   node public/brand/terminal/watch-v2.mjs                 # every v2 frame at 46 and 72 columns, in colour
//   node public/brand/terminal/watch-v2.mjs queue --width 46
//   node public/brand/terminal/render-v2.mjs                # watch-v2.html + shots-v2/*.png
//
// Rules of v2 (watch-v2.md has the reasons):
//   1. One header line, always. It loses words, never wraps: org, then role, then the repo shortens.
//   2. Tabs are pills. The active one is a blue pill; a honey dot on Queue means something waits on YOU.
//   3. Lists are dense ▎ rows (2 lines each). Rounded boxes are only for things that float: palette, detail, celebration.
//   4. Every row has the same columns. An unknown tool is "—", an agent gets a neutral ◇ chip, never a gap.
//   5. Status is a pill at the right edge of the title line, so you can scan one column for what needs you.
//   6. Keys are keycaps. The footer shows three, then "? more"; it never cuts a word.
import { C, s, w, fit, toAnsi, toHtml } from "./tui-reference.mjs";

export { toAnsi, toHtml };

// The live seed's cast (b4b0a20).
const PEOPLE = { greg: ["Security", "org"], ben: ["Lead", "team"], kevin: ["Engineer", "repo"], emily: ["Engineer", "repo"] };
const LAYER = { org: C.org, team: C.team, repo: C.repo, you: C.person };
const ORG = "Meridian Data";
const REPO = "export-service";

// ── Atoms ────────────────────────────────────────────────────────────────────
const sp = (n, bg) => s(" ".repeat(Math.max(0, n)), bg ? { bg } : {});
const faint = (t, bg) => s(t, { fg: C.faint, ...(bg ? { bg } : {}) });
const dotSep = (bg) => faint(" · ", bg);

/** ` t ` on the chip background: the keycap. Bold key, faint label after it. */
export const keycap = (k, bg) => s(` ${k} `, { fg: C.text, bg: C.chipBg, bold: true });
const keyHint = (k, label) => [keycap(k), faint(` ${label}`)];

/** `● @ben` chip; an agent is a hollow ◇ in a neutral chip so the column never has a hole. */
export function who(h, bg) {
  if (!h || h === "agent") return [s(" ◇ agent ", { fg: C.muted, bg: C.chipBg })];
  const layer = PEOPLE[h]?.[1] ?? "repo";
  return [s(" ", { bg: C.chipBg }), s("●", { fg: LAYER[layer], bg: C.chipBg }), s(` @${h} `, { fg: C.text, bg: C.chipBg })];
}
export function scope(sc) {
  const layer = sc === "#you" ? "you" : sc.startsWith("#team") ? "team" : sc.startsWith("#repo") ? "repo" : "org";
  return [s(" ", { bg: C.chipBg }), s(layer === "you" ? "○" : "●", { fg: LAYER[layer], bg: C.chipBg }), s(` ${sc} `, { fg: C.text, bg: C.chipBg })];
}

/** Status pill: tinted background, coloured text. Same width family everywhere so the right edge is a column. */
const PILL = {
  you: [C.lessonBg, C.lessonText, "needs you"],
  waiting: [C.chipBg, C.muted, "waiting"],
  live: [C.okBg, C.ok, "live"],
  blocked: [C.lockedBg, C.lockedText, "blocked"],
  locked: [C.lockedBg, C.lockedText, "locked"],
};
export const pill = (kind, text) => s(` ${text ?? PILL[kind][2]} `, { fg: PILL[kind][1], bg: PILL[kind][0], bold: kind === "you" });

/** Left part, gap, right part. If both don't fit, the right part wins and the left truncates with …. */
function lr(left, right, cols, bg) {
  const room = cols - w(right) - 1;
  if (w(left) <= room) return fit([...left, sp(cols - w(left) - w(right), bg), ...right], cols, bg);
  return fit([...fit(left, Math.max(1, room), bg), sp(1, bg), ...right], cols, bg);
}

// ── 1. Header: one line, never wraps ─────────────────────────────────────────
export function header(cols, { as = "kevin" } = {}) {
  const mark = [s("⬢", { fg: C.lesson }), s(" Hivemind", { fg: C.text, bold: true })];
  const role = PEOPLE[as][0];
  const tries = [
    [[...mark, dotSep(), faint(`${ORG} / `), s(REPO, { fg: C.muted })], [...who(as), faint(` ${role}`)]],
    [[...mark, dotSep(), s(REPO, { fg: C.muted })], [...who(as), faint(` ${role}`)]],
    [[...mark, dotSep(), s(REPO, { fg: C.muted })], who(as)],
    [[s("⬢ ", { fg: C.lesson }), s(REPO, { fg: C.muted })], who(as)],
  ];
  for (const [l, r] of tries) if (w(l) + w(r) + 1 <= cols) return [lr(l, r, cols)];
  return [lr(tries.at(-1)[0], tries.at(-1)[1], cols)];
}

// ── 2. Tab pills ─────────────────────────────────────────────────────────────
/** `mine`: how many queue items wait on the viewer (honey dot). Under 44 cols labels shorten to Here R Q F. */
export function pills(cols, active, { rules = 8, waiting = 3, mine = 0 } = {}) {
  const tabsDef = [
    ["Here", ""],
    ["Rules", ` ${rules}`],
    ["Queue", ` ${waiting}`],
    ["Feed", ""],
  ];
  const build = (short) => {
    const row = [];
    for (const [label, count] of tabsDef) {
      const on = label === active;
      const name = short && !on ? label[0] : label;
      if (on) row.push(s(` ${name}${short ? "" : count} `, { fg: C.chromeText, bg: C.selBg, bold: true }));
      else row.push(s(` ${name}`, { fg: C.muted }), faint(short ? " " : `${count} `));
      if (label === "Queue" && mine > 0) row.push(s("●", { fg: C.lesson }));
      row.push(sp(1));
    }
    return row;
  };
  const full = build(false);
  const row = w(full) <= cols ? full : build(true);
  return [fit(row, cols), fit([s("─".repeat(cols), { fg: C.hair })], cols)];
}

// ── 3. Footer: keycaps, folds instead of cutting ─────────────────────────────
export function footer(cols, keys) {
  const out = [];
  const more = keyHint("?", "more");
  for (const [k, label] of keys) {
    const next = [...out, ...(out.length ? [sp(2)] : []), ...keyHint(k, label)];
    if (w(next) + w(more) + 2 > cols) break;
    out.push(...(out.length ? [sp(2)] : []), ...keyHint(k, label));
  }
  return [fit([s("─".repeat(cols), { fg: C.hair })], cols), lr(out, more, cols)];
}

// ── 4. Rows and cards ────────────────────────────────────────────────────────
/** A dense row: ▎ title ………… [pill] / ▎ scope · who · age. Selected = blue wash and a chrome ▎ (Cursor-style). */
export function row(cols, { bar = C.lesson, title, pillKind, pillText, meta = [], selected = false, detail = [] }) {
  const bg = selected ? C.selBg : undefined;
  const mark = s("▎ ", { fg: selected ? C.chrome : bar, bg });
  const t = s(title, { fg: C.text, bold: true, bg });
  const right = pillKind ? [pill(pillKind, pillText)] : [];
  const lines = [lr([mark, t], right, cols, bg), fit([s("▎ ", { fg: selected ? C.chrome : bar, bg }), ...meta.map((x) => ({ ...x, bg: x.bg ?? bg }))], cols, bg)];
  for (const d of detail) lines.push(fit([s("▎ ", { fg: C.chrome, bg }), ...d.map((x) => ({ ...x, bg: x.bg ?? bg }))], cols, bg));
  return lines;
}

/** A rounded card, for things that float over the list. Border in hairline grey, or chrome when focused. */
export function box(cols, body, { title, focus = false, bg = "#202024" } = {}) {
  const b = focus ? C.chrome : "#3A3A40";
  const inner = cols - 4;
  const top = title
    ? [s("╭─ ", { fg: b }), s(title, { fg: C.muted, bold: true }), s(` ${"─".repeat(Math.max(0, cols - 6 - [...title].length))}╮`, { fg: b })]
    : [s(`╭${"─".repeat(cols - 2)}╮`, { fg: b })];
  return [
    fit(top, cols),
    ...body.map((l) => fit([s("│ ", { fg: b, bg }), ...fit(l, inner, bg), s(" │", { fg: b, bg })], cols)),
    fit([s(`╰${"─".repeat(cols - 2)}╯`, { fg: b })], cols),
  ];
}

/** The first `n` cells of a line, padded, no ellipsis (for drawing something over a line). */
function cut(line, n) {
  const out = [];
  let used = 0;
  for (const x of line) {
    const ch = [...x.t];
    if (used >= n) break;
    const take = ch.slice(0, n - used);
    out.push({ ...x, t: take.join("") });
    used += take.length;
  }
  if (used < n) out.push(sp(n - used));
  return out;
}

const section = (cols, label, n, color = C.faint) => fit([s(label, { fg: color, bold: true }), dotSep(), faint(String(n))], cols);

// ── Screens ──────────────────────────────────────────────────────────────────
/** Queue as the lead (@ben): what needs you first, then what waits on others, then live as one folded line. */
export function queue(cols, { as = "ben", rows = 26 } = {}) {
  const lead = as === "ben";
  const narrow = cols < 56;
  const from = (h, age) => (narrow ? [sp(1), ...who(h), faint(` ${age}`)] : [faint(" from "), ...who(h), faint(` · ${age}`)]);
  // The quote wraps on words inside the row instead of truncating.
  const quote = (text) => {
    const lines = [];
    let cur = "";
    for (const word of text.split(" ")) {
      if (cur && cur.length + 1 + word.length > cols - 3) (lines.push([s(cur, { fg: C.muted })]), (cur = word));
      else cur = cur ? `${cur} ${word}` : word;
    }
    if (cur) lines.push([s(cur, { fg: C.muted })]);
    return lines;
  };
  const out = [...header(cols, { as }), ...pills(cols, "Queue", { waiting: 3, mine: lead ? 2 : 0 })];
  if (lead) {
    out.push(section(cols, "NEEDS YOU", 2, C.lessonText));
    out.push(
      ...row(cols, {
        title: "Every export calls assertSingleCustomer()",
        pillKind: "you",
        selected: true,
        meta: [...scope("#team/data-pipelines"), ...from("kevin", "12m")],
        detail: [
          ...quote('"exports must call assertSingleCustomer() before writing"'),
          [s("no conflict with the 2 locked rules", { fg: C.ok })],
          [...keyHint("a", "approve"), sp(2), ...keyHint("r", "reject"), sp(2), ...keyHint("e", "edit")],
        ],
      }),
      [],
    );
    out.push(
      ...row(cols, { title: "Retries back off exponentially, max 5", pillKind: "you", meta: [...scope("#team/data-pipelines"), ...from("emily", "1h")] }),
      [],
    );
  }
  out.push(section(cols, lead ? "WAITING ON OTHERS" : "YOURS, WAITING", 1));
  out.push(
    ...row(cols, {
      title: "Log the expert's email when a payout fails",
      bar: C.locked,
      pillKind: "blocked",
      meta: narrow ? [faint("locked rule · only "), ...who("greg"), faint(" can clear")] : [faint("breaks a locked rule · only "), ...who("greg"), faint(" can clear it")],
    }),
    [],
  );
  out.push(fit([s("● ", { fg: C.ok }), s("4 live", { fg: C.text }), faint(" in every agent's context · "), keycap("l"), faint(" show")], cols));
  while (out.length < rows - 2) out.push([]);
  return [...out, ...footer(cols, lead ? [["a", "approve"], ["↑↓", "move"], ["⌃K", "search"], ["t", "teach"]] : [["↑↓", "move"], ["⌃K", "search"], ["t", "teach"]])];
}

/** Feed: fixed columns (time · who · tool · what), so nothing is ragged. A collision is one honey line, indented. */
export function feed(cols, { rows = 26, as = "emily" } = {}) {
  const narrow = cols < 60;
  const out = [...header(cols, { as }), ...pills(cols, "Feed"), section(cols, "NOW", 3)];
  const WHO = 10; // widest chip: ` ● @kevin ` = 10
  const TOOL = narrow ? 0 : 13;
  const ev = (time, h, tool, what, opts = {}) => {
    const chip = who(h);
    const cells = [faint(time.padEnd(6)), ...chip, sp(WHO - w(chip) + 1)];
    if (TOOL) cells.push(s((tool || "—").padEnd(TOOL), { fg: tool ? C.muted : C.hair }));
    return fit([...cells, ...what], cols, opts.bg);
  };
  out.push(ev("now", "emily", "Claude Code", [s("edited ", { fg: C.muted }), s("src/payouts.ts", { fg: C.text })], { bg: C.selBg }));
  out.push(fit([sp(6 + WHO + 1 + TOOL), s("↳ also open in ", { fg: C.lessonText }), ...who("kevin"), s(" 2m ago", { fg: C.lessonText })], cols));
  out.push(ev("1m", "agent", "", [s("blocked ", { fg: C.lockedText }), s("console.log(expert.email)", { fg: C.text })]));
  out.push(ev("3m", "kevin", "Cursor", [s("taught ", { fg: C.muted }), s("Retries back off…", { fg: C.text })]));
  out.push([], section(cols, "EARLIER", 4));
  out.push(ev("12m", "ben", "", [s("approved ", { fg: C.ok }), s("assertSingleCustomer()", { fg: C.text })]));
  out.push(ev("40m", "agent", "Codex", [s("read 8 rules at session start", { fg: C.muted })]));
  out.push(ev("1h", "greg", "", [s("locked ", { fg: C.lockedText }), s("Never log expert info", { fg: C.text })]));
  out.push(ev("2h", "emily", "Gemini CLI", [s("edited ", { fg: C.muted }), s("src/export.ts", { fg: C.text })]));
  while (out.length < rows - 2) out.push([]);
  return [...out, ...footer(cols, [["enter", "open"], ["w", "why"], ["⌃K", "search"], ["t", "teach"]])];
}

/** Empty states: the hex mark, one sentence that says what will show up here, one keycap. Centred in the pane. */
const EMPTY = {
  Here: ["Nothing breaks a rule here", "Save a file and its rules show up.", ["t", "teach a rule"]],
  Queue: ["Nothing waits on you", "Lessons you or your agents propose land here.", ["t", "teach one"]],
  Feed: ["No agents working right now", "Edits, fixes and approvals show up live.", ["⌃K", "search rules"]],
};
export function empty(cols, tab, { rows = 20, as = "emily" } = {}) {
  const [head, body, [k, label]] = EMPTY[tab];
  const out = [...header(cols, { as }), ...pills(cols, tab, { waiting: 0 })];
  const block = [
    [s("⬡", { fg: C.faint })],
    [],
    [s(head, { fg: C.text, bold: true })],
    [s(body, { fg: C.faint })],
    [],
    keyHint(k, label),
  ];
  const top = Math.max(1, Math.floor((rows - 2 - out.length - block.length) / 2));
  for (let i = 0; i < top; i++) out.push([]);
  for (const l of block) {
    const width = w(l);
    if (width > cols - 2) {
      // too wide for the pane: wrap the sentence on words, centred line by line
      let cur = "";
      for (const word of l.map((x) => x.t).join("").split(" ")) {
        if (cur && cur.length + 1 + word.length > cols - 4) {
          out.push(fit([sp(Math.floor((cols - cur.length) / 2)), s(cur, { fg: l[0].fg })], cols));
          cur = word;
        } else cur = cur ? `${cur} ${word}` : word;
      }
      if (cur) out.push(fit([sp(Math.floor((cols - cur.length) / 2)), s(cur, { fg: l[0].fg })], cols));
    } else out.push(fit([sp(Math.floor((cols - width) / 2)), ...l], cols));
  }
  while (out.length < rows - 2) out.push([]);
  return [...out, ...footer(cols, [["⌃K", "search"], ["t", "teach"], ["tab", "next"]])];
}

/** Ctrl+K palette: floats over the current tab (dimmed underneath). Grouped results, keycaps on the right. */
export function palette(cols, { rows = 26, typed = "appr" } = {}) {
  const under = queue(cols, { rows }).map((l) => l.map((x) => ({ ...x, fg: x.fg ? "#4A4A50" : "#4A4A50", bg: x.bg ? "#1F1F22" : undefined, bold: false })));
  const pw = Math.min(cols - 2, 58);
  const inner = pw - 4;
  const item = (icon, iconFg, label, right, sel = false) => {
    const bg = sel ? C.selBg : "#202024";
    return lr([s(`${icon} `, { fg: iconFg, bg }), s(label, { fg: sel ? C.text : C.muted, bold: sel, bg })], right, inner, bg);
  };
  const grp = (t) => [s(t, { fg: C.faint, bold: true })];
  const body = [
    [s("› ", { fg: C.chromeText, bold: true }), s(typed, { fg: C.text }), s("▍", { fg: C.chrome })],
    [s("─".repeat(inner), { fg: "#3A3A40" })],
    grp("WAITING ON YOU"),
    item("▎", C.lesson, "Approve: every export calls assertSingle…", [keycap("a")], true),
    item("▎", C.lesson, "Approve: retries back off exponentially", [keycap("a")]),
    [],
    grp("COMMANDS"),
    item("›", C.chromeText, "Approve all from @kevin", []),
    item("›", C.chromeText, "Show approved this week", [keycap("l")]),
    [],
    grp("PEOPLE"),
    item("●", C.team, "View as @ben (Lead)", [keycap("p")]),
    [],
    [s("enter", { fg: C.text, bold: true }), faint(" run   "), s("↑↓", { fg: C.text, bold: true }), faint(" move   "), s("esc", { fg: C.text, bold: true }), faint(" close")],
  ];
  const card = box(pw, body, { focus: true });
  const left = Math.floor((cols - pw) / 2);
  const top = 3;
  const out = under.slice();
  card.forEach((l, i) => {
    const base = out[top + i] ?? [];
    out[top + i] = fit([...cut(base, left), ...l, sp(cols - left - pw)], cols);
  });
  return out;
}

/** Celebration v2: the proposer's Here tab. A green card with the hex fill, who approved, and what it means now. */
export function celebrate(cols, frame = 99, { rows = 20 } = {}) {
  const cells = [
    [1, 0], [3, 0], [0, 1], [2, 1], [4, 1], [1, 2], [3, 2],
  ];
  const lit = Math.min(cells.length, frame);
  const done = frame >= cells.length;
  const grid = [0, 1, 2].map((y) => {
    const r = [];
    for (let x = 0; x < 5; x++) {
      const idx = cells.findIndex(([cx, cy]) => cx === x && cy === y);
      r.push(idx < 0 ? s("  ", { bg: C.okBg }) : s("⬢ ", { fg: idx < lit ? C.lesson : "#2F4A3B", bg: C.okBg }));
    }
    return r;
  });
  const n = done ? 9 : 8;
  const out = [...header(cols, { as: "kevin" }), ...pills(cols, "Here", { rules: n, waiting: 2 }), []];
  const bg = C.okBg;
  const text = [
    [s("Your lesson is live", { fg: C.text, bold: true, bg })],
    done ? [...who("ben"), s(" approved it · just now", { fg: C.ok, bg })] : [],
    [s("Every agent on #team/data-pipelines", { fg: C.muted, bg })],
  ];
  const narrow = cols < 60;
  const band = (l) => fit([s("  "), ...fit([s(" ", { bg }), ...l], cols - 4, bg), sp(2)], cols);
  if (narrow) {
    for (let i = 0; i < 3; i++) out.push(band(grid[i]));
    out.push(band([]));
    if (done) for (const t of text) out.push(band(t));
  } else for (let i = 0; i < 3; i++) out.push(band([...grid[i], sp(2, bg), ...(done ? text[i] : [])]));
  out.push(band([]));
  out.push(band([s("Every export calls ", { fg: C.text, bold: true, bg }), s("assertSingleCustomer()", { fg: C.lessonText, ul: true, bg })]));
  out.push(band([s("Rules for this repo ", { fg: C.faint, bg }), s(`${n - 1} → ${n}`, { fg: done ? C.ok : C.text, bold: true, bg })]));
  out.push(band([]));
  while (out.length < rows - 2) out.push([]);
  return [...out, ...footer(cols, [["enter", "see the rule"], ["w", "why"], ["esc", "back"]])];
}

/** The left pane after `hivemind open`: one short line that fits a 40-column pane, so it never wraps mid-word. */
export function openedLine(cols) {
  const full = [s("⬢ ", { fg: C.lesson }), s("Hivemind is watching →", { fg: C.text }), faint(" @emily on export-service")];
  return [w(full) <= cols ? fit(full, cols) : fit([s("⬢ ", { fg: C.lesson }), s("Hivemind is watching →", { fg: C.text })], cols)];
}

export const FRAMES = {
  header: (c) => [...header(c, { as: "ben" }), ...pills(c, "Queue", { mine: 2 })],
  queue: (c) => queue(c),
  "queue-eng": (c) => queue(c, { as: "kevin" }),
  feed: (c) => feed(c),
  palette: (c) => palette(c),
  "empty-feed": (c) => empty(c, "Feed"),
  "empty-queue": (c) => empty(c, "Queue", { as: "kevin" }),
  celebrate: (c) => celebrate(c),
  opened: (c) => openedLine(c),
};

// CLI: print frames to the terminal.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const args = process.argv.slice(2);
  const wi = args.indexOf("--width");
  const widths = wi >= 0 ? [Number(args[wi + 1])] : [46, 72];
  const names = args.filter((a, i) => !a.startsWith("--") && (wi < 0 || i !== wi + 1));
  for (const name of names.length ? names : Object.keys(FRAMES))
    for (const c of widths) console.log(`\n── ${name} @ ${c} cols ──\n${toAnsi(FRAMES[name](c))}`);
}
