#!/usr/bin/env node
// Renders tui-reference.mjs into:
//   public/brand/terminal/terminal-mock.html      every screen in a terminal window, with the motion playing
//   src/components/site/watch-screens.json        the screens the website's "In your terminal" section shows
// Run after changing tui-reference.mjs:  node public/brand/terminal/render-mock.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./tui-reference.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

const W = 64; // a split pane next to an agent
const shots = [
  { id: "split", title: "The video frame: Claude Code | hivemind watch", lines: T.split(), cols: 123, note: "One terminal window, split. Left: Claude Code refusing to mix lab data after the Blocked line. Right: hivemind watch on Queue, as the lead sees it. This is the hero shot." },
  { id: "here", title: "Here: a save that breaks a rule", lines: T.here(W), note: "Opens on the file that was just saved. Locked first. The code frame is hivemind check's: gutter, context, ~~~~ under the exact columns the API returns. Provenance under every rule." },
  { id: "rules", title: "Rules", lines: T.rules(W), note: "Locked rules get their own section, always first. Then org → team → repo → you. ▎ is the 2px left rule (rose locked, honey lesson). The selected row is a blue wash with a chrome ▎." },
  { id: "detail", title: "Rule detail (enter on a row)", lines: T.detail(W), note: "The hover card from the editor spec becomes this view. Provenance is a timeline: ○ events, ● the ones that changed status. esc goes back." },
  { id: "queue", title: "Queue, as the lead (@jordan)", lines: T.queue(W), note: "Role-aware. a / r act on the selected card; j / k move. Blocked lessons sit under STOPPED BY A LOCKED RULE and only Security can dismiss them." },
  { id: "queue-eng", title: "Queue, as an engineer", lines: T.queue(W, { as: "alex" }), note: "No buttons. Each card says who it waits on." },
  { id: "feed", title: "Feed", lines: T.feed(W), note: "Grouped NOW / EARLIER. The tool is plain grey text, never a badge. A collision gets one honey line under the two edits." },
  { id: "teach", title: "Teach (t)", lines: T.teach(W), note: "t focuses a one-line input docked at the bottom, so typing never competes with the agent's prompt in the next pane. tab cycles the scope chip." },
  { id: "teach-sent", title: "Teach, sent", lines: T.teach(W, { sent: true }), note: "Held 3 s in honey, then the box closes." },
  { id: "celebrate", title: "Lesson approved (on the proposer's screen)", lines: T.celebrate(W), note: "7 cells fill honey 90 ms apart, then the line, then the rule count ticks 10 → 11. 1.6 s, held until the next key. No ring, no confetti." },
  { id: "narrow", title: "Narrow pane (44 columns)", lines: T.queue(44), note: "Under 50 columns the tabs become H R Q F, the org name drops, then who-you-are wraps. Titles truncate with … by display width." },
  { id: "status", title: "Claude Code status line", lines: T.SCREENS.status(), cols: 64, note: "statusLine command output: one line, no box. Rose when the open file breaks a locked rule, honey for a lesson, the count in honey right after an approval." },
];

const frames = {
  celebrate: Array.from({ length: 10 }, (_, i) => T.celebrate(W, i)),
  approve: [T.queue(W), T.queue(W, { flash: "approved" }), T.queue(W, { flash: "approved" }), T.queue(W, { flash: "gone" })],
  feed: [3, 0, 1, 2, 3].map((f) => T.feed(W, { fresh: f })),
};

