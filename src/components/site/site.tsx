"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ArrowRight, Lock, ShieldX } from "lucide-react";
import { MotionConfig, motion, type Variants } from "motion/react";
import { Logo, Wordmark } from "@/components/hm/bits";
import { WORKS_WITH } from "@/components/hm/activity";
import { evalDetail } from "@/mocks/data";
import { cn } from "@/components/hm/utils";
import { Dither } from "./dither";
import { HeroHive } from "./hero-hive";
import { HowItWorksPinned, HowItWorksSteps } from "./how-it-works";
import { Progression } from "./progression";
import { Structure } from "./structure";
import { InitMock } from "./live-work";
import { TryApprove } from "./try-approve";
import { Different } from "./gtm";
import { LOCKED_RULE, PROMPTS } from "./demo-script";
import { Note } from "./notes";

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
        <LockedRules />
        <YoureTheLead />
        <UnderHood />
        <Built />
        <GetStarted />
        <WhyUs />
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
        <a href="#top" aria-label="Hivemind, back to top" className="hm-glass hm-glass-strong flex h-11 items-center gap-2 rounded-full pr-4 pl-3">
          <Logo className="size-6" />
          <Wordmark className="text-[19px]" />
        </a>
        <nav className="hm-glass hm-glass-strong hidden items-center gap-1 rounded-full p-1 text-[13.5px] md:flex">
          {[
            ["How it works", "#how"],
            ["While you work", "#hood"],
            ["How it's built", "#built"],
            ["Why Hivemind", "#results"],
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
  return (
    <section id="top" className="px-4 pt-28 sm:pt-32">
      <HeroHive evalOff={evalDetail.targetViolations.off} evalOn={evalDetail.targetViolations.on} runs={evalDetail.n.off} />
      <p className="mx-auto mt-16 max-w-[64ch] text-center font-mono text-[12px] leading-relaxed text-muted">
        We built Hivemind for AI training-data teams like AfterQuery&apos;s. The company in the demo, Meridian Data, is
        fictional.
      </p>
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

/** A section's one headline (the point, in plain words) and an optional line under it. */
function SectionHead({ id, title, children, width = 1120 }: { id?: string; title: string; children?: ReactNode; width?: number }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
      variants={{ show: { transition: { staggerChildren: 0.045 } } }}
      className="mx-auto"
      style={{ maxWidth: width }}
    >
      <h2 id={id} className="hm-display max-w-[22ch] scroll-mt-28 text-[30px] text-balance sm:text-[44px]">
        <Words text={title} />
      </h2>
      {children ? (
        <motion.p variants={rise} className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-muted sm:text-[17px]">
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

// ── How it works ────────────────────────────────────────────────────────────

// The story is told once: the split terminal (Claude Code | hivemind watch), pinned and played by scroll on desktop,
// playing by itself on smaller screens.
function HowItWorks() {
  return (
    <section id="how" className="pt-24 lg:pt-16">
      <HowItWorksPinned />
      <div className="px-4 pt-8 lg:hidden">
        <SectionHead title="One correction reaches every agent.">
          Five steps, from Kevin&apos;s correction to a bad lesson that gets blocked.
        </SectionHead>
        <div className="mt-10">
          <HowItWorksSteps />
        </div>
      </div>
    </section>
  );
}

// The small hive in the closing section.
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

// ── Locked rules ────────────────────────────────────────────────────────────

function LockedRules() {
  return (
    <section className="px-4 pt-32">
      <SectionHead id="locked" title="Bad lessons never reach an agent." width={900}>
        Security locks the rules that matter. A lesson that contradicts one is blocked, and nobody below Security can
        change it.
      </SectionHead>
      <Reveal className="mx-auto mt-14 max-w-[900px]">
        <div className="hm-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-6 py-3.5 text-[13.5px]">
            <ShieldX className="size-4 text-danger" />
            <span className="font-semibold text-danger">Blocked by a locked rule</span>
            <span className="text-muted">· @emily&apos;s agent, just now</span>
          </div>
          <div className="grid items-stretch gap-4 p-6 sm:grid-cols-[1fr_auto_1fr]">
            <motion.div
              initial={{ x: 0 }}
              whileInView={{ x: [0, 34, -8, 0] }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.6, times: [0, 0.4, 0.75, 1], delay: 0.5, ease: "easeOut" }}
              className="relative rounded-[12px] bg-elevated p-4"
            >
              <div className="text-[12px] text-muted">@emily tried to teach</div>
              <p className="mt-1.5 text-[15px] leading-snug text-fg/70 line-through decoration-lock/50">“{PROMPTS.noorBad}”</p>
              <motion.span
                initial={{ opacity: 0, scale: 1.8, rotate: -14 }}
                whileInView={{ opacity: 1, scale: 1, rotate: -9 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ delay: 1.0, type: "spring", stiffness: 420, damping: 16 }}
                className="absolute -top-3 right-3 rounded-[6px] border-2 border-lock bg-white/80 px-2 py-0.5 text-[13px] font-bold tracking-[0.14em] text-lock"
                style={{ fontFamily: "var(--font-geist-mono), monospace" }}
                aria-hidden
              >
                BLOCKED
              </motion.span>
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
                <Lock className="size-3.5 text-lock" /> Locked by @greg, Head of Security
              </div>
              <p className="mt-1.5 text-[15px] leading-snug font-semibold">{LOCKED_RULE}</p>
            </motion.div>
          </div>
        </div>
        <div className="relative hidden h-16 lg:block">
          <Note dir="up-left" className="absolute top-1 left-[8%]" width={250} tone="rose" delay={1.2}>
            a model and a plain-code guard both check. either one can block it
          </Note>
        </div>
      </Reveal>
    </section>
  );
}

// ── You're the lead ─────────────────────────────────────────────────────────

function YoureTheLead() {
  return (
    <section className="px-4 pt-32">
      <SectionHead id="try" title="You're the lead. Approve it.">
        Kevin&apos;s correction is waiting in your queue. Press <kbd className="rounded-[5px] bg-panel px-1.5 font-mono text-[14px] text-fg shadow-[0_0_0_1px_var(--border)]">a</kbd> (or
        tap Approve), the same key as in <code className="font-mono text-[15px] text-fg">hivemind watch</code>.
      </SectionHead>
      <div className="mt-12">
        <TryApprove />
      </div>
    </section>
  );
}

// ── Under the hood ──────────────────────────────────────────────────────────

function UnderHood() {
  return (
    <section className="px-4 pt-32">
      <SectionHead id="hood" title="What happens while you work.">
        One afternoon on the export service, in order. All of it in the terminal, next to whichever agent you use.
      </SectionHead>
      <div className="mt-16">
        <Progression />
      </div>
    </section>
  );
}

// ── How it's built ─────────────────────────────────────────────────────────

// Back by request (17 Oct): where lessons live and who controls them, at three zoom levels.
function Built() {
  return (
    <section className="px-4 pt-32">
      <SectionHead id="built" title="Lessons live where they apply.">
        Company rules reach everyone, team lessons reach the team, and your own stay yours. Zoom from the company to one lesson.
      </SectionHead>
      <Reveal className="mt-12">
        <Structure />
      </Reveal>
    </section>
  );
}

// ── How it's different / go to market ──────────────────────────────────────
// (Replaced the eval cards on 17 Oct: Adrian wanted competitors and GTM at the end. The 22 -> 0 eval line lives in
// Different as "prevention, not detection"; #results stays the anchor the hero links to.)

function WhyUs() {
  return (
    <section className="px-4 pt-32">
      <SectionHead id="results" title="Before the agent writes, not after review.">
        Other tools catch a mistake after it&apos;s written, or only for one vendor&apos;s agent.
      </SectionHead>
      <div className="mt-12">
        <Different />
      </div>
    </section>
  );
}

// ── Get started ─────────────────────────────────────────────────────────────

function GetStarted() {
  return (
    <section className="px-4 pt-32">
      <SectionHead id="start" title="Set up in one command.">
        <code className="rounded bg-panel px-1 font-mono text-[15px] text-fg">hivemind init</code> finds the agents a repo already uses and
        connects each one. Then type <code className="rounded bg-panel px-1 font-mono text-[15px] text-fg">!hivemind</code> in Claude Code to
        open watch next to it.
      </SectionHead>
      <Reveal className="relative mx-auto mt-12 max-w-[1120px]">
        <InitMock />
        <Note dir="up-left" className="absolute -bottom-12 left-[24%] hidden lg:flex" width={260} delay={0.4}>
          it finds them by the files already in the repo
        </Note>
      </Reveal>
    </section>
  );
}

// ── Closing ─────────────────────────────────────────────────────────────────

function Closing() {
  return (
    <section className="px-4 pt-36 pb-28">
      <Reveal className="mx-auto flex max-w-[760px] flex-col items-center text-center">
        <div className="relative mb-8">
          <svg viewBox="-60 -50 120 100" className="h-28 w-36 overflow-visible" aria-hidden>
            {CELLS.map(([q, r], k) => {
              const x = W * (q + r / 2);
              const y = H * r;
              if (k === 6)
                return <path key={k} d={hex(x, y, R)} fill="#fff" stroke="var(--honey)" strokeWidth={1.4} strokeDasharray="3 2.5" className="hm-cell-wait" />;
              const locked = k === 0;
              return (
                <motion.g
                  key={k}
                  initial={{ opacity: 0, scale: 0.4 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 + k * 0.08, type: "spring", stiffness: 420, damping: 18 }}
                  style={{ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" }}
                >
                  <path d={hex(x, y, R)} fill="#fff" stroke={locked ? "var(--chip-lock)" : "var(--honey)"} strokeOpacity={locked ? 0.9 : 0.5} />
                  <path d={hex(x, y, R * 0.62)} fill={locked ? "var(--chip-lock)" : "var(--honey)"} />
                </motion.g>
              );
            })}
          </svg>
          <Note dir="left" className="absolute top-0 left-[118px] hidden w-max sm:flex" width={170} delay={0.9}>
            your team&apos;s first lesson goes here
          </Note>
        </div>
        <h2 className="hm-display text-[38px] sm:text-[56px]">Correct it once.</h2>
        <p className="mt-3 text-[17px] text-muted">Every agent on your team remembers.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <PillLink href="/app" primary>
            Open the app <ArrowRight className="size-4" />
          </PillLink>
          <PillLink href="#how">See how it works</PillLink>
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
