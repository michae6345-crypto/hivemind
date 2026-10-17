"use client";

import { useRef, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/components/hm/utils";
import screens from "./watch-screens.json";
import { TermLine, type Seg, type Screen } from "./watch-terminal";

// "How it works", told once: the real split terminal (Claude Code on the left, `hivemind watch` on the right),
// pinned and played by scroll. The frames are tui-reference.mjs's story() (watch-screens.json), the same strings
// and colours as the product. One caption is lit at a time, and the pane that matters is at full strength while
// the other one dims, so there is only ever one thing to read.
// Desktop only (lg+); smaller screens get <WatchStory /> (it plays by itself) in site.tsx.

type Story = {
  leftCols: number;
  rightCols: number;
  rows: number;
  scenes: { who: string; caption: string; left: Screen }[];
  status: Record<string, Screen>;
  right: Screen[];
  frames: { b: number; n: number; r: number; st: string; ms: number }[];
};
const story = screens.story as Story;

/** Plain-words captions, one per scene, and which pane carries it. */
const STEPS: { title: string; body: string; focus: "left" | "right" }[] = [
  { title: "Kevin corrects his agent", body: "Hivemind saves the correction as a lesson and asks his lead.", focus: "left" },
  { title: "Ben approves it with one key", body: "Agents can only suggest a lesson. A person decides.", focus: "right" },
  { title: "Every agent has it", body: "The team's rule count goes up for every agent's next session.", focus: "right" },
  { title: "Emily's agent gets it right", body: "Her fresh session loads the rule and writes the check first.", focus: "left" },
  { title: "Bad lessons get blocked", body: "A lesson that breaks a locked rule never reaches an agent.", focus: "left" },
];

// Scroll budget: each frame gets scroll in proportion to how long it is held, so reading time stays the same.
const CUM = story.frames.reduce<number[]>((acc, f, i) => [...acc, (acc[i - 1] ?? 0) + f.ms], []);
const TOTAL = CUM[CUM.length - 1];
const P0 = 0.14; // story starts once the headline has gone
const P1 = 0.97;

function frameAt(p: number) {
  const t = Math.min(1, Math.max(0, (p - P0) / (P1 - P0))) * TOTAL;
  const i = CUM.findIndex((c) => c >= t);
  return i < 0 ? story.frames.length - 1 : i;
}

const BLANK: Seg[] = [{ t: " ".repeat(story.leftCols) }];

export function HowItWorksPinned() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Copied into a plain motion value (motion hands transforms taken straight off scrollYProgress to a native scroll
  // timeline with the wrong range), then eased with a spring so a flick of the wheel glides.
  const raw = useMotionValue(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => raw.set(v));
  const p = useSpring(raw, { stiffness: 140, damping: 32, mass: 0.6, restDelta: 0.0005 });
  const [i, setI] = useState(0);
  useMotionValueEvent(p, "change", (v) => {
    const next = frameAt(v);
    setI((prev) => (prev === next ? prev : next));
  });

  const headOpacity = useTransform(p, [0.03, 0.11], [1, 0]);
  const headY = useTransform(p, [0.03, 0.11], [0, -48]);
  const headBlur = useTransform(p, [0.03, 0.11], ["blur(0px)", "blur(10px)"]);
  const stageY = useTransform(p, [0, 0.12], ["26vh", "0vh"], { ease: (t) => 1 - Math.pow(1 - t, 3) });
  const stageScale = useTransform(p, [0, 0.12], [0.9, 1], { ease: (t) => 1 - Math.pow(1 - t, 3) });
  const listOpacity = useTransform(p, [0.08, 0.14], [0, 1]);

  const f = story.frames[i];
  const scene = story.scenes[f.b];
  const step = STEPS[f.b];
  const left = scene.left.slice(0, f.n);
  while (left.length < story.rows - story.status[f.st].length) left.push(BLANK);
  left.push(...story.status[f.st]);
  const right = story.right[f.r];

  return (
    <div ref={ref} className="relative hidden h-[420vh] lg:block">
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden px-4 pt-[92px] pb-8">
        <motion.div style={{ opacity: headOpacity, y: headY, filter: headBlur }} className="absolute inset-x-0 top-[128px] px-4 text-center">
          <h2 className="hm-display text-[48px]">
            How it works.
            <br />
            <span className="tone-2">One correction, every agent.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-[58ch] text-[16px] leading-relaxed text-muted">
            Claude Code on the left, <span className="font-mono text-[15px] text-fg">hivemind watch</span> on the right. Scroll to play it.
          </p>
        </motion.div>

        <motion.div
          style={{ y: stageY, scale: stageScale }}
          className="mx-auto grid w-full max-w-[1280px] flex-1 origin-top grid-cols-[250px_1fr] items-center gap-8"
        >
          <motion.ol style={{ opacity: listOpacity }} className="flex flex-col">
            {STEPS.map((s, b) => (
              <Caption key={s.title} n={b + 1} title={s.title} body={s.body} active={b === f.b} done={b < f.b} p={p} b={b} />
            ))}
          </motion.ol>

          <div className="overflow-hidden rounded-[12px] bg-[#1c1c1e] shadow-[0_0_0_0.5px_rgba(0,0,0,.5),0_40px_90px_-24px_rgba(15,23,42,.5)]">
            <div className="relative flex h-8 items-center gap-[7px] border-b border-black bg-[#2b2b2d] px-3">
              <span className="size-[11px] rounded-full bg-[#ff5f57]" />
              <span className="size-[11px] rounded-full bg-[#febc2e]" />
              <span className="size-[11px] rounded-full bg-[#28c840]" />
              <span className="absolute inset-x-0 text-center text-[12px] text-[#a1a1aa]">{scene.who} — claude | hivemind watch</span>
            </div>
            <div
              className="flex px-3 pt-3 pb-3.5 text-[11.5px] leading-[1.42] text-[#e4e4e7] xl:text-[12.5px]"
              style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, var(--font-geist-mono), monospace' }}
            >
              <Pane lines={left} lit={step.focus === "left"} />
              <div className="mx-[1ch] w-px shrink-0 bg-[#2e2e32]" />
              <Pane lines={right} lit={step.focus === "right"} />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Pane({ lines, lit }: { lines: Screen; lit: boolean }) {
  return (
    <div className={cn("min-w-0 overflow-hidden transition-[opacity,filter] duration-500", lit ? "opacity-100" : "opacity-[0.32] saturate-50")}>
      {lines.map((l, k) => (
        <TermLine key={k} line={l} />
      ))}
    </div>
  );
}

function Caption({ n, title, body, active, done, p, b }: { n: number; title: string; body: string; active: boolean; done: boolean; p: MotionValue<number>; b: number }) {
  const start = P0 + (CUM[story.frames.findIndex((f) => f.b === b)] / TOTAL) * (P1 - P0);
  const lastOf = story.frames.map((f) => f.b).lastIndexOf(b);
  const end = P0 + (CUM[lastOf] / TOTAL) * (P1 - P0);
  const fill = useTransform(p, [start, end], [0, 1]);
  return (
    <li className="border-t border-line py-3.5 first:border-t-0">
      <div className={cn("flex items-baseline gap-3 transition-colors duration-500", active ? "text-fg" : done ? "text-fg/45" : "text-fg/25")}>
        <span className="w-5 font-mono text-[11.5px] tabular-nums">0{n}</span>
        <span className="font-brand text-[18px] leading-tight font-medium tracking-[-0.02em]">{title}</span>
      </div>
      <p className={cn("mt-1 pl-8 text-[13.5px] leading-relaxed text-muted transition-[opacity,filter] duration-500", active ? "opacity-100 blur-0" : "opacity-0 blur-[3px]")}>
        {body}
      </p>
      <div className="mt-2.5 ml-8 h-px bg-line">
        <motion.div style={{ scaleX: fill }} className="h-px origin-left bg-fg/60" />
      </div>
    </li>
  );
}
