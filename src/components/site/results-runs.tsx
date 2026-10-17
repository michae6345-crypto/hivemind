"use client";

import { useRef, type ReactNode } from "react";
import { motion, useInView } from "motion/react";
import { Check, X } from "lucide-react";
import { cn } from "@/components/hm/utils";
import { evalDetail } from "@/mocks/data";
import { Note } from "./notes";

// The eval as what it is: graded runs. One square per run, broken runs first (the order inside a row means nothing).
// Numbers come from evalDetail (eval/results.json).

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" } as const;

/** Runs as a grid of squares: 18 per line for an arm's 36 runs (12 on phones), one line for the 12 held-out runs. */
function Strip({ broke, n, delay, size = "md" }: { broke: number; n: number; delay: number; size?: "md" | "sm" }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  return (
    <div
      ref={ref}
      className={cn("grid w-fit gap-1", size === "md" ? "grid-cols-[repeat(12,18px)] sm:grid-cols-[repeat(18,18px)]" : "grid-cols-[repeat(12,14px)]")}
      role="img"
      aria-label={`${broke} of ${n} runs broke the rule`}
    >
      {Array.from({ length: n }, (_, i) => {
        const bad = i < broke;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: delay + i * 0.025, type: "spring", stiffness: 520, damping: bad ? 14 : 26 }}
            className={cn(
              "flex items-center justify-center rounded-[4px]",
              size === "md" ? "size-[18px]" : "size-[14px]",
              bad ? "bg-lock text-white" : "bg-[#e8f5ed] text-ok shadow-[inset_0_0_0_1px_rgba(46,158,91,.25)]",
            )}
          >
            {bad ? <X className="size-2.5" strokeWidth={3.2} /> : <Check className="size-2.5" strokeWidth={3} />}
          </motion.span>
        );
      })}
    </div>
  );
}

function Row({ name, sub, broke, n, delay, strong, note }: { name: string; sub: string; broke: number; n: number; delay: number; strong?: boolean; note?: ReactNode }) {
  return (
    <div className="grid items-center gap-x-6 gap-y-3 border-t border-line py-6 first:border-t-0 lg:grid-cols-[200px_1fr_150px]">
      <div>
        <div className={cn("text-[15px] font-semibold", !strong && "text-fg/80")}>{name}</div>
        <div className="text-[13px] text-muted">{sub}</div>
      </div>
      <div className="flex items-center gap-2">
        <Strip broke={broke} n={n} delay={delay} />
        {note}
      </div>
      <div className="flex items-baseline gap-1.5 lg:justify-end">
        <span className={cn("font-brand text-[44px] leading-none font-medium tracking-[-0.04em] tabular-nums", broke ? "text-lock" : "text-fg")}>{broke}</span>
        <span className="text-[14px] whitespace-nowrap text-muted">broke it</span>
      </div>
    </div>
  );
}

export function ResultsRuns() {
  const d = evalDetail;
  return (
    <div className="hm-card relative mx-auto max-w-[1000px] px-6 py-4 sm:px-10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-4 text-[12.5px] text-muted" style={MONO}>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-lock" /> broke the team&apos;s rule
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-[#e8f5ed] shadow-[inset_0_0_0_1px_rgba(46,158,91,.25)]" /> followed it
        </span>
        <span className="sm:ml-auto">one square per run · 12 tasks × 3 runs</span>
      </div>

      <Row name="Without Hivemind" sub="the task prompt only" broke={d.targetViolations.off} n={d.n.off} delay={0} />
      {d.targetViolations.placebo != null && d.n.placebo != null ? (
        <Row
          name="Placebo pack"
          sub="12 unrelated lessons, same size"
          broke={d.targetViolations.placebo}
          n={d.n.placebo}
          delay={0.3}
          note={
            <Note dir="left" className="hidden lg:flex" width={150} tone="muted" delay={0.9}>
              extra text alone barely moves it
            </Note>
          }
        />
      ) : null}
      <Row
        name="With Hivemind"
        sub="the team's lessons + 6 distractors"
        broke={d.targetViolations.on}
        n={d.n.on}
        delay={0.6}
        strong
        note={
          <Note dir="left" className="hidden lg:flex" width={150} delay={1.4}>
            zero, every single run
          </Note>
        }
      />

      {d.heldOut?.off && d.heldOut?.on ? (
        <div className="relative mt-2 mb-4 rounded-[14px] bg-elevated p-5">
          <div className="text-[14px] font-semibold">Tasks no lesson was written from</div>
          <div className="text-[13px] text-muted">4 held-out tasks × 3 runs: does a lesson carry over?</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-[12.5px] text-muted">
                Without · <span className="font-semibold text-lock">{d.heldOut.off.targetViolations}</span> of {d.heldOut.off.n} broke it
              </div>
              <Strip broke={d.heldOut.off.targetViolations} n={d.heldOut.off.n} delay={0.2} size="sm" />
            </div>
            <div>
              <div className="mb-2 text-[12.5px] text-muted">
                With Hivemind · <span className="font-semibold text-fg">{d.heldOut.on.targetViolations}</span> of {d.heldOut.on.n}
              </div>
              <div className="flex items-center gap-2">
                <Strip broke={d.heldOut.on.targetViolations} n={d.heldOut.on.n} delay={0.4} size="sm" />
                <Note dir="left" className="hidden sm:flex" width={110} tone="honey" delay={0.8}>
                  it carries over
                </Note>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <p className="border-t border-line py-4 text-[12px] text-muted" style={MONO}>
        {d.model ?? "Claude"} · graded by code, no LLM judge · broken runs drawn first in each row · details in docs/eval.md
      </p>
    </div>
  );
}
