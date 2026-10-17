import { width as cellWidth, wrap as wrapCells } from "./term.mjs";

// Hivemind in the terminal: Adrian's editor palette (public/brand/vscode/editor-spec.md) as 24-bit ANSI on dark.
// Meaning is only rose (locked), honey (lesson) and the layer dots; blue is chrome (focus ring, active tab, keys).
// NO_COLOR → plain text. Terminals without truecolor get the nearest xterm-256 colour.

export const P = {
  blue: "#4C6EF5", // chrome: active tab, focus ring, key hints
  blueText: "#91A7FF",
  locked: "#E5484D",
  lockedText: "#FF9592",
  lesson: "#F5A524",
  lessonText: "#F5C26B",
  ok: "#3DD68C",
  text: "#E4E4E7",
  muted: "#A1A1AA",
  faint: "#71717A",
  hair: "#2E2E32", // dividers, the tab bar's rest, the timeline rail
  org: "#E4E4E7",
  team: "#8B93FF",
  repo: "#2DD4BF",
  personal: "#A1A1AA",
  handle: "#E0A955",
  pill: "#2A2A2E", // every chip's background
  sel: "#232A45", // selected row wash (chrome blue ~14%)
  tabBg: "#1C2333", // the active tab pill
  okWash: "#1D3A2B", // the approve flash
  bg: "#1C1C1E", // fades mix toward this (terminal-spec §2: washes are pre-blended onto #1C1C1E)
};

const env = process.env;
export const COLOR = !env.NO_COLOR && env.FORCE_COLOR !== "0" && (!!process.stdout.isTTY || !!env.FORCE_COLOR);
const TRUE =
  /truecolor|24bit/i.test(env.COLORTERM ?? "") || !!env.WT_SESSION || env.TERM_PROGRAM === "vscode" || env.FORCE_COLOR === "3";
// A live binding: `--no-motion` is parsed after this module has loaded (other commands import the palette early).
export let REDUCED = !!env.HIVEMIND_REDUCED_MOTION || !!env.NO_MOTION || !COLOR;
export const setReduced = (on) => (REDUCED = !!on || !COLOR);

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
/** a·x + (1-a)·y */
export const mix = (x, y, a) => toHex(rgb(x).map((v, i) => v * a + rgb(y)[i] * (1 - a)));

function to256([r, g, b]) {
  const q = (v) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40)));
  const cube = 16 + 36 * q(r) + 6 * q(g) + q(b);
  const lv = [0, 95, 135, 175, 215, 255];
  const dc = (r - lv[q(r)]) ** 2 + (g - lv[q(g)]) ** 2 + (b - lv[q(b)]) ** 2;
  const gray = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10)));
  const gv = 8 + gray * 10;
  const dg = (r - gv) ** 2 + (g - gv) ** 2 + (b - gv) ** 2;
  return dg < dc ? 232 + gray : cube;
}
const sgr = (layer, hex) => (TRUE ? `${layer};2;${rgb(hex).join(";")}` : `${layer};5;${to256(rgb(hex))}`);

// Global fade: cards ease in by rendering with alpha < 1 (colours mixed toward the background).
let ALPHA = 1;
export function faded(a, fn) {
  const prev = ALPHA;
  ALPHA = Math.max(0, Math.min(1, a));
  try {
    return fn();
  } finally {
    ALPHA = prev;
  }
}
const shade = (hex) => (ALPHA >= 1 ? hex : mix(hex, P.bg, ALPHA));

export const fg = (hex) => (s) => (COLOR ? `\x1b[${sgr(38, shade(hex))}m${s}\x1b[39m` : String(s));
export const bg = (hex) => (s) => (COLOR ? `\x1b[${sgr(48, shade(hex))}m${s}\x1b[49m` : String(s));
export const bold = (s) => (COLOR ? `\x1b[1m${s}\x1b[22m` : String(s));
export const dim = (s) => (COLOR ? `\x1b[2m${s}\x1b[22m` : String(s));
export const ital = (s) => (COLOR ? `\x1b[3m${s}\x1b[23m` : String(s));
/** Curly underline in a colour (SGR 4:3 + 58); terminals that don't know it show a plain underline or nothing. */
export const curly = (hex) => (s) => (COLOR ? `\x1b[4:3m\x1b[${sgr(58, shade(hex))}m${s}\x1b[59m\x1b[4:0m` : String(s));

