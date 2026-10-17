"use client";

import Link from "next/link";
import { Fragment, useRef, type ReactNode } from "react";
import { ArrowRight, Lock, Play, ShieldX } from "lucide-react";
import { MotionConfig, motion, useScroll, useTransform, type Variants } from "motion/react";
import { Logo, Wordmark } from "@/components/hm/bits";
import { WORKS_WITH } from "@/components/hm/activity";
import { evalDetail } from "@/mocks/data";
import { cn } from "@/components/hm/utils";
import { Dither } from "./dither";
import { MacDesktop } from "./mac-desktop";
import { ScrollStory } from "./scroll-story";
import { ChatMock, EditorMock } from "./editor-mocks";
import { LESSON, LOCKED_RULE, PROMPTS } from "./demo-script";

const EASE = [0.22, 1, 0.36, 1] as const;

// Space's hero-rise, measured on spacefs.com: 20px up, 1.1s, staggered ~0.12s.
const rise: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
};

// Space's launcher-word-in: each word sharpens from a blur as it rises.
const word: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

/** The website: the story first (judges land here), then "Open the app" goes to /app. */
export function Site() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative isolate min-h-full overflow-x-clip">
        <Dither />
        <Nav />
        <Hero />
        <HowItWorks />
        <AnyAgent />
        <LockedRules />
        <Results />
        <Closing />
        <Footer />
      </div>
    </MotionConfig>
  );
}

function PillLink({ href, children, primary, className }: { href: string; children: ReactNode; primary?: boolean; className?: string }) {
  const cls = cn("hm-pill h-11 px-5 text-[14px]", primary ? "hm-pill-primary" : "hm-glass hm-pill-glass", className);
  return href.startsWith("#") ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3">
        <a href="#top" aria-label="Hivemind, back to top" className="hm-glass hm-glass-strong flex size-11 items-center justify-center rounded-full">
          <Logo className="size-6" />
        </a>
        <nav className="hm-glass hm-glass-strong hidden items-center gap-1 rounded-full p-1 text-[13.5px] md:flex">
          {[
            ["How it works", "#how"],
            ["Any agent", "#agents"],
            ["Results", "#results"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-4 py-2 text-fg/80 transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-white hover:text-fg"
            >
              {label}
            </a>
          ))}
        </nav>
        <Link href="/app" className="hm-pill hm-pill-primary h-11 px-5 text-[13.5px]">
          Open the app
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  const screen = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: screen, offset: ["start end", "start 0.25"] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  const shadow = useTransform(
    scrollYProgress,
    [0, 1],
    ["0 10px 30px -10px rgba(15,23,42,0.12)", "0 40px 90px -20px rgba(15,23,42,0.35)"],
  );

  return (
    <section id="top" className="px-4 pt-32 sm:pt-40">
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } } }}
        className="mx-auto flex max-w-[880px] flex-col items-center text-center"
      >
        <motion.span variants={rise} className="hm-glass rounded-full px-4 py-1.5 text-[12.5px] text-fg/75">
          {WORKS_WITH}
        </motion.span>
        <h1 className="hm-display mt-7 text-[44px] sm:text-[72px]">
          <motion.span variants={rise} className="block">
            Correct one agent.
          </motion.span>
          <motion.span variants={rise} className="tone-2 block">
            Every agent learns.
          </motion.span>
        </h1>
        <motion.p variants={rise} className="mt-6 max-w-[56ch] text-[16px] leading-relaxed text-muted sm:text-[17px]">
          When an engineer corrects their AI coding agent, Hivemind turns the correction into a lesson. Once a lead
          approves it, every agent on the team starts its next session knowing it.
        </motion.p>
        <motion.div variants={rise} className="mt-8 flex flex-wrap justify-center gap-3">
          {/* TODO: point at the video once it's uploaded. Until then it plays the demo on the screen below. */}
          <PillLink href="#demo" primary>
            <Play className="size-4 fill-current" /> Watch the 2-minute demo
          </PillLink>
          <PillLink href="/app">Open the app</PillLink>
        </motion.div>
      </motion.div>

      <motion.div
        id="demo"
        ref={screen}
        style={{ scale, boxShadow: shadow }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.45 }}
        className="mx-auto mt-16 max-w-[1120px] scroll-mt-24 rounded-[22px]"
      >
        <MacDesktop />
      </motion.div>
    </section>
  );
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionHead({ id, one, two, children }: { id?: string; one: string; two: string; children?: ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
      variants={{ show: { transition: { staggerChildren: 0.045 } } }}
      className="mx-auto max-w-[760px] text-center"
    >
      <h2 id={id} className="hm-display scroll-mt-28 text-[34px] text-balance sm:text-[48px]">
        <Words text={one} />
        <br />
        <span className="tone-2">
          <Words text={two} />
        </span>
      </h2>
      {children ? (
        <motion.p variants={rise} className="mx-auto mt-4 max-w-[58ch] text-[16px] leading-relaxed text-muted">
          {children}
        </motion.p>
      ) : null}
    </motion.div>
  );
}

