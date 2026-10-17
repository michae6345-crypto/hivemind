// One theme for every command. Tokens come from agent K's cli/watch/theme.mjs (the `hivemind watch` UI) when it is
// installed (its `tokens` export); otherwise the same terminal palette, copied here so a CLI without watch/ still matches.
// No emojis anywhere: colour carries the meaning (rose = locked rule, honey = team lesson).

/** The terminal palette (same keys and values as watch/theme.mjs `tokens`). */
export const SPEC = {
  text: "#E4E4E7",
  muted: "#A1A1AA",
  faint: "#71717A",
  locked: "#E5484D", // rose: locked rules, blocks
  lockedText: "#FF9592",
  lesson: "#F5A524", // honey: team lessons
  lessonText: "#F5C26B",
  ok: "#3DD68C",
  blue: "#4C6EF5",
  blueText: "#91A7FF", // links, commands to run
  team: "#8B8DF0",
  repo: "#2DD4BF", // files, paths
  handle: "#E0A955", // @handles
};
/** Our painter names → theme token names. */
const ALIAS = { link: "blueText", teal: "repo", warn: "lesson" };

let external = null;
try {
  external = await import("../watch/theme.mjs");
} catch {
  /* watch/ not installed (or not landed yet): use the spec values */
}

/** Hex for a token: watch/theme.mjs `tokens` / `colors` / named hex exports, else SPEC. */
function hexOf(name) {
  const key = ALIAS[name] ?? name;
  const v = external?.tokens?.[key];
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : SPEC[key];
}

const force = process.env.FORCE_COLOR;
export const useColor = !process.env.NO_COLOR && force !== "0" && (process.stdout.isTTY || !!force);
const truecolor =
  force === "3" || /truecolor|24bit/i.test(process.env.COLORTERM ?? "") || !!process.env.WT_SESSION || process.env.TERM_PROGRAM === "vscode" || process.env.TERM_PROGRAM === "iTerm.app";

/** Nearest xterm-256 colour for terminals without truecolor. */
function to256(r, g, b) {
  const q = (v) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40)));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function ownFg(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const open = truecolor ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[38;5;${to256(r, g, b)}m`;
  return (s) => (useColor ? `${open}${s}\x1b[39m` : String(s));
}

/** watch/theme.mjs's painter when present (same truecolor/256 shading as the watch UI), else ours. */
export const fg = external?.fg ?? ownFg;

const sgr = (open, close) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));

/** Theme painters. Prefer these over raw colours in every command. */
export const t = {
  text: fg(hexOf("text")),
  muted: fg(hexOf("muted")),
  faint: fg(hexOf("faint")),
  locked: fg(hexOf("locked")),
  lesson: fg(hexOf("lesson")),
  ok: fg(hexOf("ok")),
  teal: fg(hexOf("teal")),
  link: fg(hexOf("link")),
  team: fg(hexOf("team")),
  repo: fg(hexOf("repo")),
  warn: fg(hexOf("warn")),
  handle: fg(hexOf("handle")),
  lockedText: fg(hexOf("lockedText")),
  lessonText: fg(hexOf("lessonText")),
  bold: sgr(1, 22),
  dim: sgr(2, 22),
};

// ---------- shared view helpers (watch/theme.mjs; plain fallbacks keep the CLI working without watch/) ----------
const LABEL = { locked: ["LOCKED RULE", "locked"], lesson: ["TEAM LESSON", "lesson"], blocked: ["BLOCKED", "locked"], captured: ["LESSON CAPTURED", "lesson"], approved: ["LESSON APPROVED", "ok"], waiting: ["WAITING", "muted"] };
/** label("locked") → bold rose "LOCKED RULE"; label("lesson", "TEAM LESSON") etc. */
export const label =
  external?.label ?? ((kind, text) => { const [w, tok] = LABEL[kind] ?? [String(kind).toUpperCase(), "muted"]; return t.bold(t[tok](text ?? w)); });
/** "@jordan" in the handle style. */
export const handleChip = external?.handleChip ?? ((h) => t.bold(t.handle(h.startsWith("@") ? h : `@${h}`)));
/** "#repo/export-service" in its layer colour. */
export const scopeChip = external?.scopeChip ?? ((id) => (id.startsWith("team/") ? t.team : id.startsWith("repo/") ? t.repo : t.text)(`#${id}`));

/** @handles, #scopes and `code` coloured in running text (watch/theme.mjs `rich`), else @handles only. */
export const rich = external?.rich ?? ((s) => String(s).replace(/@[\w.-]+/g, (h) => t.handle(h)));

/** Whether the shared watch theme was found (shown in --version). */
export const themeSource = external ? "watch/theme.mjs" : "built-in spec";