export const t = {
  text: fg(P.text),
  muted: fg(P.muted),
  faint: fg(P.faint),
  hair: fg(P.hair),
  blue: fg(P.blue),
  blueText: fg(P.blueText),
  locked: fg(P.locked),
  lockedText: fg(P.lockedText),
  lesson: fg(P.lesson),
  lessonText: fg(P.lessonText),
  ok: fg(P.ok),
  handle: fg(P.handle),
};

/**
 * Clickable rows: a view puts rowMark(i) at the start of item i's first line. It's a zero-width OSC that width() and
 * clip() skip; the shell reads it (screen row → item) and strips it before anything is drawn.
 */
export const rowMark = (i) => `\x1b]hm;${i}\x07`;
export const ROW_MARK_RE = /\x1b\]hm;([^\x07]*)\x07/;

/** A status pill: ` waiting on @ben ` in honey, ` live ` in green… on a tint of its own colour. NO_COLOR: [text]. */
export const statusPill = (text, hex) => (COLOR ? bg(mix(hex, P.bg, 0.16))(fg(hex)(` ${text} `)) : `[${text}]`);

/**
 * A calm empty state, centred in the body: a small hex mark, one line saying what's (not) here, one helpful line,
 * and a key hint as a keycap. Wraps on a narrow pane instead of clipping.
 */
export function empty({ title, hint = "", key, what = "", width: w = 64, height: h = 20 }) {
  const center = (s) => " ".repeat(Math.max(0, Math.floor((w - cellWidth(s)) / 2))) + s;
  const body = [
    fg(P.lesson)("⬡"),
    "",
    ...wrapCells(title, Math.max(10, w - 4), 2).map((l) => t.muted(l)),
    ...(hint ? wrapCells(hint, Math.max(10, w - 6), 2).map((l) => t.faint(l)) : []),
    ...(key ? ["", `${COLOR ? bg(P.pill)(` ${t.blueText(key)} `) : key} ${t.faint(what)}`] : []),
  ];
  const top = Math.max(1, Math.floor((h - body.length) / 3));
  return [...Array(top).fill(""), ...body.map(center)];
}

export const HEX = "⬢";
export const HEX_OPEN = "⬡";
export const SEP = " · ";
export const sep = () => t.faint(SEP);

// ---------- chips ----------
export const layerColor = (scopeId = "") =>
  scopeId === "org" ? P.org : scopeId.startsWith("team/") ? P.team : scopeId.startsWith("repo/") ? P.repo : P.personal;

/** `● #repo/export-service` on a dim tint of the layer colour (a ring for personal scopes). */
export function scopeChip(scopeId) {
  const col = layerColor(scopeId);
  const dot = scopeId.startsWith("personal/") ? "○" : "●";
  const label = scopeId === "org" ? "#org" : `#${scopeId}`;
  return pill(`${fg(col)(dot)} ${t.text(label)}`);
}

/** Not a person: agent sessions ("agent:…"), the CLI itself ("cli", "watch-…"). They read "an agent", never "@cli". */
export const isBot = (a) => !a || /^(agent\b|agent:|cli$|cli-|watch-)/.test(String(a).replace(/^@/, ""));

// A person's dot is their layer: Security = org, a lead = team, an engineer = repo (terminal-spec §4).
const ROLE = new Map();
export function setPeople(people = []) {
  ROLE.clear();
  for (const p of people) ROLE.set(p.id, p.role);
}
const personColor = (id) => {
  const r = ROLE.get(id);
  return r === "security" ? P.org : r === "lead" ? P.team : r === "engineer" ? P.repo : P.handle;
};
/** ` ● @jordan ` on the chip background; { pos: true } puts the possessive inside: ` ● @alex's `. */
export function handleChip(h, { pos = false } = {}) {
  const id = String(h ?? "").replace(/^@/, "");
  // Agents get the same chip as people, with a neutral grey ring: a row never starts with bare text.
  if (isBot(id)) return pill(`${fg(P.faint)("○")} ${t.muted(pos ? "an agent's" : "an agent")}`);
  return pill(`${fg(personColor(id))("●")} ${t.text(`@${id}${pos ? "'s" : ""}`)}`);
}
const pill = (inner) => (COLOR ? bg(P.pill)(` ${inner} `) : inner);