/** A headline split into words that blur in one after another (the parent sets the stagger). */
function Words({ text }: { text: string }) {
  const words = text.split(" ");
  return words.map((w, i) => (
    <Fragment key={i}>
      <motion.span variants={word} className="inline-block">
        {w}
      </motion.span>
      {i < words.length - 1 ? " " : null}
    </Fragment>
  ));
}

/** A hand-drawn note with a little arrow. At most one per section. */
function Note({ children, className, flip }: { children: ReactNode; className?: string; flip?: boolean }) {
  return (
    <span className={cn("pointer-events-none inline-flex items-end gap-1 text-fg/70", className)} aria-hidden>
      {flip ? <NoteArrow flip /> : null}
      <span className="font-note text-[15px] leading-tight" style={{ fontVariationSettings: "'INFM' 100, 'BNCE' 30" }}>
        {children}
      </span>
      {flip ? null : <NoteArrow />}
    </span>
  );
}

function NoteArrow({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 40 30" className={cn("h-6 w-8 shrink-0", flip && "-scale-x-100")} fill="none">
      <path d="M2 4c12 0 24 6 32 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M27 21l7 4 1-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── How it works ────────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section id="how" className="pt-24 lg:pt-16">
      {/* Desktop: the pinned, scroll-played story. Below lg: the headline and three step cards. */}
      <ScrollStory />
      <div className="px-4 pt-8 lg:hidden">
        <SectionHead one="One correction." two="The whole team learns it.">
          Agents only propose. A person approves. Then it&apos;s in every session.
        </SectionHead>
        <StepCards />
      </div>

      <Reveal className="mx-auto mt-14 max-w-[1120px] px-4 lg:mt-4">
        <HiveStates />
      </Reveal>
    </section>
  );
}

function StepCards() {
  return (
      <div className="mx-auto mt-10 grid max-w-[1120px] gap-5 md:grid-cols-3">
        <Reveal className="hm-card p-6" delay={0}>
          <Step n={1} title="Alex corrects their agent" />
          <div className="mt-4 rounded-[10px] bg-window p-3.5 text-[12px] leading-[1.6] text-[var(--win-text)]" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
            <div className="text-[var(--win-muted)]">&gt; {PROMPTS.alexCorrect}</div>
            <div className="mt-1.5 text-[var(--win-honey)]">📝 Hivemind captured a lesson — pending approval by @jordan</div>
          </div>
        </Reveal>
        <Reveal className="hm-card p-6" delay={0.08}>
          <Step n={2} title="Jordan approves it" />
          <div className="mt-4 rounded-[12px] p-3.5 shadow-[0_0_0_1px_var(--border)]">
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <span className="size-2 rounded-full bg-honey" /> From Alex&apos;s correction
            </div>
            <div className="mt-1.5 text-[14px] font-semibold">{LESSON}</div>
            <div className="mt-3 flex gap-1.5">
              <span className="hm-pill hm-pill-primary h-8 px-3.5 text-[12.5px]">Approve</span>
              <span className="hm-pill hm-glass h-8 px-3.5 text-[12.5px]">Reject</span>
            </div>
          </div>
        </Reveal>
        <Reveal className="hm-card p-6" delay={0.16}>
          <Step n={3} title="Noor's agent gets it right first time" />
          <div className="mt-4 rounded-[10px] bg-window p-3.5 text-[12px] leading-[1.6] text-[var(--win-text)]" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
            <div className="text-[var(--win-muted)]">+ export function writeJsonExport(rows) {"{"}</div>
            <div className="-mx-1 rounded bg-[#f5a52422] px-1 shadow-[inset_2px_0_0_var(--win-honey)]">+   assertSingleCustomer(rows);</div>
            <div className="text-[var(--win-muted)]">+   fs.writeFileSync(path, json);</div>
          </div>
        </Reveal>
      </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-7 items-center justify-center rounded-full bg-fg text-[12.5px] font-semibold text-white">{n}</span>
      <span className="text-[15px] font-semibold">{title}</span>
    </div>
  );
}

// The "three states" hive: at rest → learning → everyone knows.
const R = 15;
const hex = (cx: number, cy: number, r: number) =>
  "M" +
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join("L") +
  "Z";
const W = Math.sqrt(3) * R + 2.5;
const H = 1.5 * R + 2.2;
const CELLS: [number, number][] = [
  [0, 0], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1], [1, -1],
];
const AGENTS: [number, number][] = [
  [-62, -40], [62, -44], [70, 30], [-66, 36], [0, 70], [2, -72],
];

