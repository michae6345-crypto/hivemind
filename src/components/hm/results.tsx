"use client";

import { motion } from "motion/react";
import { useHivemind } from "./store";
import { Hive, HiveLegend } from "./hex";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Results: the real replay eval first, then the hive of lessons every agent shares. */
export function Results() {
  const { evalDetail: d, metrics, metricsLive, memories } = useHivemind();
  const tv = d.targetViolations;
  const held = d.heldOut;
  const tasks = metrics.eval?.tasks ?? 12;
  const runs = metrics.eval?.runs ?? 3;

  const active = memories.filter((m) => m.status === "active");
  const locked = active.filter((m) => m.locked).length;
  const waiting = memories.filter((m) => m.status === "pending").length;
  const blocked = memories.filter((m) => m.status === "blocked").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1040px] px-8 py-12">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: EASE }}
          className="hm-display text-[44px]"
        >
          Without Hivemind, agents break the rules.
          <br />
          <span className="tone-2">With it, they don&apos;t.</span>
        </motion.h1>
        <p className="mt-4 max-w-[62ch] text-[15px] text-muted">
          We replayed {tasks} coding tasks {runs} times each with {d.model ?? "Claude"}, and checked every run with
          code for the team conventions the task was built to trip.
        </p>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
          className="hm-card relative mt-9 p-8"
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-8">
            <Big label="Without Hivemind" value={tv.off} of={d.n.off} muted />
            <Arrow />
            <Big label="With Hivemind" value={tv.on} of={d.n.on} />
          </div>
          <p className="mt-3 text-[13px] text-muted">runs that broke the team&apos;s convention</p>

          <svg
            className="pointer-events-none absolute top-6 right-8 hidden h-14 w-36 text-muted lg:block"
            viewBox="0 0 144 56"
            fill="none"
            aria-hidden
          >
            <path d="M120 10c-14 2-34 10-48 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M70 31l1 9 8-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span
            className="absolute top-2 right-6 hidden rotate-[-3deg] font-note text-[15px] text-fg/70 lg:block"
            style={{ fontVariationSettings: "'INFM' 100, 'BNCE' 30" }}
          >
            every run followed the rules
          </span>

          <dl className="mt-7 grid grid-cols-2 gap-6 border-t border-line pt-6">
            {tv.placebo !== null ? (
              <Line
                term="A same-size pack of unrelated lessons"
                detail={`${tv.placebo} of ${d.n.placebo}`}
                note="So it's the lessons that help, not extra text."
              />
            ) : null}
            {held?.off && held?.on ? (
              <Line
                term="Lessons learned on one task, used on different tasks"
                detail={`${held.off.targetViolations} of ${held.off.n} → ${held.on.targetViolations} of ${held.on.n}`}
                note="The lesson carries over to work it wasn't written for."
              />
            ) : null}
          </dl>
          {!metricsLive ? (
            <p className="mt-6 text-[11.5px] text-muted">Snapshot of eval/results.json. It refreshes when the API answers.</p>
          ) : null}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="hm-card mt-6 p-8"
        >
          <h2 className="hm-display text-[26px]">
            The hive. <span className="tone-2">One cell per lesson.</span>
          </h2>
          <p className="mt-2 text-[14px] text-muted">
            {active.length} lessons every agent shares, {locked} locked at the core. {waiting} waiting for approval
            {blocked ? `, ${blocked} blocked` : ""}.
          </p>
          <Hive className="mt-4 h-[340px]" />
          <HiveLegend />
        </motion.section>
      </div>
    </div>
  );
}

function Big({ label, value, of, muted }: { label: string; value: number; of: number; muted?: boolean }) {
  return (
    <div>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={`font-brand text-[84px] leading-[0.9] font-medium tracking-[-0.045em] tabular-nums ${muted ? "text-muted" : "text-fg"}`}
        >
          {value}
        </span>
        <span className="text-[20px] text-muted">of {of}</span>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 48 16" className="mb-7 w-12 text-muted" fill="none" aria-hidden>
      <path d="M2 8h42M37 2l7 6-7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Line({ term, detail, note }: { term: string; detail: string; note: string }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{term}</dt>
      <dd className="mt-1 text-[22px] font-semibold tracking-[-0.01em] tabular-nums">{detail}</dd>
      <dd className="mt-1 text-[13px] text-muted">{note}</dd>
    </div>
  );
}