/** Tool names are plain faint text (terminal-spec §4), not pills. */
export const badge = (label) => t.faint(label);

/**
 * Inline tokens in server text → colour: @handles, #scopes, `code` (honey, or rose in a locked rule), [[slug]] → slug.
 * Emoji stripped (house style: the hex mark is the only glyph).
 */
export function rich(s, { locked = false, base = t.text } = {}) {
  const code = locked ? t.lockedText : t.lessonText;
  return String(s)
    .replace(/\p{Extended_Pictographic}️?\s*/gu, "")
    .split(/(`[^`]+`|@[a-z][\w-]*|#(?:org|team\/[\w-]+|repo\/[\w-]+|personal\/[\w-]+)|\[\[[^\]]+\]\])/g)
    .map((part, i) => {
      if (i % 2 === 0) return part ? base(part) : "";
      if (part.startsWith("`")) return code(part.slice(1, -1));
      if (part.startsWith("@")) return t.handle(part);
      if (part.startsWith("#")) return fg(layerColor(part.slice(1) === "org" ? "org" : part.slice(1)))(part);
      return code(part.slice(2, -2));
    })
    .join("");
}

/** Server strings still carry 🔒 / 🚫 / ⚠️; the terminal says it in words. */
export function plain(s) {
  return String(s ?? "")
    .replace(/🔒\s*(?=\[\[|\*\*)/g, "locked rule ")
    .replace(/\p{Extended_Pictographic}️?\s*/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export const AGENT_LABEL = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  copilot: "Copilot",
  codex: "Codex",
  "claude-ai": "Claude",
  windsurf: "Windsurf",
  vscode: "VS Code",
  cli: "Terminal",
};
export const toolName = (a) => AGENT_LABEL[a] ?? "";
/** The tools a lesson reaches (the celebration rolls through these). */
export const TOOLS = ["Claude Code", "Cursor", "Copilot", "Codex", "Gemini CLI", "Windsurf"];

export const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3); // easeOutCubic

// ---------- view-contract helpers (ctx.theme) ----------
/** chip("repo", "repo/export-service") · chip("handle", "jordan") · chip("tool", "Cursor") · chip("scope", anyScopeId) */
export function chip(kind, text) {
  if (kind === "handle") return handleChip(text);
  if (kind === "tool") return badge(text);
  if (kind === "org") return scopeChip("org");
  if (kind === "scope") return scopeChip(text);
  return scopeChip(String(text).includes("/") ? text : `${kind}/${text}`);
}
const LABELS = {
  locked: ["LOCKED RULE", P.locked],
  lesson: ["TEAM LESSON", P.lesson],
  you: ["WAITING ON YOU", P.lesson],
  waiting: ["WAITING", P.muted],
  captured: ["LESSON CAPTURED", P.lesson],
  proposed: ["AGENT PROPOSAL", P.lesson],
  approved: ["LESSON APPROVED", P.ok],
  rejected: ["REJECTED", P.muted],
  blocked: ["BLOCKED", P.locked],
  collision: ["HEADS UP", P.lesson],
  session: ["SESSION", P.muted],
  edit: ["EDIT", P.faint],
  correction: ["CORRECTION", P.muted],
  flag: ["FLAG", P.locked],
  fix: ["FIX", P.lesson],
  fact: ["FACT", P.muted],
};
/** Uppercase kind label in its colour: label("locked") → bold rose "LOCKED RULE". */
export function label(kind, text) {
  const [word, col] = LABELS[kind] ?? [String(kind).toUpperCase(), P.muted];
  return bold(fg(col)(text ?? word));
}
export const labelColor = (kind) => (LABELS[kind] ?? [, P.muted])[1];

// ---------- for other commands (cli/lib/style.mjs) ----------
export const tokens = P;
export const paint = (hex, s) => fg(hex)(s);
export const rose = t.locked;
export const roseText = t.lockedText;
export const honey = t.lesson;
export const honeyText = t.lessonText;
export const ok = t.ok;
export const link = t.blueText;
export const text = t.text;
export const muted = t.muted;
export const faint = t.faint;