function HiveStates() {
  const states = [
    { label: "At rest", note: "Every agent loads the team's lessons." },
    { label: "Learning", note: "A correction becomes a lesson, waiting on a lead." },
    { label: "Everyone knows", note: "Approved. Every agent has it next session." },
  ];
  return (
    <div className="hm-card grid gap-6 p-6 md:grid-cols-3 md:gap-2">
      {states.map((s, i) => (
        <div key={s.label} className="flex flex-col items-center text-center">
          <svg viewBox="-90 -90 180 180" className="h-40 w-40 overflow-visible" aria-hidden>
            {AGENTS.map(([x, y], k) => (
              <motion.circle
                key={k}
                cx={x}
                cy={y}
                r={4}
                initial={false}
                whileInView={i === 2 ? { fill: ["#d4d7dd", "#e09a2b"] } : undefined}
                viewport={{ once: true }}
                transition={{ delay: 0.9 + k * 0.08, duration: 0.4 }}
                fill={i === 2 ? "#e09a2b" : "#d4d7dd"}
              />
            ))}
            {CELLS.map(([q, r], k) => {
              const x = W * (q + r / 2);
              const y = H * r;
              const isNew = k === 6;
              if (isNew && i === 0) return <path key={k} d={hex(x, y, R)} fill="none" stroke="var(--border)" />;
              if (isNew && i === 1)
                return (
                  <path key={k} d={hex(x, y, R)} fill="#fff" stroke="var(--honey)" strokeWidth={1.4} strokeDasharray="3 2.5" className="hm-cell-wait" />
                );
              const locked = k === 0;
              return (
                <g key={k}>
                  {isNew && i === 2 ? (
                    <motion.path
                      d={hex(x, y, R)}
                      fill="none"
                      stroke="var(--honey)"
                      initial={{ scale: 1, opacity: 0 }}
                      whileInView={{ scale: [1, 3.4], opacity: [0.8, 0] }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.3, delay: 0.5, ease: EASE }}
                      style={{ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" }}
                    />
                  ) : null}
                  <path d={hex(x, y, R)} fill="#fff" stroke={locked ? "var(--chip-lock)" : "var(--honey)"} strokeOpacity={locked ? 0.9 : 0.5} />
                  <path d={hex(x, y, R * (locked ? 0.6 : 0.62))} fill={locked ? "var(--chip-lock)" : "var(--honey)"} />
                </g>
              );
            })}
          </svg>
          <div className="mt-1 text-[14px] font-semibold">
            <span className="mr-1.5 text-muted tabular-nums">{i + 1}.</span>
            {s.label}
          </div>
          <p className="mt-1 max-w-[30ch] text-[13px] text-muted">{s.note}</p>
        </div>
      ))}
    </div>
  );
}

// ── Any agent ───────────────────────────────────────────────────────────────

function AnyAgent() {
  return (
    <section className="px-4 pt-32">
      <SectionHead id="agents" one="It works with any agent." two="In any terminal or editor.">
        Claude Code, Cursor, Gemini CLI, Codex, Copilot and Windsurf read the same lessons through their own hooks and
        MCP. <code className="rounded bg-panel px-1 font-mono text-[14px] text-fg">hivemind init</code> connects a repo to the ones your team
        uses.
      </SectionHead>
      <div className="relative mx-auto mt-14 grid max-w-[1120px] gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Reveal>
          <EditorMock />
        </Reveal>
        <Reveal delay={0.1}>
          <ChatMock />
        </Reveal>
        <Note className="absolute -top-10 left-[30%] hidden lg:flex" flip>
          ghost text, credited to Alex
        </Note>
      </div>
    </section>
  );
}

// ── Locked rules ────────────────────────────────────────────────────────────

function LockedRules() {
  return (
    <section className="px-4 pt-32">
      <SectionHead id="locked" one="Bad lessons don't get in." two="Security locks the rules that matter.">
        Any lesson that contradicts a locked rule is blocked before it reaches a single agent. Nobody below Security
        can override it.
      </SectionHead>
      <Reveal className="mx-auto mt-14 max-w-[900px]">
        <div className="hm-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-6 py-3.5 text-[13.5px]">
            <ShieldX className="size-4 text-danger" />
            <span className="font-semibold text-danger">Blocked by a locked rule</span>
            <span className="text-muted">· Noor&apos;s agent, just now</span>
          </div>
          <div className="grid items-stretch gap-4 p-6 sm:grid-cols-[1fr_auto_1fr]">
            <motion.div
              initial={{ x: 0 }}
              whileInView={{ x: [0, 34, -8, 0] }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.6, times: [0, 0.4, 0.75, 1], delay: 0.5, ease: "easeOut" }}
              className="rounded-[12px] bg-elevated p-4"
            >
              <div className="text-[12px] text-muted">Noor tried to teach</div>
              <p className="mt-1.5 text-[15px] leading-snug">“{PROMPTS.noorBad}”</p>
            </motion.div>
            <div className="flex items-center justify-center">
              <span className="flex size-8 items-center justify-center rounded-full bg-danger/10 text-[11px] font-semibold text-danger">vs</span>
            </div>
            <motion.div
              initial={{ scale: 1 }}
              whileInView={{ scale: [1, 1.04, 1] }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.35, delay: 0.75, ease: "easeOut" }}
              className="rounded-[12px] bg-lock/[0.07] p-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--chip-lock)_35%,transparent)]"
            >
              <div className="flex items-center gap-1.5 text-[12px] text-muted">
                <Lock className="size-3.5 text-lock" /> Locked by Maya, Head of Security
              </div>
              <p className="mt-1.5 text-[15px] leading-snug font-semibold">{LOCKED_RULE}</p>
            </motion.div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ── Results ─────────────────────────────────────────────────────────────────

function Results() {
  const d = evalDetail;
  return (
    <section className="px-4 pt-32">
      <SectionHead id="results" one="Without Hivemind, agents break the rules." two="With it, they don't.">
        We gave Claude 12 coding tasks, 3 runs each, and checked every run with code for the team convention the task
        was built to trip.
      </SectionHead>
      <Reveal className="mx-auto mt-14 max-w-[900px]">
        <div className="hm-card relative p-8 sm:p-10">
          <div className="grid items-end gap-6 sm:grid-cols-[1fr_auto_1fr]">
            <Big label="Without Hivemind" value={d.targetViolations.off} of={d.n.off} muted />
            <ArrowRight className="mx-auto mb-6 hidden size-8 text-muted sm:block" strokeWidth={1.5} />
            <Big label="With Hivemind" value={d.targetViolations.on} of={d.n.on} />
          </div>
          <p className="mt-3 text-[14px] text-muted">runs that broke the team&apos;s convention</p>
          <Note className="absolute top-7 right-8 hidden sm:flex" flip>
            zero, every run
          </Note>
          <div className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
            <div>
              <div className="text-[13px] text-muted">A same-size pack of unrelated lessons</div>
              <div className="mt-1 text-[24px] font-semibold tabular-nums">
                {d.targetViolations.placebo} of {d.n.placebo}
              </div>
              <div className="mt-1 text-[13px] text-muted">So it&apos;s the lessons that help, not extra text.</div>
            </div>
            {d.heldOut?.off && d.heldOut?.on ? (
              <div>
                <div className="text-[13px] text-muted">Lessons used on tasks they weren&apos;t learned from</div>
                <div className="mt-1 text-[24px] font-semibold tabular-nums">
                  {d.heldOut.off.targetViolations} of {d.heldOut.off.n} → {d.heldOut.on.targetViolations} of {d.heldOut.on.n}
                </div>
                <div className="mt-1 text-[13px] text-muted">The lesson carries over.</div>
              </div>
            ) : null}
          </div>
          <p className="mt-6 text-[12px] text-muted">
            n = 12 tasks × 3 runs per arm · {d.model ?? "Claude"} · details in docs/eval.md
          </p>
        </div>
      </Reveal>
    </section>
  );
}

function Big({ label, value, of, muted }: { label: string; value: number; of: number; muted?: boolean }) {
  return (
    <div>
      <div className="text-[14px] text-muted">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn("font-brand text-[88px] leading-[0.9] font-medium tracking-[-0.045em] tabular-nums sm:text-[112px]", muted ? "text-muted" : "text-fg")}>
          {value}
        </span>
        <span className="text-[22px] text-muted">of {of}</span>
      </div>
    </div>
  );
}

// ── Closing ─────────────────────────────────────────────────────────────────

function Closing() {
  return (
    <section className="px-4 pt-36 pb-28">
      <Reveal className="mx-auto flex max-w-[760px] flex-col items-center text-center">
        <h2 className="hm-display text-[38px] sm:text-[56px]">
          Ready to teach
          <br />
          <span className="tone-2">every agent?</span>
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <PillLink href="/app" primary>
            Open the app <ArrowRight className="size-4" />
          </PillLink>
          <PillLink href="#demo">Watch the demo</PillLink>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line/70 px-4 py-8">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-4 text-[12.5px] text-muted">
        <span className="flex items-center gap-2 text-fg">
          <Logo className="size-5" />
          <Wordmark className="text-[17px]" />
        </span>
        <span className="ml-auto">{WORKS_WITH}</span>
      </div>
    </footer>
  );
}
