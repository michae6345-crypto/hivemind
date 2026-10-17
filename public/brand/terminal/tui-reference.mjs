#!/usr/bin/env node
// hivemind watch: reference renderer for the terminal UI (Adrian's terminal spec, 17 Oct 2026).
//
// Zero dependencies. Every screen in terminal-spec.md comes out of this file, and so do terminal-mock.html, the PNGs
// in shots/ and the website's "In your terminal" section (screens.json). Copy the pieces you need into cli/.
//
//   node public/brand/terminal/tui-reference.mjs                 # every screen at 64 columns
//   node public/brand/terminal/tui-reference.mjs queue --width 48
//   node public/brand/terminal/tui-reference.mjs celebrate --animate   # plays the 1.6 s celebration in place
//   node public/brand/terminal/tui-reference.mjs approve --animate     # plays the approve flash + collapse
//   NO_COLOR=1 node public/brand/terminal/tui-reference.mjs here       # plain text
//
// The model: a screen is an array of lines, a line is an array of segments { t, fg, bg, bold, ul }. Nothing nests,
// so there are no stray resets, and the same lines serialise to ANSI (toAnsi) or HTML (toHtml).

// ── Colour ───────────────────────────────────────────────────────────────────
// Meaning: blue is Hivemind's own chrome, rose is a locked rule, honey is a lesson, green is approved. Nothing else
// carries colour. Tints are pre-blended onto #1C1C1E (the site's --window) because a terminal can't do alpha and
// can't be relied on to report its background.
export const C = {
  text: "#E4E4E7",
  muted: "#A1A1AA",
  faint: "#71717A",
  hair: "#2E2E32", // hairlines / dividers
  chrome: "#4C6EF5", // active tab bar, selected marker, focus
  chromeText: "#91A7FF", // links, key hints' keys
  locked: "#E5484D",
  lockedText: "#FF9592",
  lesson: "#F5A524",
  lessonText: "#F5C26B",
  ok: "#3DD68C",
  team: "#8B93FF",
  repo: "#2DD4BF",
  org: "#E4E4E7",
  person: "#A1A1AA",
  // pre-blended washes (on #1C1C1E)
  chipBg: "#2A2A2E",
  selBg: "#232A45", // chrome blue at ~14%
  lockedBg: "#3A2023", // locked at ~16%
  lessonBg: "#3A2F1D", // lesson at ~13%
  okBg: "#1D3A2B",
  codeBg: "#232326",
};

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** "truecolor" | "256" | "none": NO_COLOR and pipes get plain text; COLORTERM decides 24-bit vs the 256 palette. */
export function detectColor(env = process.env, tty = process.stdout.isTTY) {
  if (env.NO_COLOR) return "none";
  if (!tty && !env.FORCE_COLOR) return "none";
  const ct = (env.COLORTERM || "").toLowerCase();
  if (ct.includes("truecolor") || ct.includes("24bit") || env.WT_SESSION || ["iTerm.app", "vscode", "WezTerm", "ghostty"].includes(env.TERM_PROGRAM))
    return "truecolor";
  return "256";
}

/** Nearest xterm-256 index (colour cube or grey ramp, whichever is closer). */
export function to256(hex) {
  const [r, g, b] = rgb(hex);
  const lv = [0, 95, 135, 175, 215, 255];
  const q = (v) => lv.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(lv[bi] - v) ? i : bi), 0);
  const [qr, qg, qb] = [q(r), q(g), q(b)];
  const cube = 16 + 36 * qr + 6 * qg + qb;
  const dc = (lv[qr] - r) ** 2 + (lv[qg] - g) ** 2 + (lv[qb] - b) ** 2;
  const gi = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10)));
  const gv = 8 + gi * 10;
  const dg = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2;
  return dg < dc ? 232 + gi : cube;
}

// ── Segments ─────────────────────────────────────────────────────────────────
/** @typedef {{ t: string, fg?: string, bg?: string, bold?: boolean, ul?: boolean }} Seg */
export const s = (t, style = {}) => ({ t, ...style });

/** Display width: every glyph used here (⬢ ● ○ │ ╭ ─ ‹ › · …) is one cell. Replace with a wcwidth if you add CJK. */
export const w = (line) => line.reduce((n, x) => n + [...x.t].length, 0);

/** Pads a line to `cols` (filling with `bg` when given), or truncates it with … at a segment boundary. */
export function fit(line, cols, bg) {
  const out = [];
  let used = 0;
  for (const x of line) {
    const chars = [...x.t];
    if (used + chars.length <= cols) {
      out.push(x);
      used += chars.length;
      continue;
    }
    const room = cols - used;
    if (room > 0) out.push({ ...x, t: chars.slice(0, Math.max(0, room - 1)).join("") + "…" });
    used = cols;
    break;
  }
  if (used < cols) out.push(s(" ".repeat(cols - used), bg ? { bg } : {}));
  return bg ? out.map((x) => (x.bg ? x : { ...x, bg })) : out;
}

const right = (left, rightPart, cols, bg) => {
  const gap = cols - w(left) - w(rightPart);
  return gap >= 1 ? fit([...left, s(" ".repeat(gap)), ...rightPart], cols, bg) : fit(left, cols, bg);
};

