// Builds media/hivemind.woff: one glyph (U+E000) of the tonal-chain logo, used as $(hivemind) in the status bar / CodeLens.
// Monochrome version of public/brand/vscode/icon.svg: two filled cells + the "next lesson" cell as an outline.
import { writeFileSync } from "node:fs";
import svg2ttf from "svg2ttf";
import ttf2woff from "ttf2woff";

const S = 1000 / 120; // logo viewBox is 120 units, font em is 1000 (y up)
const pt = ([x, y]) => `${(x * S).toFixed(1)} ${((120 - y) * S - 60).toFixed(1)}`;
const hex = (cx, cy, r) => [0, 1, 2, 3, 4, 5].map((i) => [cx + r * Math.cos(((i * 60 - 90) * Math.PI) / 180), cy + r * Math.sin(((i * 60 - 90) * Math.PI) / 180)]);
const path = (pts, reverse = false) => {
  const p = reverse ? [...pts].reverse() : pts;
  return `M${pt(p[0])} ${p.slice(1).map((q) => `L${pt(q)}`).join(" ")} Z`;
};

const lock = hex(60, 41, 28); // top cell (locked rule)
const lesson = hex(38, 79.1, 28); // bottom-left cell (approved lesson)
const next = hex(82, 79.1, 26.4); // bottom-right cell (next lesson), drawn as a ring
const d = [path(lock), path(lesson), path(next), path(hex(82, 79.1, 17), true)].join(" ");

const svgFont = `<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"><defs><font id="hivemind" horiz-adv-x="1000">
<font-face font-family="hivemind" units-per-em="1000" ascent="1000" descent="0"/>
<missing-glyph horiz-adv-x="0"/>
<glyph glyph-name="hivemind" unicode="&#xE000;" horiz-adv-x="1000" d="${d}"/>
</font></defs></svg>`;

const ttf = svg2ttf(svgFont, { ts: 0 });
writeFileSync("media/hivemind.woff", Buffer.from(ttf2woff(new Uint8Array(ttf.buffer)).buffer));
console.log("wrote media/hivemind.woff");
