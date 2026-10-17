#!/usr/bin/env node
// Renders watch-v2.mjs into watch-v2.html (every frame at 46 and 72 columns, side by side) and shots-v2/*.png
// (one PNG per frame and width, via headless Chrome). Run after changing watch-v2.mjs:
//   node public/brand/terminal/render-v2.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as V from "./watch-v2.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WIDTHS = [46, 72];
const NOTES = {
  header: ["Header + tab pills", "One header line at every width: it drops the org, then the role, then shortens. The active tab is a blue pill; the honey dot on Queue means something waits on you (not just on someone)."],
  queue: ["Queue, as the lead (@ben)", "NEEDS YOU first, in honey. Each item is two lines with the status pill at the right edge, so the right column answers 'is this mine?'. Only the selected item opens its details and its keys. Live lessons fold into one line."],
  "queue-eng": ["Queue, as an engineer (@kevin)", "Same rows, no buttons. Nothing waits on Kevin, so there's no NEEDS YOU section and no honey dot."],
  feed: ["Feed", "Fixed columns: time · who · tool · what. An agent with no human is a neutral ◇ agent chip and an unknown tool is a faint —, so nothing is ragged. Under 60 columns the tool column drops. A collision is one honey ↳ line."],
  palette: ["Ctrl+K palette", "Floats over the dimmed tab in a rounded card with a blue border. Results grouped (waiting on you, commands, people), keycaps on the right, the selected row is the same blue wash as the list."],
  "empty-feed": ["Empty state: Feed", "The open hex, one bold line, one sentence that says what will appear here, one keycap. Centred; the sentence wraps on words in a narrow pane."],
  "empty-queue": ["Empty state: Queue", "Same anatomy on every tab."],
  celebrate: ["Celebration", "On the proposer's Here tab: a green card, the seven hex cells fill honey 90 ms apart, then who approved it and what it means now, and the rule count ticks 8 → 9. Held until the next key."],
  opened: ["The left pane after `hivemind open`", "Short enough for a 40-column pane, so it never wraps mid-word; the handle and repo drop first."],
};

// tui-reference pins its own glyphs to one cell; pin v2's extra ones too (text nodes only, not inside tags).
const pin = (html) => html.replace(/>([^<]*)</g, (_, txt) => `>${txt.replace(/[◇↳⬡✓→↑↓⌃]/g, (g) => `<span class="g">${g}</span>`)}<`);
const win = (lines, cols, title = "hivemind watch") => `
<div class="win" style="--cols:${cols}"><div class="bar"><i></i><i></i><i></i><span>${title} — ${cols}×${lines.length}</span></div>
<div class="scr">${pin(V.toHtml(lines))}</div></div>`;

const CSS = `:root{--bg:#f7f8fa;--ink:#0e0f12;--muted:#686d78}*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1500px;margin:0 auto;padding:48px 32px 96px}h1{font-size:30px;letter-spacing:-.02em;margin:0}
h1 small{display:block;color:var(--muted);font-size:15px;font-weight:400;letter-spacing:0;margin-top:6px}
h2{font-size:17px;margin:44px 0 4px}p{color:var(--muted);margin:0 0 18px;max-width:80ch;font-size:14px}
.row{display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap}
.win{width:max-content;border-radius:10px;overflow:hidden;background:#1c1c1e;box-shadow:0 0 0 .5px rgba(0,0,0,.5),0 24px 60px -18px rgba(15,23,42,.45)}
.bar{position:relative;height:28px;display:flex;align-items:center;gap:7px;padding:0 10px;background:#2b2b2d;border-bottom:1px solid #000}
.bar i{width:11px;height:11px;border-radius:50%;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
.bar span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#a1a1aa;font-size:11.5px}
.scr{padding:10px 12px 12px;color:#e4e4e7;font:13px/1.38 ui-monospace,"SF Mono",Menlo,Consolas,monospace;white-space:pre}
.ln{height:1.38em}.ln>span{display:inline-block;height:1.38em;vertical-align:top}.g{display:inline-block;width:1ch;text-align:center}
code{font:12.5px ui-monospace,Menlo,monospace;background:#eceef1;padding:1px 5px;border-radius:4px}`;

const sections = Object.entries(V.FRAMES)
  .map(([id, fn]) => {
    const [title, note] = NOTES[id];
    return `<section><h2>${title}</h2><p>${note}</p><div class="row">${WIDTHS.map((c) => win(fn(c), c, id === "opened" ? "zsh" : "hivemind watch")).join("")}</div></section>`;
  })
  .join("\n");

writeFileSync(
  join(here, "watch-v2.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>hivemind watch v2</title><style>${CSS}</style></head><body><main>
<h1>hivemind watch: polish v2<small>Every frame is printed by <code>public/brand/terminal/watch-v2.mjs</code>, built on the atoms in <code>tui-reference.mjs</code>. Each one at a narrow split (46 columns) and a wide pane (72). Reasons in <code>watch-v2.md</code>. Adrian, 17 Oct.</small></h1>
${sections}
</main></body></html>`,
);

// ── PNGs ─────────────────────────────────────────────────────────────────────
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
if (!CHROME) {
  console.log("watch-v2.html written (no Chrome found for PNGs)");
  process.exit(0);
}
const out = join(here, "shots-v2");
mkdirSync(out, { recursive: true });
for (const [id, fn] of Object.entries(V.FRAMES))
  for (const c of WIDTHS) {
    const lines = fn(c);
    const file = join(out, `${id}-${c}.html`);
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${CSS} body{background:#1c1c1e}.win{box-shadow:none;border-radius:0;width:100%}</style>${win(lines, c, id === "opened" ? "zsh" : "hivemind watch")}`);
    const W = Math.ceil(c * 8.1 + 30);
    const H = Math.ceil(lines.length * 17.94 + 28 + 23);
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", `--window-size=${W},${H}`, `--screenshot=${join(out, `${id}-${c}.png`)}`, pathToFileURL(file).href], { stdio: "ignore" });
  }
console.log(`watch-v2.html + ${Object.keys(V.FRAMES).length * WIDTHS.length} PNGs in shots-v2/`);