export function toAnsi(lines, mode = detectColor()) {
  return lines
    .map((line) =>
      line
        .map((x) => {
          if (mode === "none") return x.t;
          const codes = [];
          if (x.bold) codes.push(1);
          if (x.ul) codes.push(4);
          if (x.fg) codes.push(mode === "truecolor" ? `38;2;${rgb(x.fg).join(";")}` : `38;5;${to256(x.fg)}`);
          if (x.bg) codes.push(mode === "truecolor" ? `48;2;${rgb(x.bg).join(";")}` : `48;5;${to256(x.bg)}`);
          return codes.length ? `\x1b[${codes.join(";")}m${x.t}\x1b[0m` : x.t;
        })
        .join("")
        .trimEnd(),
    )
    .join("\n");
}

const esc = (t) =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Browsers draw these from fallback fonts at their own widths; pin each to one cell so the grid holds.
    .replace(/[⬢●○▎⏺⎿‹›…▍✻]/g, (g) => `<span class="g">${g}</span>`);
export function toHtml(lines) {
  return lines
    .map(
      (line) =>
        `<div class="ln">${line
          .map((x) => {
            const st = [x.fg && `color:${x.fg}`, x.bg && `background:${x.bg}`, x.bold && "font-weight:700", x.ul && "text-decoration:underline;text-underline-offset:3px"]
              .filter(Boolean)
              .join(";");
            return st ? `<span style="${st}">${esc(x.t)}</span>` : esc(x.t);
          })
          .join("")}</div>`,
    )
    .join("");
}

// ── The demo world (the live DB's seed: npm run reset) ───────────────────────
export const WORLD = {
  org: "Meridian Data",
  repo: "export-service",
  me: { handle: "alex", role: "Engineer" },
  people: { maya: "Security", jordan: "Lead · data-pipelines", alex: "Engineer", noor: "Engineer" },
};

/** Swap the handles (the website uses its own demo names). */
export function withNames(map) {
  const sub = (t) => t.replace(/@(maya|jordan|alex|noor)\b/g, (_, h) => `@${map[h] ?? h}`);
  return (lines) => lines.map((line) => line.map((x) => ({ ...x, t: sub(x.t) })));
}

// ── Atoms ────────────────────────────────────────────────────────────────────
const LAYER = { org: C.org, team: C.team, repo: C.repo, you: C.person };

/** `● #repo/export-service` on a chip background; personal scope gets a hollow ring. */
export const scopeChip = (scope) => {
  const layer = scope === "#you" ? "you" : scope.startsWith("#team") ? "team" : scope.startsWith("#repo") ? "repo" : "org";
  return [s(" ", { bg: C.chipBg }), s(layer === "you" ? "○" : "●", { fg: LAYER[layer], bg: C.chipBg }), s(` ${scope} `, { fg: C.text, bg: C.chipBg })];
};
/** `@jordan` as a chip: the dot is the person's layer (Security = org, a lead = team, an engineer = repo). */
export const handleChip = (h, { pos = false } = {}) => {
  const layer = h === "maya" ? "org" : h === "jordan" ? "team" : "repo";
  return [s(" ", { bg: C.chipBg }), s("●", { fg: LAYER[layer], bg: C.chipBg }), s(` @${h}${pos ? "'s" : ""} `, { fg: C.text, bg: C.chipBg })];
};

