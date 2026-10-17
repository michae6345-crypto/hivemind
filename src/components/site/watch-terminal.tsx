"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { cn } from "@/components/hm/utils";
import screens from "./watch-screens.json";

// `hivemind watch` on the website. The lines come from public/brand/terminal/tui-reference.mjs (the same renderer
// Michael's CLI follows), rendered by render-mock.mjs into watch-screens.json with the site's demo names. Don't edit
// the JSON by hand: change the reference and re-run render-mock.mjs.

export type Seg = { t: string; fg?: string; bg?: string; bold?: boolean; ul?: boolean };
export type Screen = Seg[][];

const MONO = { fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, var(--font-geist-mono), monospace' } as const;
// Glyphs browsers draw from fallback fonts at their own widths; pinned to one cell so the grid holds.
const PIN = /([⬢●○▎⏺⎿‹›…▍✻])/;

export function TermLine({ line }: { line: Seg[] }) {
  return (
    <div className="min-h-[1.4em] whitespace-pre">
      {line.map((x, i) => {
        const style: CSSProperties = {
          color: x.fg,
          background: x.bg,
          fontWeight: x.bold ? 700 : undefined,
          textDecoration: x.ul ? "underline" : undefined,
          textUnderlineOffset: x.ul ? 3 : undefined,
        };
        return (
          <span key={i} style={style}>
            {x.t.split(PIN).map((part, j) =>
              PIN.test(part) && part.length === 1 ? (
                <span key={j} className="inline-block w-[1ch] text-center">
                  {part}
                </span>
              ) : (
                part
              ),
            )}
          </span>
        );
      })}
    </div>
  );
}

export function TermWindow({ title, lines, className, size = "md" }: { title: string; lines: Screen; className?: string; size?: "md" | "sm" }) {
  return (
    <div className={cn("overflow-hidden rounded-[12px] bg-[#1c1c1e] shadow-[0_0_0_0.5px_rgba(0,0,0,.5),0_30px_70px_-20px_rgba(15,23,42,.45)]", className)}>
      <div className="relative flex h-7 items-center gap-[7px] border-b border-black bg-[#2b2b2d] px-2.5">
        <span className="size-[11px] rounded-full bg-[#ff5f57]" />
        <span className="size-[11px] rounded-full bg-[#febc2e]" />
        <span className="size-[11px] rounded-full bg-[#28c840]" />
        <span className="absolute inset-x-0 text-center text-[11.5px] text-[#a1a1aa]">{title}</span>
      </div>
      <div
        className={cn("overflow-x-auto px-3 pt-2.5 pb-3 leading-[1.4] text-[#e4e4e7]", size === "md" ? "text-[10.5px] sm:text-[12px]" : "text-[10.5px] sm:text-[11.5px]")}
        style={MONO}
      >
        {lines.map((l, i) => (
          <TermLine key={i} line={l} />
        ))}
      </div>
    </div>
  );
}

/** The celebration, played once when it scrolls into view (90 ms a frame, like the CLI), then held. */
function Celebration() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const frames = screens.celebrate as Screen[];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let n = 0;
    const id = setInterval(() => {
      n = reduce ? frames.length - 1 : Math.min(frames.length - 1, n + 1);
      setI(n);
      if (n === frames.length - 1) clearInterval(id);
    }, 90);
    return () => clearInterval(id);
  }, [inView, frames.length]);
  return (
    <div ref={ref}>
      <TermWindow title="hivemind watch" lines={frames[i]} size="sm" />
    </div>
  );
}

type Story = {
  leftCols: number;
  rows: number;
  scenes: { who: string; caption: string; left: Screen }[];
  status: Record<string, Screen>;
  right: Screen[];
  frames: { b: number; n: number; r: number; st: string; ms: number }[];
};
const story = screens.story as Story;
const FIRST = story.scenes.map((_, b) => story.frames.findIndex((f) => f.b === b));
const BLANK: Seg[] = [{ t: " ".repeat(story.leftCols) }];
const DIVIDER: Seg = { t: " │ ", fg: "#2E2E32" };

/** One frame of the split: Claude Code's transcript so far on the left, `hivemind watch` on the right. */
function storyLines(i: number): Screen {
  const f = story.frames[i];
  const left = story.scenes[f.b].left.slice(0, f.n);
  while (left.length < story.rows - 4) left.push(BLANK);
  left.push(...story.status[f.st]);
  return left.map((l, row) => [...l, DIVIDER, ...story.right[f.r][row]]);
}

/**
 * The loop Michael asked for (17 Oct): @kevin corrects his agent → @ben approves with `a` → the celebration →
 * @emily's fresh session writes the check first → her bad lesson hits @greg's lock. Plays only while on screen.
 * Reduced motion (and the server render) shows the last frame, the blocked lesson. The captions jump to a scene.
 */
export function WatchStory() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const last = story.frames.length - 1;
  const [i, setI] = useState(last);
  const reduce = useReducedMotion();
  const play = inView && !reduce;
  const started = useRef(false);
  useEffect(() => {
    if (!play) return;
    // The first time it comes on screen, rewind from the held last frame to the start of the story.
    const first = !started.current;
    started.current = true;
    const t = setTimeout(() => setI((x) => (first ? 0 : (x + 1) % story.frames.length)), first ? 300 : story.frames[i].ms);
    return () => clearTimeout(t);
  }, [i, play]);
  const scene = story.frames[i].b;
  return (
    <div ref={ref} className="mx-auto max-w-[1120px]">
      <TermWindow title={`${story.scenes[scene].who} — claude | hivemind watch`} lines={storyLines(i)} />
      <ol className="mt-5 flex flex-wrap justify-center gap-1.5 text-[13px]">
        {story.scenes.map((x, b) => (
          <li key={b}>
            <button
              type="button"
              onClick={() => setI(FIRST[b])}
              aria-current={b === scene ? "step" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5",
                b === scene ? "bg-fg text-white" : "text-muted hover:bg-black/5 hover:text-fg",
              )}
            >
              <span className="mr-1.5 font-mono text-[11px] opacity-60">{b + 1}</span>
              {x.caption}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function WatchSplit({ notes }: { notes?: ReactNode }) {
  return (
    <div className="relative mx-auto max-w-[1120px]">
      <TermWindow title="export-service — claude | hivemind watch" lines={screens.split as Screen} />
      {notes}
    </div>
  );
}

export function WatchPair() {
  return (
    <div className="mx-auto grid max-w-[1120px] gap-6 lg:grid-cols-[1.15fr_1fr]">
      <TermWindow title="hivemind watch" lines={screens.here as Screen} size="sm" />
      <div className="flex flex-col justify-center">
        <Celebration />
      </div>
    </div>
  );
}
