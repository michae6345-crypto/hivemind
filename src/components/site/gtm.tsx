"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Building2, Lock, ShieldCheck, Sparkles, Users } from "lucide-react";
import { cn } from "@/components/hm/utils";
import { evalDetail } from "@/mocks/data";
import { Note } from "./notes";

// The page's last two sections: how Hivemind differs from what teams use today, and how it gets into a company.
// Every claim comes from the team's own pitch docs (docs/pitch/devpost.md "How it's different", slides.md §6,
// judge-qa.md "Most Scalable" + "Who buys it"), so the site says what the judges hear.

const EASE = [0.22, 1, 0.36, 1] as const;

// ── How it's different ──────────────────────────────────────────────────────

const STOPS = ["Agent session starts", "Agent writes code", "File is saved", "PR is opened", "Code review"];

/** The life of a change, left to right: Hivemind's band covers the first three stops; review bots sit at the end. */
function ChangeTrack() {
  return (
    <div className="hm-card relative overflow-hidden px-5 pt-6 pb-7 sm:px-8">
      <div className="font-mono text-[11.5px] text-muted">the life of a change</div>
      <div className="relative mt-10 mb-12">
        {/* the track */}
        <div className="absolute top-[11px] right-[4%] left-[4%] h-[2px] bg-line" />
        {/* Hivemind's band: before the agent writes, and on every save */}
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
          className="absolute top-[7px] left-[4%] h-[10px] w-[50%] origin-left rounded-full bg-honey/80"
        />
        <ol className="relative grid grid-cols-5">
          {STOPS.map((s, i) => (
            <li key={s} className="flex flex-col items-center text-center">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 420, damping: 22 }}
                className={cn(
                  "size-6 rounded-full border-2 bg-white",
                  i < 3 ? "border-honey" : i === 4 ? "border-fg/40" : "border-line",
                )}
              />
              <span className="mt-3 max-w-[11ch] text-[12px] leading-tight text-muted sm:text-[13px]">{s}</span>
            </li>
          ))}
        </ol>
        {/* labels */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 1.1 }}
          className="absolute -top-9 left-[4%] w-[50%] text-center text-[12.5px] font-semibold text-[#9a6413] sm:text-[13.5px]"
        >
          Hivemind acts here
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 1.4 }}
          className="absolute -top-9 right-0 w-[24%] text-center text-[12px] text-muted sm:text-[13px]"
        >
          review bots act here
        </motion.div>
      </div>
      <p className="max-w-[70ch] text-[14.5px] leading-relaxed text-muted">
        <span className="font-medium text-fg">Prevention, not detection.</span> Without the lesson, agents broke the team&apos;s rule in{" "}
        <span className="font-medium text-lock tabular-nums">
          {evalDetail.targetViolations.off} of {evalDetail.n.off}
        </span>{" "}
        runs of our eval. With Hivemind, <span className="font-medium text-ok tabular-nums">{evalDetail.targetViolations.on}</span>, so a
        review bot had nothing left to catch.
      </p>
      <Note dir="up-left" className="absolute right-6 bottom-5 hidden lg:flex" width={180} tone="honey" delay={1.8}>
        before the mistake exists
      </Note>
    </div>
  );
}

const ROWS: { who: string; them: string; us: string }[] = [
  {
    who: "Review bots · Greptile, CodeRabbit",
    them: "Learn from PR comments and act in review, after an agent wrote the code and someone opened a PR.",
    us: "Learns from the corrections inside the agent's chat, which never reach a PR, and puts the lesson in front of the agent before it writes.",
  },
  {
    who: "Vendor memory · Copilot Memory, Cursor rules",
    them: "Each vendor's memory helps only its own agent, one repo at a time.",
    us: "One memory for every agent the team runs: Claude Code, Cursor, Codex, Copilot, Gemini CLI, Windsurf.",
  },
  {
    who: "Rule files · CLAUDE.md, AGENTS.md",
    them: "Hold only what someone remembered to write down, one file per vendor.",
    us: "Learns from every correction and fix, and keeps who taught it and why.",
  },
  {
    who: "Memory infrastructure · Mem0, Zep, Letta",
    them: "Building blocks for one app's or one user's memory.",
    us: "A team product: a lead approves, agents can only propose, and locked rules can't be overridden.",
  },
];

