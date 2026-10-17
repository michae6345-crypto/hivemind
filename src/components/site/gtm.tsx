"use client";

import { motion } from "motion/react";
import { cn } from "@/components/hm/utils";

// How Hivemind differs from what teams already use, kept to two things (Adrian, 17 Oct: "way too much going on"):
// where in a change each tool acts, and one line per alternative. Claims follow the team's pitch docs
// (docs/pitch/devpost.md "How it's different", slides.md §6).

const EASE = [0.22, 1, 0.36, 1] as const;

const STOPS = ["Session starts", "Agent writes", "File saved", "PR opened", "Code review"];

/** The life of a change: Hivemind's band covers the first three stops; review bots sit at the end. */
function ChangeTrack() {
  return (
    <div className="relative mx-auto max-w-[880px] pt-10 pb-2">
      <div className="absolute top-[51px] right-[10%] left-[10%] h-[2px] bg-line" />
      <motion.div
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
        className="absolute top-[46px] left-[10%] h-[12px] w-[40%] origin-left rounded-full bg-honey/80"
      />
      <motion.span
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 1.1 }}
        className="absolute top-0 left-[10%] w-[40%] text-center text-[14px] font-semibold text-[#9a6413]"
      >
        Hivemind
      </motion.span>
      <motion.span
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 1.3 }}
        className="absolute top-0 left-[80%] -translate-x-1/2 text-[13px] whitespace-nowrap text-muted"
      >
        review bots
      </motion.span>
      <ol className="relative grid grid-cols-5">
        {STOPS.map((s, i) => (
          <li key={s} className="flex flex-col items-center text-center">
            <span className={cn("size-6 rounded-full border-2 bg-white", i < 3 ? "border-honey" : i === 4 ? "border-fg/40" : "border-line")} />
            <span className="mt-3 text-[12px] leading-tight text-muted sm:text-[13.5px]">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const ROWS: { who: string; tools: string; gap: string }[] = [
  { who: "Review bots", tools: "Greptile, CodeRabbit", gap: "act after a PR is open" },
  { who: "Vendor memory", tools: "Copilot Memory, Cursor rules", gap: "help only their own agent" },
  { who: "Rule files", tools: "CLAUDE.md, AGENTS.md", gap: "hold only what someone wrote down" },
  { who: "Memory libraries", tools: "Mem0, Zep, Letta", gap: "are building blocks, with no approvals" },
];

export function Different() {
  return (
    <div className="mx-auto max-w-[880px]">
      <ChangeTrack />
      <ul className="mt-12 divide-y divide-line border-y border-line">
        {ROWS.map((r, i) => (
          <motion.li
            key={r.who}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, ease: EASE, delay: i * 0.08 }}
            className="flex flex-col gap-0.5 py-4 sm:flex-row sm:items-baseline sm:gap-4"
          >
            <span className="text-[16px] font-medium sm:w-[210px] sm:shrink-0">
              {r.who} <span className="block font-mono text-[12px] font-normal text-muted">{r.tools}</span>
            </span>
            <span className="text-[16px] text-muted">{r.gap}</span>
          </motion.li>
        ))}
        <motion.li
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.35 }}
          className="-mx-4 flex flex-col gap-0.5 rounded-[12px] bg-honey/10 px-4 py-4 sm:flex-row sm:items-baseline sm:gap-4"
        >
          <span className="text-[16px] font-semibold text-[#9a6413] sm:w-[210px] sm:shrink-0">Hivemind</span>
          <span className="text-[16px] text-fg">acts before the agent writes, for every agent, approved by your lead</span>
        </motion.li>
      </ul>
    </div>
  );
}
