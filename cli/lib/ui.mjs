// Calm, minimal building blocks for the non-watch CLI output (help, status, check, why, teach, rules, init, use,
// update, open). Pure string helpers on watch's theme tokens (lib/style.mjs → watch/theme.mjs); the only side effects
// are the opt-in TTY spinner and header fade. Plain and copy-pasteable under NO_COLOR or when piped.
import { bgc, brand, fg, hex, t, useColor } from "./style.mjs";

const ANSI = /\x1b\[[0-9;:]*m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g;
/** Visible width (ANSI and OSC 8 stripped; the wide chars we print are all 1 column). */
export const vis = (s) => String(s).replace(ANSI, "").length;
export const padEnd = (s, w) => s + " ".repeat(Math.max(0, w - vis(s)));
export const padStart = (s, w) => " ".repeat(Math.max(0, w - vis(s))) + s;

const live = () => useColor && !!process.stdout.isTTY && !process.env.HIVEMIND_REDUCED_MOTION && !process.env.NO_MOTION;
export const width = () => Math.min(Number(process.stdout.columns) || Number(process.env.COLUMNS) || 96, 104);

const hair = fg(hex("hair"));
const faint = t.faint;

// ---------- header ----------
/**
 * `⬢ Hivemind · status                                   #repo/playground · @kevin`
 * Dim label, bold command, faint right-aligned context. Without colour the context follows after " · ".
 */
export function header(cmd, context = "") {
  const left = `${brand()} ${t.muted("·")} ${t.bold(cmd)}`;
  if (!context) return left;
  if (!useColor) return `${left} · ${context}`;
  const gap = width() - vis(left) - vis(context) - 2;
  return gap >= 2 ? `${left}${" ".repeat(gap)}${faint(context)}` : `${left}  ${faint(context)}`;
}

/** Print a header; in a live TTY it fades in (faint → full) over ~90ms. */
export async function printHeader(cmd, context) {
  const line = header(cmd, context);
  if (!live()) return console.log(line);
  process.stdout.write(`${faint(line.replace(ANSI, ""))}`);
  await new Promise((r) => setTimeout(r, 90));
  process.stdout.write(`\r\x1b[2K${line}\n`);
}

// ---------- cards ----------
/**
 * Rounded card with dim borders and 1-col padding:
 *   ╭─ Title ──────────╮
 *   │ line             │
 *   ╰──────────────────╯
 * `lines` may contain ANSI. Width = widest line (min `min`).
 */
export function card(lines, { title = "", min = 0 } = {}) {
  const inner = Math.max(min, vis(title) + 3, ...lines.map(vis));
  const top = title ? `${hair("╭─")} ${t.muted(title)} ${hair("─".repeat(Math.max(0, inner - vis(title) - 1)) + "╮")}` : hair(`╭${"─".repeat(inner + 2)}╮`);
  const body = lines.map((l) => `${hair("│")} ${padEnd(l, inner)} ${hair("│")}`);
  return [top, ...body, hair(`╰${"─".repeat(inner + 2)}╯`)].join("\n");
}

/** Aligned key/value rows: `● Key      value`. dot: "ok" | "warn" | "bad" | "off" | null. */
export function rows(items) {
  const kw = Math.max(...items.map((r) => vis(r.key)));
  return items.map((r) => `${r.dot === undefined ? "" : `${dot(r.dot)} `}${padEnd(t.muted(r.key), kw)}   ${r.value}`);
}

export const dot = (state) =>
  state === "ok" ? t.ok("●") : state === "warn" ? t.lesson("●") : state === "bad" ? t.locked("●") : state === "off" ? faint("○") : " ";

// ---------- chips & pills ----------
const pillBg = bgc(hex("pill"));
/** Keycap-style command chip: ` init ` on a dim background (plain `init` without colour). */
export const chip = (name, w = 0) => (useColor ? pillBg(` ${t.text(padEnd(name, w))} `) : padEnd(name, w + 2));
/** Rounded-feeling summary pill: ` ⬢ Hivemind · … ` on the pill background. */
export const pill = (content) => (useColor ? pillBg(` ${content} `) : content);

// ---------- spinner ----------
/**
 * Run `promise` with a quiet spinner that only appears if it takes longer than 300ms (TTY + colour only). The spinner
 * is the brand hexagon breathing between faint and honey, on stderr, cleared when done.
 */
export async function spin(label, promise) {
  if (!live() || !process.stderr.isTTY) return promise;
  const frames = [faint, t.muted, t.lessonText ?? t.lesson, t.lesson, t.lessonText ?? t.lesson, t.muted];
  let i = 0;
  let shown = false;
  const draw = () => {
    shown = true;
    process.stderr.write(`\r\x1b[2K${frames[i++ % frames.length]("⬢")} ${faint(label)}`);
  };
  const delay = setTimeout(() => {
    draw();
    timer = setInterval(draw, 110);
  }, 300);
  let timer = null;
  try {
    return await promise;
  } finally {
    clearTimeout(delay);
    if (timer) clearInterval(timer);
    if (shown) process.stderr.write("\r\x1b[2K");
  }
}

export { faint, hair };