export function Different() {
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
      <ChangeTrack />
      <div className="grid gap-4 md:grid-cols-2">
        {ROWS.map((r, i) => (
          <motion.article
            key={r.who}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: EASE, delay: (i % 2) * 0.08 }}
            whileHover={{ y: -3 }}
            className="hm-card overflow-hidden"
          >
            <div className="border-b border-line px-5 pt-4 pb-3 font-mono text-[12px] text-muted">{r.who}</div>
            <div className="grid sm:grid-cols-2">
              <div className="px-5 py-4 text-[14px] leading-relaxed text-muted">
                <div className="mb-1 text-[11.5px] font-semibold tracking-[0.04em] text-fg/40 uppercase">Them</div>
                {r.them}
              </div>
              <div className="bg-honey/[0.07] px-5 py-4 text-[14px] leading-relaxed text-fg shadow-[inset_2px_0_0_var(--honey)]">
                <div className="mb-1 text-[11.5px] font-semibold tracking-[0.04em] text-[#9a6413] uppercase">Hivemind</div>
                {r.us}
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}

// ── Go to market ────────────────────────────────────────────────────────────

const STEPS: { icon: ReactNode; tag: string; title: string; body: ReactNode }[] = [
  {
    icon: <Users className="size-5" />,
    tag: "Land",
    title: "Free for one team",
    body: (
      <>
        An engineering lead whose team already uses Claude Code or Cursor runs <code className="text-fg">hivemind init</code> on one repo.
        The first buyer is the lead tired of making the same review comment.
      </>
    ),
  },
  {
    icon: <Sparkles className="size-5" />,
    tag: "Spread",
    title: "Every agent, every vendor",
    body: "Each approved lesson reaches every agent on the team, whatever tool they use. The lessons pile up into the company's conventions, with who taught them and why.",
  },
  {
    icon: <ShieldCheck className="size-5" />,
    tag: "Expand",
    title: "Paid when security wants it everywhere",
    body: "Org-wide locked rules, SSO and an audit log, per seat, sold to the platform or security team that already buys seats for Copilot, Cursor and Glean.",
  },
];

const WHY_NOW = [
  { icon: <Building2 className="size-4" />, text: "Engineers run agents from several vendors at once." },
  { icon: <Sparkles className="size-4" />, text: "MCP and agent hooks let one memory plug into all of them." },
  { icon: <Lock className="size-4" />, text: "OWASP's 2026 agentic Top 10 lists memory poisoning (ASI06): shared memory needs governance." },
];

export function GoToMarket() {
  return (
    <div className="mx-auto max-w-[1120px]">
      <ol className="relative grid gap-5 lg:grid-cols-3 lg:gap-10">
        {STEPS.map((s, i) => (
          <li key={s.tag} className="relative">
            {/* a hand-drawn arrow to the next step (wide screens) */}
            {i < STEPS.length - 1 ? (
              <svg viewBox="0 0 60 24" className="absolute top-14 -right-[38px] z-10 hidden h-6 w-[36px] overflow-visible lg:block" fill="none" aria-hidden>
                <motion.path
                  d="M2 14c14-8 30-8 50-2"
                  stroke="var(--honey)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.5 + i * 0.35 }}
                />
                <motion.path
                  d="M45 6l8 6-9 5"
                  stroke="var(--honey)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.25, delay: 1.05 + i * 0.35 }}
                />
              </svg>
            ) : null}
            <motion.article
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.12 }}
              whileHover={{ y: -3 }}
              className={cn("hm-card h-full p-6", i === 2 && "ring-1 ring-honey/40")}
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-[12px] bg-honey/15 text-[#9a6413]">{s.icon}</span>
                <span className="font-mono text-[11.5px] text-muted">
                  0{i + 1} · {s.tag}
                </span>
              </div>
              <h3 className="mt-5 font-brand text-[21px] leading-tight font-medium tracking-[-0.02em]">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
            </motion.article>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-[16px] bg-fg px-6 py-5 text-white sm:px-8">
        <div className="font-mono text-[11.5px] text-white/50">why now</div>
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {WHY_NOW.map((w, i) => (
            <motion.li
              key={w.text}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.12 }}
              className="flex gap-2.5 text-[14px] leading-relaxed text-white/85"
            >
              <span className="mt-0.5 shrink-0 text-honey">{w.icon}</span>
              {w.text}
            </motion.li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-center font-mono text-[11.5px] text-muted">
        The moat: a company&apos;s approved lessons, with who taught them, accumulated over months. Pricing isn&apos;t validated with a customer yet.
      </p>
    </div>
  );
}
