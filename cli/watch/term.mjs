// Pure-ANSI screen: alternate buffer, line-diffed redraws inside synchronized-output brackets (no flicker in
// Windows Terminal / VS Code), raw keys, resize. Zero deps; restores the terminal on every exit path.
import { emitKeypressEvents } from "node:readline";

const ANSI = /\x1b\[[0-9;:?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u;
const cw = (ch) => (WIDE.test(ch) ? 2 : 1);

export const strip = (s) => String(s).replace(ANSI, "");
export const width = (s) => {
  let w = 0;
  for (const ch of strip(s)) w += cw(ch);
  return w;
};

/** Cut an ANSI string to `w` visible columns (adds "…" when it cuts), keeping escape codes intact. */
export function clip(s, w, ellipsis = "…") {
  s = String(s);
  if (width(s) <= w) return s;
  let out = "";
  let used = 0;
  const limit = Math.max(0, w - ellipsis.length);
  for (let i = 0; i < s.length; ) {
    ANSI.lastIndex = i;
    const m = s[i] === "\x1b" ? ANSI.exec(s) : null;
    if (m && m.index === i) {
      out += m[0];
      i += m[0].length;
      continue;
    }
    const ch = String.fromCodePoint(s.codePointAt(i));
    if (used + cw(ch) > limit) break;
    out += ch;
    used += cw(ch);
    i += ch.length;
  }
  return out + ellipsis + "\x1b[0m";
}
export const padEnd = (s, w) => {
  const c = clip(s, w);
  return c + " ".repeat(Math.max(0, w - width(c)));
};
/** left …space… right, in exactly `w` columns (right side wins when it doesn't fit). */
export function spread(left, right, w) {
  const rw = width(right);
  const l = clip(left, Math.max(0, w - rw - 1));
  return l + " ".repeat(Math.max(1, w - width(l) - rw)) + right;
}

/** Word-wrap plain-ish text (ANSI allowed, but wrapping counts visible chars). */
export function wrap(s, w, maxLines = 3) {
  const words = String(s).split(/(\s+)/);
  const lines = [];
  let cur = "";
  let cut = false;
  for (const word of words) {
    if (width(cur + word) > w && strip(cur).trim()) {
      lines.push(cur.trimEnd());
      cur = word.trimStart();
      if (lines.length === maxLines) {
        cut = true;
        break;
      }
    } else cur += word;
  }
  if (!cut && strip(cur).trim()) lines.push(cur);
  if (cut) lines[maxLines - 1] = clip(lines[maxLines - 1] + " …", w);
  return lines.map((l) => clip(l, w));
}

export class Screen {
  constructor(out = process.stdout) {
    this.out = out;
    this.prev = [];
    this.on = false;
    this.cursor = null;
  }
  get cols() {
    return this.out.columns || Number(process.env.COLUMNS) || 100;
  }
  get rows() {
    return this.out.rows || Number(process.env.LINES) || 36;
  }
  start() {
    this.on = true;
    this.out.write("\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J");
    const restore = () => this.stop();
    process.once("exit", restore);
    this.out.on("resize", () => {
      this.prev = [];
      this.out.write("\x1b[2J");
      this.onResize?.();
    });
  }
  stop() {
    if (!this.on) return;
    this.on = false;
    this.out.write("\x1b[0m\x1b[0 q\x1b[?25h\x1b[?1049l");
  }
  /** Draw full-screen `lines`; only rows that changed are rewritten. cursor = {row, col} shows the real caret there. */
  draw(lines, cursor = null) {
    let buf = "\x1b[?2026h\x1b[?25l";
    const n = this.rows;
    for (let r = 0; r < n; r++) {
      const line = lines[r] ?? "";
      if (this.prev[r] === line) continue;
      buf += `\x1b[${r + 1};1H\x1b[0m${line}\x1b[0m\x1b[K`;
    }
    this.prev = lines.slice(0, n);
    if (cursor) buf += `\x1b[${cursor.row + 1};${cursor.col + 1}H\x1b[6 q\x1b[?25h`;
    buf += "\x1b[?2026l";
    this.out.write(buf);
  }
}

/** Raw keypresses → cb(str, key). Ctrl+C arrives as a key (raw mode), so the caller handles quitting. */
export function keys(cb) {
  if (!process.stdin.isTTY) return () => {};
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("keypress", cb);
  return () => {
    process.stdin.off("keypress", cb);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}