/** Word-wraps plain text into lines of `cols`, each starting with `indent` spaces. */
export function wrap(text, cols, style = {}, indent = 2) {
  const out = [];
  let cur = "";
  for (const word of text.split(" ")) {
    if (cur && indent + cur.length + 1 + word.length > cols) {
      out.push(fit([s(" ".repeat(indent), style.bg ? { bg: style.bg } : {}), s(cur, style)], cols, style.bg));
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) out.push(fit([s(" ".repeat(indent), style.bg ? { bg: style.bg } : {}), s(cur, style)], cols, style.bg));
  return out;
}
/** `LOCKED RULE` / `TEAM LESSON`: caps, bold, in the meaning colour. */
export const kind = (k) => s(k, { fg: k.includes("LOCKED") ? C.lockedText : k.startsWith("APPROVED") ? C.ok : C.lessonText, bold: true });
const sep = () => s(" · ", { fg: C.faint });
const key = (k, label) => [s(k, { fg: C.chromeText, bold: true }), s(` ${label}`, { fg: C.faint })];
const hints = (pairs) => pairs.flatMap(([k, l], i) => [...(i ? [s("   ")] : []), ...key(k, l)]);

/** A title with `code` tokens underlined in the rule's colour, so rule and code read as linked. */
function title(t, color, extra = {}) {
  return t.split(/(`[^`]+`)/).filter(Boolean).map((part) =>
    part.startsWith("`") ? s(part.slice(1, -1), { fg: color, ul: true, ...extra }) : s(part, { fg: C.text, bold: true, ...extra }),
  );
}

// ── Chrome: header, tabs, footer ─────────────────────────────────────────────
const ROLE = { maya: "Security", jordan: "Lead", alex: "Engineer", noor: "Engineer" };
/** `as`: whose watch this is (the queue's lead view is @jordan's screen, not @alex's). */
export function header(cols, { rules = 10, waiting = 2, as = WORLD.me.handle } = {}) {
  const left = [s("⬢", { fg: C.lesson }), s(" Hivemind", { fg: C.text, bold: true }), sep(), s(`${WORLD.org} / ${WORLD.repo}`, { fg: C.muted })];
  const me = [...handleChip(as), s(` ${ROLE[as] ?? WORLD.me.role}`, { fg: C.faint })];
  if (w(left) + w(me) + 2 <= cols) return [right(left, me, cols)];
  const short = [left[0], left[1], sep(), s(WORLD.repo, { fg: C.muted })]; // narrower: the repo alone
  if (w(short) + w(me) + 2 <= cols) return [right(short, me, cols)];
  return [fit(short, cols), fit([s("  "), ...me], cols)]; // narrowest: who you are drops to its own line
}

const TABS = [
  ["Here", null],
  ["Rules", "rules"],
  ["Queue", "waiting"],
  ["Feed", null],
];
/** Labels, then a hairline with a heavy chrome-blue segment under the active tab (it jumps; it doesn't slide). */
export function tabs(cols, active, counts = { rules: 10, waiting: 2 }) {
  const narrow = cols < 50;
  const row = [];
  const bar = [];
  for (const [label, countKey] of TABS) {
    const on = label === active;
    const text = narrow ? ` ${label[0]} ` : ` ${label}${countKey ? ` ${counts[countKey]}` : ""} `;
    const n = [...text].length;
    row.push(s(text, { fg: on ? C.text : C.faint, bold: on }), s(" "));
    bar.push(s((on ? "━" : "─").repeat(n), { fg: on ? C.chrome : C.hair }), s("─", { fg: C.hair }));
  }
  return [fit(row, cols), fit([...bar, s("─".repeat(Math.max(0, cols - w(bar))), { fg: C.hair })], cols)];
}

export function footer(cols, pairs) {
  return [fit([s("─".repeat(cols), { fg: C.hair })], cols), fit(hints(pairs), cols)];
}

// ── Pieces ───────────────────────────────────────────────────────────────────
/** A rule row: a ▎ left rule in its colour, the title, then scope · owner · age. Selected = blue wash + chrome ▎. */
export function ruleRow(cols, r, { selected = false } = {}) {
  const color = r.locked ? C.locked : C.lesson;
  const bg = selected ? C.selBg : undefined;
  const bar = s("▎ ", { fg: selected ? C.chrome : color, bg });
  const meta = [s("  ", { bg }), ...scopeChip(r.scope), s(" ", { bg }), ...handleChip(r.owner), s(`  ${r.ago}`, { fg: C.faint, bg })];
  return [fit([bar, ...title(r.title, r.locked ? C.lockedText : C.lessonText, bg ? { bg } : {})], cols, bg), fit(meta, cols, bg)];
}

/** A section label: `LOCKED · 2` / `TEAM · #team/data-pipelines · 3`. */
export const section = (cols, label, n, scope) =>
  fit([s(label, { fg: C.faint, bold: true }), ...(scope ? [sep(), s(scope, { fg: C.faint })] : []), sep(), s(String(n), { fg: C.faint })], cols);

/** The code frame (same anatomy as `hivemind check`): gutter, two lines of context, ~~~~ under the exact columns. */
export function codeFrame(cols, { file, line, col, src, len, note, locked }) {
  const color = locked ? C.lockedText : C.lessonText;
  const g = (t) => s(t, { fg: C.faint });
  const out = [fit([g("   ╭─["), s(`${file}:${line}:${col}`, { fg: C.muted }), g("]")], cols)];
  src.forEach(([n, code]) => {
    out.push(fit([g(`${String(n).padStart(2)} │ `), s(code, { fg: n === line ? C.text : C.muted })], cols));
    if (n === line) out.push(fit([g("   │ "), s(" ".repeat(col - 1)), s("~".repeat(len), { fg: color }), s(` ${note}`, { fg: color })], cols));
  });
  out.push(fit([g("   ╰─")], cols));
  return out;
}

// ── Screens ──────────────────────────────────────────────────────────────────
const RULES = {
  locked: [
    { title: "Never mix data from different lab customers", scope: "#org", owner: "maya", ago: "14 Oct", locked: true },
    { title: "Never log expert personal info", scope: "#org", owner: "maya", ago: "12 Oct", locked: true },
  ],
  org: [
    { title: "Money and payouts are integer cents", scope: "#org", owner: "jordan", ago: "9d" },
    { title: "Use `logger`, not `console.log`", scope: "#org", owner: "alex", ago: "6d" },
    { title: "Migrations are append-only", scope: "#org", owner: "jordan", ago: "11d" },
  ],
  team: [
    { title: "Tag every row with `lab_customer_id`", scope: "#team/data-pipelines", owner: "jordan", ago: "20d" },
    { title: "Every export calls `assertSingleCustomer()`", scope: "#team/data-pipelines", owner: "alex", ago: "3h" },
  ],
  repo: [
    { title: "Export jobs are idempotent, keyed by `job_id`", scope: "#repo/export-service", owner: "jordan", ago: "8d" },
    { title: "Stream uploads; never buffer a full export", scope: "#repo/export-service", owner: "noor", ago: "4d" },
  ],
  you: [{ title: "Keep my PRs under 300 lines", scope: "#you", owner: "alex", ago: "2d" }],
};

const KEYS_MAIN = [
  ["↑↓", "move"],
  ["enter", "open"],
  ["t", "teach"],
  ["?", "keys"],
];

/** Here: what applies to the file that was just saved, starting with anything it breaks. */
export function here(cols) {
  const out = [...header(cols), ...tabs(cols, "Here")];
  out.push(fit([s("src/export.ts", { fg: C.text }), s(" · saved by ", { fg: C.faint }), ...handleChip("alex"), s(" Claude Code · just now", { fg: C.faint })], cols), []);
  out.push(fit([kind("BREAKS A LOCKED RULE"), sep(), ...scopeChip("#org")], cols));
  out.push(fit(title("Never mix data from different lab customers", C.lockedText), cols));
  out.push(
    ...codeFrame(cols, {
      file: "src/export.ts",
      line: 18,
      col: 16,
      len: 28,
      note: "two labs",
      locked: true,
      src: [
        [17, "export function writeLabBFixtures() {"],
        [18, "  const rows = [...labA.rows, ...labB.rows];"],
        [19, "  return writeCsv(rows);"],
      ],
    }),
  );
  out.push(fit([s("Set by ", { fg: C.muted }), ...handleChip("maya"), s(" Security · locked 14 Oct", { fg: C.muted })], cols));
  out.push(fit(hints([["f", "fix: build Lab B fixtures from synthetic rows"]]), cols), []);
  out.push(fit([kind("TEAM LESSON"), sep(), ...scopeChip("#team/data-pipelines")], cols));
  out.push(fit(title("Every export calls `assertSingleCustomer()`", C.lessonText), cols));
  out.push(fit([s("Learned from ", { fg: C.muted }), ...handleChip("alex", { pos: true }), s(" correction · 3h ago", { fg: C.muted })], cols));
  out.push(fit([s("Approved by ", { fg: C.muted }), ...handleChip("jordan"), s(" · in every agent's next session", { fg: C.muted })], cols));
  out.push(fit([s("Followed on line 24 ", { fg: C.faint }), s("assertSingleCustomer(rows)", { fg: C.lessonText, ul: true })], cols));
  return [...out, ...footer(cols, [["f", "fix"], ["enter", "rule"], ["esc", "dismiss"], ["t", "teach"]])];
}

/** Rules: locked first in their own section, then org → team → repo → you. */
export function rules(cols, { selected = 4 } = {}) {
  const out = [...header(cols), ...tabs(cols, "Rules")];
  let i = 0;
  const block = (label, list, scope) => {
    out.push(section(cols, label, list.length, scope));
    list.forEach((r) => out.push(...ruleRow(cols, r, { selected: i++ === selected })));
    out.push([]);
  };
  block("LOCKED", RULES.locked);
  block("ORG", RULES.org);
  block("TEAM", RULES.team, "#team/data-pipelines");
  block("REPO", RULES.repo, "#repo/export-service");
  block("YOU", RULES.you);
  out.pop();
  return [...out, ...footer(cols, KEYS_MAIN)];
}

/** Rule detail: the provenance as a timeline, then the facts. */
export function detail(cols) {
  const out = [...header(cols), ...tabs(cols, "Rules")];
  out.push(fit([s("‹ Rules", { fg: C.chromeText })], cols), []);
  out.push(fit([kind("TEAM LESSON"), sep(), ...scopeChip("#team/data-pipelines")], cols));
  out.push(fit(title("Every export calls `assertSingleCustomer()`", C.lessonText), cols));
  out.push(fit([s("Call it on the rows before writing any export file.", { fg: C.muted })], cols), []);
  const node = (dot, color, when, body) => fit([s(` ${dot} `, { fg: color }), s(when.padEnd(8), { fg: C.faint }), ...body], cols);
  const rail = () => fit([s(" │", { fg: C.hair })], cols);
  out.push(node("○", C.muted, "16 Oct", [...handleChip("alex"), s(" corrected Claude Code:", { fg: C.muted })]));
  out.push(fit([s(" │", { fg: C.hair }), s('          "No. Exports must call assertSingleCustomer()', { fg: C.text })], cols));
  out.push(fit([s(" │", { fg: C.hair }), s('          before writing anything."', { fg: C.text })], cols));
  out.push(rail());
  out.push(node("○", C.muted, "16 Oct", [s("proposed, waiting on ", { fg: C.muted }), ...handleChip("jordan")]));
  out.push(rail());
  out.push(node("●", C.ok, "16 Oct", [...handleChip("jordan"), s(" approved it", { fg: C.ok })]));
  out.push(rail());
  out.push(node("●", C.lesson, "now", [s("in every agent's context on #team/data-pipelines", { fg: C.text })]), []);
  const fact = (k, v) => fit([s(k.padEnd(13), { fg: C.faint }), ...v], cols);
  out.push(fact("Scope", scopeChip("#team/data-pipelines")));
  out.push(fact("Related", [s("Never mix data from different lab customers", { fg: C.lockedText })]));
  out.push(fact("Applies here", [s("src/export.ts", { fg: C.text }), s(" lines 18, 24", { fg: C.faint })]));
  return [...out, ...footer(cols, [["esc", "back"], ["o", "open in Hivemind"], ["s", "show in file"]])];
}

/** Queue: role-aware. A lead sees Approve/Reject on what they own; everyone else sees who it waits on. */
export function queue(cols, { flash = null, as = "jordan" } = {}) {
  const lead = as === "jordan";
  const out = [...header(cols, { waiting: flash === "gone" ? 1 : 2, rules: flash === "gone" ? 11 : 10, as }), ...tabs(cols, "Queue", { rules: flash === "gone" ? 11 : 10, waiting: flash === "gone" ? 1 : 2 })];
  out.push(fit([s(lead ? "Waiting on you" : "Waiting on a lead", { fg: C.faint, bold: true }), sep(), s(flash === "gone" ? "1" : "2", { fg: C.faint })], cols), []);
  if (flash !== "gone") {
    const bg = flash === "approved" ? C.okBg : C.selBg;
    out.push(fit([s("▎ ", { fg: flash === "approved" ? C.ok : C.chrome, bg }), ...title("Every export calls `assertSingleCustomer()`", C.lessonText, { bg })], cols, bg));
    out.push(...wrap('"No. Exports must call assertSingleCustomer() before writing anything."', cols, { fg: C.muted, bg }));
    out.push(fit([s("  ", { bg }), ...scopeChip("#team/data-pipelines"), s("  2m", { fg: C.faint, bg })], cols, bg));
    out.push(fit([s("  proposed by ", { fg: C.faint, bg }), ...handleChip("alex", { pos: true }), s(" Claude Code agent", { fg: C.faint, bg })], cols, bg));
    out.push(
      flash === "approved"
        ? fit([s("  Approved", { fg: C.ok, bold: true, bg }), s(" · in every agent's next session", { fg: C.ok, bg })], cols, bg)
        : lead
          ? fit([s("  ", { bg }), ...key("a", "approve"), s("   ", { bg }), ...key("r", "reject")].map((x) => ({ ...x, bg })), cols, bg)
          : fit([s("  Waiting on ", { fg: C.faint, bg }), ...handleChip("jordan")], cols, bg),
    );
    out.push([]);
  }
  out.push(fit([s("▎ ", { fg: C.lesson }), ...title("Retries back off exponentially", C.lessonText)], cols));
  out.push(fit([s("  "), ...scopeChip("#repo/export-service"), s("  18m", { fg: C.faint })], cols));
  out.push(fit([s("  proposed by ", { fg: C.faint }), ...handleChip("noor", { pos: true }), s(" Cursor agent", { fg: C.faint })], cols), []);
  out.push(fit([s("STOPPED BY A LOCKED RULE", { fg: C.faint, bold: true }), sep(), s("1", { fg: C.faint })], cols));
  out.push(fit([s("▎ ", { fg: C.locked }), s("Mixing labs is fine for test fixtures", { fg: C.muted, bold: true })], cols));
  out.push(fit([s("  Blocked: contradicts ", { fg: C.lockedText }), ...handleChip("maya", { pos: true }), s(" locked rule", { fg: C.lockedText })], cols));
  return [...out, ...footer(cols, lead ? [["a", "approve"], ["r", "reject"], ["j/k", "move"], ["enter", "open"]] : [["j/k", "move"], ["enter", "open"]])];
}

/** Feed: grouped by time; the tool is plain grey text; a new row arrives with a blue wash that fades. */
export function feed(cols, { fresh = 0, as, rules = 10, waiting = 2 } = {}) {
  const out = [...header(cols, { as, rules, waiting }), ...tabs(cols, "Feed", { rules, waiting })];
  const washes = [C.selBg, "#21263A", "#1F222F", undefined];
  const row = (h, tool, what, file, when, i = -1) => {
    const bg = i === 0 ? washes[Math.min(fresh, 3)] : undefined;
    const chip = handleChip(h);
    return fit([...chip, s(" ".repeat(Math.max(0, 11 - w(chip))), bg ? { bg } : {}), s(` ${tool}`.padEnd(13), { fg: C.faint, bg }), s(what, { fg: C.text, bg }), s(` ${file}`, { fg: C.muted, bg }), s(`  ${when}`, { fg: C.faint, bg })], cols, bg);
  };
  out.push(section(cols, "NOW", 3), row("noor", "Cursor", "edited", "src/export.ts", "just now", 0), row("alex", "Claude Code", "edited", "src/export.ts", "2m"));
  out.push(fit([s("  Heads up: two agents in src/export.ts within 10 minutes", { fg: C.lessonText })], cols));
  out.push(row("jordan", "Hivemind", "approved", "a lesson", "3m"), []);
  out.push(section(cols, "EARLIER", 4));
  out.push(row("noor", "Claude Code", "proposed", "a lesson", "18m"));
  out.push(fit([...handleChip("noor"), s(" ".repeat(11 - w(handleChip("noor")))), s(" Claude Code".padEnd(13), { fg: C.faint }), s("blocked", { fg: C.lockedText }), s(" by a locked rule", { fg: C.muted }), s("  21m", { fg: C.faint })], cols));
  out.push(row("alex", "Codex", "edited", "src/fixtures.ts", "34m"));
  out.push(row("alex", "Claude Code", "corrected", "its agent", "3h"));
  return [...out, ...footer(cols, KEYS_MAIN)];
}

/** Teach: `t` focuses a one-line input docked at the bottom (so typing never fights the agent's prompt next door). */
export function teach(cols, { typed = "Retries back off exponentially, max 5 attempts", sent = false } = {}) {
  const base = rules(cols, { selected: -1 }).slice(0, 12);
  const box = [
    fit([s("╭─ ", { fg: C.chrome }), s("Teach Hivemind", { fg: C.text, bold: true }), s(` ${"─".repeat(Math.max(0, cols - 19))}╮`, { fg: C.chrome })], cols),
    sent
      ? fit([s("│ ", { fg: C.chrome }), s("Lesson proposed. Waiting on ", { fg: C.lessonText }), ...handleChip("jordan"), s(".", { fg: C.lessonText }), s(" ".repeat(Math.max(0, cols - 44))), s(" │", { fg: C.chrome })], cols)
      : fit([s("│ ", { fg: C.chrome }), s("› ", { fg: C.chromeText }), s(typed, { fg: C.text }), s("▍", { fg: C.chromeText }), s(" ".repeat(Math.max(0, cols - typed.length - 7))), s(" │", { fg: C.chrome })], cols),
    fit([s("╰─ ", { fg: C.chrome }), ...scopeChip("#repo/export-service"), s(` ${"─".repeat(Math.max(0, cols - 37))} `, { fg: C.chrome }), s("enter", { fg: C.chromeText }), s(" ─╯", { fg: C.chrome })], cols),
  ];
  return [...base, ...box, fit(hints([["enter", "send"], ["tab", "scope"], ["esc", "cancel"]]), cols)];
}

/** The celebration, frame by frame: 7 cells fill honey 90 ms apart, then the line, then the counter rolls. */
export function celebrate(cols, frame = 99) {
  const cells = [
    [1, 0], [3, 0], [0, 1], [2, 1], [4, 1], [1, 2], [3, 2],
  ];
  const lit = Math.min(cells.length, frame);
  const grid = [0, 1, 2].map((y) => {
    const row = [s("   ")];
    for (let x = 0; x < 5; x++) {
      const idx = cells.findIndex(([cx, cy]) => cx === x && cy === y);
      row.push(idx < 0 ? s("  ") : s("⬢ ", { fg: idx < lit ? C.lesson : C.hair }));
    }
    return row;
  });
  const done = frame >= cells.length;
  const count = done ? Math.min(11, 10 + Math.max(0, frame - cells.length)) : 10;
  const out = [...header(cols, { rules: count, waiting: 1 }), ...tabs(cols, "Here", { rules: count, waiting: 1 }), []];
  out.push(fit([...grid[0], s(done ? "  Your lesson is live" : "", { fg: C.text, bold: true })], cols));
  out.push(fit([...grid[1], s(done ? " " : ""), ...(done ? [...handleChip("jordan"), s(" approved it", { fg: C.ok })] : [])], cols));
  out.push(fit([...grid[2], s(done ? "  every agent on #team/data-pipelines, next session" : "", { fg: C.muted })], cols), []);
  out.push(fit([s("   ", {}), ...title("Every export calls `assertSingleCustomer()`", C.lessonText)], cols));
  out.push(fit([s("   Team rules ", { fg: C.faint }), s(String(count), { fg: done ? C.lesson : C.text, bold: true })], cols));
  return out;
}

/** Claude Code's status line (statusLine command). One line, no box. */
export function statusLine(state = "normal") {
  const mark = s("⬢ ", { fg: C.lesson });
  const name = s("Hivemind", { fg: C.text });
  if (state === "locked") return [[mark, name, sep(), s("breaks 1 locked rule", { fg: C.lockedText, bold: true }), sep(), s("src/export.ts:18", { fg: C.muted })]];
  if (state === "lesson") return [[mark, name, sep(), s("misses 1 team lesson", { fg: C.lessonText }), sep(), s("10 rules", { fg: C.muted })]];
  if (state === "approved") return [[mark, name, sep(), s("11 rules", { fg: C.lesson, bold: true }), sep(), s("lesson approved", { fg: C.ok })]];
  if (state === "next") return [[mark, name, sep(), s("11 rules", { fg: C.muted }), sep(), s("1 waiting", { fg: C.muted })]]; // the morning after an approval
  return [[mark, name, sep(), s("10 rules", { fg: C.muted }), sep(), s("2 waiting", { fg: C.muted })]];
}

// ── Claude Code's pane (the left half of the split) ──────────────────────────
const CC = {
  head: [s("✻ ", { fg: "#D97757" }), s("Claude Code", { fg: C.text, bold: true }), s("  Sonnet 5.5 · ~/export-service", { fg: C.faint })],
  hook: (t, fg = C.lessonText) => [s(t, { fg })],
  you: (t, first = true) => [s(first ? "> " : "  ", { fg: C.faint, ...(first ? {} : { bg: C.codeBg }) }), s(t, { fg: C.text, bg: C.codeBg })],
  say: (t, first = true, dot = C.text) => [s(first ? "● " : "  ", { fg: dot }), s(t, { fg: C.text })],
  tool: (name, arg) => [s("● ", { fg: C.ok }), s(name, { fg: C.text, bold: true }), s(`(${arg})`, { fg: C.muted })],
  out: (t) => [s("  ⎿ ", { fg: C.faint }), s(t, { fg: C.faint })],
  add: (n, code, mark) => [s(`     ${n} `, { fg: C.faint }), s("+ ", { fg: C.ok }), s(code, { fg: C.text, bg: "#1D3A2B" }), ...(mark ? [s(`  ← ${mark}`, { fg: C.lessonText })] : [])],
};

/** The transcript lines of each scene (unpadded; claudePane pads them and adds the prompt box). */
export const TRANSCRIPTS = {
  // @alex asks, the agent skips the check, he corrects it, the hook captures the lesson.
  correct: [
    CC.head,
    CC.hook("Hivemind · Loaded 10 team rules for #repo/export-service."),
    [],
    CC.you("Add a CSV export for Lab B's monthly report in src/export.ts"),
    [],
    CC.tool("Update", "src/export.ts"),
    CC.out("Updated src/export.ts with 5 additions"),
    [],
    CC.you("No. Exports must call assertSingleCustomer() before"),
    CC.you("writing anything.", false),
    [],
    CC.hook('Hivemind · Lesson captured: "Exports call'),
    CC.hook('assertSingleCustomer()". Waiting on @jordan.'),
    [],
    CC.say("Right. I'll call assertSingleCustomer(rows) before the"),
    CC.say("write.", false),
    CC.tool("Update", "src/export.ts"),
    CC.out("Updated src/export.ts with 1 addition"),
  ],
  // @noor, a fresh session the next day: the first line the agent writes is the lesson.
  fresh: [
    CC.head,
    CC.hook("Hivemind · Loaded 11 team rules for #repo/export-service."),
    [],
    CC.you("Add a JSON export for Lab A's quarterly report in"),
    CC.you("src/export.ts", false),
    [],
    CC.tool("Update", "src/export.ts"),
    CC.out("Updated src/export.ts with 4 additions"),
    CC.add(31, "export function writeLabJson(rows: Row[]) {"),
    CC.add(32, "  assertSingleCustomer(rows);", "@alex's lesson"),
    CC.add(33, "  return writeJson(rows);"),
    CC.add(34, "}"),
  ],
  // @jordan between tasks: his agent is idle, his watch holds the queue.
  idle: [CC.head, CC.hook("Hivemind · Loaded 10 team rules for #repo/export-service.")],
  // Then @noor tries to teach a lesson that contradicts @maya's lock.
  blocked: [
    CC.head,
    CC.hook("Hivemind · Loaded 11 team rules for #repo/export-service."),
    [],
    CC.you("Just reuse Lab A's rows for the Lab B test fixtures,"),
    CC.you("it's only tests", false),
    [],
    CC.hook("Hivemind · Blocked: contradicts @maya's locked rule", C.lockedText),
    CC.hook('"Never mix data from different lab customers".', C.lockedText),
    [],
    CC.say("I can't mix lab customers, even in tests. Your team"),
    CC.say("has a locked rule against it, set by @maya. I'll", false),
    CC.say("generate synthetic rows for Lab B instead.", false),
    [],
    CC.tool("Write", "test/fixtures/labB.ts"),
    CC.out("Wrote 24 lines"),
  ],
};

export const PANE_ROWS = 26;
/** The first `n` transcript lines, padded, then the prompt box and Claude Code's status line. */
export function claudePane(cols, lines, { n = lines.length, status = "normal" } = {}) {
  const out = lines.slice(0, n).map((l) => fit(l, cols));
  while (out.length < PANE_ROWS - 4) out.push(fit([], cols));
  out.push(fit([s("╭" + "─".repeat(cols - 2) + "╮", { fg: "#5C5C63" })], cols));
  out.push(fit([s("│", { fg: "#5C5C63" }), s(" > ", { fg: C.faint }), s(" ".repeat(cols - 5)), s("│", { fg: "#5C5C63" })], cols));
  out.push(fit([s("╰" + "─".repeat(cols - 2) + "╯", { fg: "#5C5C63" })], cols));
  out.push(fit(statusLine(status)[0], cols));
  return out;
}

/** Here, on a file that follows every rule: the lesson it followed, with its provenance. */
export function hereClean(cols, { by = "noor", line = 32 } = {}) {
  const out = [...header(cols, { rules: 11, waiting: 1, as: by }), ...tabs(cols, "Here", { rules: 11, waiting: 1 })];
  out.push(fit([s("src/export.ts", { fg: C.text }), s(" · saved by ", { fg: C.faint }), ...handleChip(by), s(" Claude Code · just now", { fg: C.faint })], cols), []);
  out.push(fit([s("✓ ", { fg: C.ok }), s("This file follows every team rule.", { fg: C.ok, bold: true })], cols), []);
  out.push(fit([kind("TEAM LESSON"), sep(), ...scopeChip("#team/data-pipelines")], cols));
  out.push(fit(title("Every export calls `assertSingleCustomer()`", C.lessonText), cols));
  out.push(fit([s("Learned from ", { fg: C.muted }), ...handleChip("alex", { pos: true }), s(" correction · yesterday", { fg: C.muted })], cols));
  out.push(fit([s("Approved by ", { fg: C.muted }), ...handleChip("jordan"), s(" · in every agent's next session", { fg: C.muted })], cols));
  out.push(fit([s(`Followed on line ${line} `, { fg: C.faint }), s("assertSingleCustomer(rows)", { fg: C.lessonText, ul: true })], cols));
  return [...out, ...footer(cols, KEYS_MAIN)];
}

/**
 * The website's loop, five scenes in one split window: @alex corrects his agent → @jordan approves with `a` →
 * the celebration on @alex's pane → @noor's fresh session writes the lesson first → her bad lesson hits @maya's lock.
 * Returns { scenes: [{ who, caption, left }], right: Screen[], frames: [{ b, n, r, st, ms }] }:
 * scene b's transcript shown to line n, right pane r, Claude Code status line st, held ms.
 */
export function story(leftCols = 62, rightCols = 58) {
  const right = [];
  const R = (screen) => right.push(screen) - 1;
  const frames = [];
  const typeIn = (b, from, to, r, st = "normal", ms = 260) => {
    for (let n = from; n <= to; n++) frames.push({ b, n, r, st, ms });
  };
  const hold = (ms) => (frames.at(-1).ms = ms);

  // 1. @alex corrects; the right pane is his own watch, which shows the lesson waiting on @jordan.
  const feedR = R(feed(rightCols, { fresh: 3 }));
  const waitR = R(queue(rightCols, { as: "alex" }));
  const T1 = TRANSCRIPTS.correct;
  typeIn(0, 2, 7, feedR);
  hold(900);
  typeIn(0, 8, 10, feedR);
  hold(700);
  typeIn(0, 11, 13, waitR, "normal", 320);
  hold(2200);
  typeIn(0, 14, T1.length, waitR);
  hold(1400);
  // 2. @jordan's watch: the same lesson in his queue; `a` flashes it green and it leaves.
  const qR = R(queue(rightCols, { as: "jordan" }));
  const okR = R(queue(rightCols, { as: "jordan", flash: "approved" }));
  const goneR = R(queue(rightCols, { as: "jordan", flash: "gone" }));
  frames.push({ b: 1, n: 2, r: qR, st: "normal", ms: 2200 }, { b: 1, n: 2, r: okR, st: "normal", ms: 1300 }, { b: 1, n: 2, r: goneR, st: "next", ms: 1100 });
  // 3. Back on @alex's pane: the celebration, and his status line ticks to 11 rules.
  for (let i = 0; i < 10; i++) frames.push({ b: 2, n: T1.length, r: R(celebrate(rightCols, i)), st: i < 7 ? "normal" : "approved", ms: 90 });
  hold(2600);
  // 4. @noor, next morning: 11 rules load and the first line her agent writes is the check.
  const cleanR = R(hereClean(rightCols));
  const blankR = R(feed(rightCols, { fresh: 3, as: "noor", rules: 11, waiting: 1 }));
  const stoppedR = R(queue(rightCols, { as: "noor", flash: "gone" }));
  typeIn(3, 2, 7, blankR, "next");
  hold(700);
  typeIn(3, 8, TRANSCRIPTS.fresh.length, cleanR, "next", 300);
  hold(3200);
  // 5. She tries to teach a lesson that breaks @maya's lock: blocked in her pane, parked in the lead's queue.
  typeIn(4, 2, 5, blankR, "next");
  hold(700);
  typeIn(4, 6, 8, stoppedR, "next", 320);
  hold(1600);
  typeIn(4, 9, TRANSCRIPTS.blocked.length, stoppedR, "next");
  hold(3400);

  const scenes = [
    { who: "alex", caption: "@alex corrects his agent", left: TRANSCRIPTS.correct },
    { who: "jordan", caption: "@jordan approves it with one key", left: TRANSCRIPTS.idle },
    { who: "alex", caption: "every agent has it next session", left: TRANSCRIPTS.correct },
    { who: "noor", caption: "@noor's fresh session gets it right", left: TRANSCRIPTS.fresh },
    { who: "noor", caption: "a bad lesson hits @maya's lock", left: TRANSCRIPTS.blocked },
  ];
  // Every frame is the same height, so the window never jumps.
  const rows = Math.max(PANE_ROWS, ...right.map((x) => x.length));
  const pad = (screen, cols) => [...screen.map((l) => fit(l, cols)), ...Array.from({ length: rows - screen.length }, () => fit([], cols))];
  return {
    leftCols,
    rightCols,
    rows,
    scenes: scenes.map((x) => ({ ...x, left: x.left.map((l) => fit(l, leftCols)) })),
    status: Object.fromEntries(["normal", "approved", "next"].map((st) => [st, claudePane(leftCols, [], { status: st }).slice(-4)])),
    right: right.map((x) => pad(x, rightCols)),
    frames,
  };
}

/** The video's hero frame: Claude Code on the left, `hivemind watch` on the right, one terminal window. */
export function split(leftCols = 62, rightCols = 58) {
  const left = claudePane(leftCols, TRANSCRIPTS.blocked, { status: "next" });
  const right = queue(rightCols, { as: "jordan", flash: "gone" });
  const rows = Math.max(left.length, right.length);
  const out = [];
  for (let i = 0; i < rows; i++) out.push([...fit(left[i] ?? [], leftCols), s(" │ ", { fg: C.hair }), ...fit(right[i] ?? [], rightCols)]);
  return out;
}

export const SCREENS = { here, rules, detail, queue, feed, teach, celebrate, status: () => [...statusLine("normal"), [], ...statusLine("locked"), [], ...statusLine("lesson"), [], ...statusLine("approved")] };

// ── CLI ──────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Redraws in place, wrapped in DEC 2026 synchronized output so the frame never tears. */
async function play(frames, ms) {
  let prev = 0;
  for (const f of frames) {
    const text = toAnsi(f);
    process.stdout.write(`\x1b[?2026h${prev ? `\x1b[${prev}F\x1b[J` : ""}${text}\n\x1b[?2026l`);
    prev = text.split("\n").length;
    await sleep(ms);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const width = +(args[args.indexOf("--width") + 1] || 0) || (args.includes("--width") ? 64 : Math.min(process.stdout.columns || 64, 72));
  const name = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) ?? "all";
  const animate = args.includes("--animate") && detectColor() !== "none";
  if (name === "celebrate" && animate) return play(Array.from({ length: 10 }, (_, i) => celebrate(width, i)), 90);
  if (name === "approve" && animate) return play([queue(width), queue(width, { flash: "approved" }), queue(width, { flash: "approved" }), queue(width, { flash: "gone" })], 300);
  if (name === "feed" && animate) return play([0, 1, 2, 3].map((f) => feed(width, { fresh: f })), 100);
  if (name === "split") return console.log(toAnsi(split()));
  const names = name === "all" ? Object.keys(SCREENS) : [name];
  for (const n of names) {
    if (!SCREENS[n]) throw new Error(`unknown screen "${n}": ${Object.keys(SCREENS).join(", ")}, split, approve`);
    if (names.length > 1) console.log(`\n\x1b[2m── ${n} (${width} cols) ${"─".repeat(Math.max(0, width - n.length - 14))}\x1b[0m`);
    console.log(toAnsi(SCREENS[n](width)));
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("tui-reference.mjs")) main();
