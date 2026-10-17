"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/components/hm/utils";
import screens from "./watch-screens.json";
import { TermWindow, type Screen } from "./watch-terminal";
import { LESSON } from "./demo-script";

// "You're the lead": the one thing on the page a visitor does rather than watches. Ben's `hivemind watch` queue
// (rendered from tui-reference.mjs, the same frames as the product) holds Kevin's lesson; pressing a (or the
// button) plays the approve flash, and the team's agents pick the rule up one after another.

const EASE = [0.22, 1, 0.36, 1] as const;
const FRAMES = screens.approve as Screen[]; // waiting, approved flash, approved, gone
const AGENTS = [
  { h: "kevin", tool: "Claude Code" },
  { h: "emily", tool: "Cursor" },
  { h: "tom", tool: "Codex" },
  { h: "lauren", tool: "Gemini CLI" },
  { h: "ben", tool: "Copilot" },
];

type Phase = "waiting" | "flash" | "spreading" | "done";

export function TryApprove() {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.35 });
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [lit, setLit] = useState(0);
  const [hint, setHint] = useState(false);

  const approve = useCallback(() => {
    if (phase !== "waiting") return;
    setPhase("flash");
  }, [phase]);

  // flash -> the card leaves -> agents pick it up one by one
  useEffect(() => {
    if (phase === "flash") {
      const t = setTimeout(() => setPhase("spreading"), reduce ? 0 : 900);
      return () => clearTimeout(t);
    }
    if (phase === "spreading") {
      let n = 0;
      const id = setInterval(
        () => {
          n += 1;
          setLit(n);
          if (n >= AGENTS.length) {
            clearInterval(id);
            setPhase("done");
          }
        },
        reduce ? 0 : 160,
      );
      return () => clearInterval(id);
    }
  }, [phase, reduce]);

  // a / r while the section is on screen (not while typing somewhere)
  useEffect(() => {
    if (!inView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "a" || e.key === "A") approve();
      if ((e.key === "r" || e.key === "R") && phase === "waiting") setHint(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inView, approve, phase]);

  const reset = () => {
    setPhase("waiting");
    setLit(0);
    setHint(false);
  };

  const frame = phase === "waiting" ? FRAMES[0] : phase === "flash" ? FRAMES[1] : FRAMES[3];
  const rules = phase === "spreading" || phase === "done" ? 11 : 10;

  return (
    <div ref={box} className="mx-auto grid max-w-[1120px] items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <TermWindow title="ben — hivemind watch" lines={frame} size="sm" />

      <div className="hm-card p-6">
        <div className="flex items-baseline justify-between">
          <div className="text-[14px] font-medium">Your team&apos;s agents</div>
          <div className="font-mono text-[12.5px] text-muted">
            team rules{" "}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={rules}
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className={cn("inline-block font-semibold tabular-nums", rules === 11 ? "text-honey" : "text-fg")}
              >
                {rules}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {AGENTS.map((a, i) => {
            const on = i < lit;
            return (
              <li key={a.h} className="flex items-center gap-3 rounded-[10px] px-2 py-1.5">
                <svg viewBox="-12 -12 24 24" className="size-6 shrink-0" aria-hidden>
                  <motion.path
                    d="M0-10L8.66-5L8.66 5L0 10L-8.66 5L-8.66-5Z"
                    initial={false}
                    animate={{ fill: on ? "#e09a2b" : "#ffffff", stroke: on ? "#e09a2b" : "#d4d7dd", scale: on ? [1, 1.25, 1] : 1 }}
                    transition={{ duration: 0.45, ease: EASE }}
                    strokeWidth={1.5}
                  />
                </svg>
                <span className="font-mono text-[13.5px]">@{a.h}</span>
                <span className="text-[13px] text-muted">{a.tool}</span>
                <motion.span
                  initial={false}
                  animate={{ opacity: on ? 1 : 0, x: on ? 0 : -6 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="ml-auto rounded-full bg-honey/15 px-2 py-0.5 text-[11.5px] font-medium text-[#9a6413]"
                >
                  knows it
                </motion.span>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 border-t border-line pt-5">
          <div className="text-[13px] text-muted">{phase === "waiting" ? "Waiting on you" : "You approved"}</div>
          <div className="mt-0.5 text-[15px] font-semibold">{LESSON}</div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {phase === "done" ? (
              <>
                <span className="text-[14px] font-medium text-ok">Approved. Every agent has it from its next session.</span>
                <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
                  <RotateCcw className="size-3.5" /> again
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={approve}
                  disabled={phase !== "waiting"}
                  className="hm-pill hm-pill-primary h-11 gap-2.5 px-5 text-[14px] disabled:opacity-60"
                >
                  Approve
                  <kbd className="hidden rounded-[5px] bg-white/15 px-1.5 font-mono text-[12px] sm:inline">a</kbd>
                </button>
                <AnimatePresence>
                  {hint ? (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[13px] text-muted"
                    >
                      r rejects it. This one&apos;s a good lesson, though.
                    </motion.span>
                  ) : (
                    <span className="hidden text-[13px] text-muted sm:inline">or press a</span>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