// ── terminal-mock.html ───────────────────────────────────────────────────────
const win = (id, title, lines, cols = W) => `
<div class="win" style="--cols:${cols}">
  <div class="bar"><i></i><i></i><i></i><span>${title} — ${cols}×${lines.length}</span></div>
  <div class="scr" id="${id}">${T.toHtml(lines)}</div>
</div>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>hivemind watch reference</title>
<style>
:root{--bg:#f7f8fa;--ink:#0e0f12;--muted:#686d78}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1400px;margin:0 auto;padding:48px 32px 96px}
h1{font-size:30px;letter-spacing:-.02em;margin:0}
h1 small{display:block;color:var(--muted);font-size:15px;font-weight:400;letter-spacing:0;margin-top:6px}
h2{font-size:17px;margin:0 0 4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(600px,1fr));gap:40px 32px;margin-top:40px}
.card p{color:var(--muted);margin:0 0 30px;max-width:62ch;font-size:14px}
.win{width:max-content;max-width:100%;border-radius:10px;overflow:hidden;background:#1c1c1e;box-shadow:0 0 0 .5px rgba(0,0,0,.5),0 24px 60px -18px rgba(15,23,42,.45)}
.bar{position:relative;height:28px;display:flex;align-items:center;gap:7px;padding:0 10px;background:#2b2b2d;border-bottom:1px solid #000}
.bar i{width:11px;height:11px;border-radius:50%;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
.bar span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#a1a1aa;font-size:11.5px}
.scr{padding:10px 12px 12px;color:#e4e4e7;font:13px/1.38 ui-monospace,"SF Mono",Menlo,Consolas,monospace;white-space:pre;overflow-x:auto}
.ln{min-height:1.38em}
.g{display:inline-block;width:1ch;text-align:center}
.wide{grid-column:1/-1}
.legend{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:22px;font-size:13px;color:var(--muted)}
.legend b{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:6px}
code{font:12.5px ui-monospace,Menlo,monospace;background:#eceef1;padding:1px 5px;border-radius:4px}
</style></head><body><main>
<h1>hivemind watch: terminal UI reference<small>Every screen below is printed by <code>public/brand/terminal/tui-reference.mjs</code> (zero dependencies). Run <code>node public/brand/terminal/tui-reference.mjs</code> in a real terminal to see the same thing in 24-bit colour; <code>--animate</code> plays the motion. Spec: <code>terminal-spec.md</code>. Adrian, 17 Oct.</small></h1>
<div class="legend">
<span><b style="background:#4C6EF5"></b>chrome #4C6EF5 / text #91A7FF: tabs, selection, keys, links</span>
<span><b style="background:#E5484D"></b>locked #E5484D / text #FF9592</span>
<span><b style="background:#F5A524"></b>lesson #F5A524 / text #F5C26B</span>
<span><b style="background:#3DD68C"></b>approved #3DD68C</span>
<span><b style="background:#2A2A2E"></b>chip bg #2A2A2E (pre-blended on #1C1C1E)</span>
</div>
<div class="grid">
${shots
  .map(
    (x) => `<section class="card${x.id === "split" ? " wide" : ""}"><h2>${x.title}</h2><p>${x.note}</p>${win(x.id, x.id === "split" ? "zsh" : "hivemind watch", x.lines, x.cols ?? W)}</section>`,
  )
  .join("\n")}
<section class="card"><h2>Motion: the celebration, playing</h2><p>Frames 90 ms apart, drawn inside DEC 2026 synchronized output so nothing tears.</p>${win("anim-celebrate", "hivemind watch", frames.celebrate.at(-1))}</section>
<section class="card"><h2>Motion: approve (a)</h2><p>The card goes green with "Approved" for 300 ms, holds, then collapses; the counts tick.</p>${win("anim-approve", "hivemind watch", frames.approve[0])}</section>
<section class="card"><h2>Motion: a new feed row</h2><p>Arrives on a blue wash that steps back to the background over 3 frames, 100 ms apart.</p>${win("anim-feed", "hivemind watch", frames.feed[0])}</section>
</div></main>
<script>
const F=${JSON.stringify(Object.fromEntries(Object.entries(frames).map(([k, v]) => [k, v.map((f) => T.toHtml(f))])))};
const play=(id,list,ms,hold)=>{let i=0;const el=document.getElementById(id);const tick=()=>{el.innerHTML=list[i];const last=i===list.length-1;i=(i+1)%list.length;setTimeout(tick,last?hold:ms)};tick()};
if(!matchMedia("(prefers-reduced-motion: reduce)").matches){play("anim-celebrate",F.celebrate,90,2600);play("anim-approve",F.approve,700,1800);play("anim-feed",F.feed,110,2200)}
</script></body></html>`;
writeFileSync(join(here, "terminal-mock.html"), html);

// ── the website's copy (its demo names) ──────────────────────────────────────
const NAMES = { alex: "kevin", jordan: "ben", noor: "emily", maya: "greg" };
// The site's names are shorter than the reference's, so each line is padded back to its old width (the grid holds).
const rename = T.withNames(NAMES);
const site = (lines) =>
  rename(lines).map((l, i) => {
    const bg = lines[i].at(-1)?.bg;
    const want = T.w(lines[i]);
    if (T.w(l) < want) return [...l, T.s(" ".repeat(want - T.w(l)), bg ? { bg } : {})];
    // Longer (@emily for @noor): take the extra cells out of trailing spaces, else out of the widest space run.
    let extra = T.w(l) - want;
    const out = l.map((x) => ({ ...x }));
    for (let j = out.length - 1; j >= 0 && extra > 0; j--) {
      const trail = out[j].t.length - out[j].t.trimEnd().length;
      const cut = Math.min(trail, extra);
      out[j].t = out[j].t.slice(0, out[j].t.length - cut);
      extra -= cut;
      if (out[j].t.trim()) break;
    }
    for (let j = 0; j < out.length && extra > 0; j++) {
      const m = out[j].t.match(/ {2,}/);
      if (!m) continue;
      const cut = Math.min(extra, m[0].length - 1);
      out[j].t = out[j].t.replace(m[0], " ".repeat(m[0].length - cut));
      extra -= cut;
    }
    return out.filter((x) => x.t);
  });
const st = T.story();
const story = {
  ...st,
  scenes: st.scenes.map((x) => ({ who: NAMES[x.who], caption: x.caption.replace(/@(\w+)/g, (m, h) => `@${NAMES[h] ?? h}`), left: site(x.left) })),
  status: Object.fromEntries(Object.entries(st.status).map(([k, v]) => [k, site(v)])),
  right: st.right.map(site),
};
writeFileSync(
  join(root, "src", "components", "site", "watch-screens.json"),
  JSON.stringify({ split: site(T.split()), here: site(T.here(W)), queue: site(T.queue(W)), celebrate: frames.celebrate.map(site), story }) + "\n",
);
console.log(`terminal-mock.html: ${shots.length} screens + 3 animations; watch-screens.json written`);
