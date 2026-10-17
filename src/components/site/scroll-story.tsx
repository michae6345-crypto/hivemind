"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import { Logo } from "@/components/hm/bits";
import { cn } from "@/components/hm/utils";
import { HIVE, LESSON, PROMPTS, REPO, SCENES } from "./demo-script";

// "How it works" as a pinned, scroll-scrubbed scene, the way spacefs.com runs its Finder story: the stage sticks
// for ~3 screens, the window rises and settles while the headline blurs away, then each step plays as you scroll
// (text types out, a cursor glides to Approve and clicks), and scrolling back plays it in reverse.
// Desktop only (lg+); smaller screens get the three step cards in site.tsx.
//
// Scroll map, 0..1 across the section:
//   0.00–0.20  the window rises from below and grows; 0.08–0.20 the headline lifts and blurs out
//   0.20–0.46  step 1: Alex's correction types out, then Hivemind captures the lesson
//   0.46–0.72  step 2: the lesson lands in Approvals, the cursor glides to Approve and clicks at 0.62
//   0.72–1.00  step 3: Noor's agent loads one more rule and writes assertSingleCustomer() first

const EASE = [0.22, 1, 0.36, 1] as const;
const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" } as const;
const RULES_BEFORE = SCENES[0].rules;
const RULES_AFTER = SCENES[1].rules;
const NOOR_DIFF = SCENES[1].steps.find((s) => s.kind === "diff")!.lines;
/** Alex's "lesson captured" line, exactly as the Terminal demo prints it. */
const CAPTURED = SCENES[0].steps.find((s) => s.kind === "hook" && s.text.startsWith("📝"));

const STEPS = [
  { title: "Alex corrects their agent", body: "One correction in plain English. Hivemind turns it into a lesson.", from: 0.2, to: 0.46 },
  { title: "Jordan approves it", body: "Agents only propose. A lead approves before anything spreads.", from: 0.46, to: 0.72 },
  { title: "Noor's agent gets it right", body: "Every agent starts its next session with the lesson, credited to Alex.", from: 0.72, to: 1 },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** Everything discrete in the scene, derived from scroll progress. Re-renders only when one of these changes. */
function frameAt(p: number) {
  return {
    step: p < 0.46 ? 0 : p < 0.72 ? 1 : 2,
    typedA: Math.round(span(p, 0.24, 0.37) * PROMPTS.alexCorrect.length),
    captured: p > 0.4,
    landed: p > 0.5,
    pressing: p > 0.6 && p <= 0.62,
    clicked: p > 0.62,
    typedC: Math.round(span(p, 0.75, 0.83) * PROMPTS.noorAsk.length),
    diff: Math.floor(span(p, 0.85, 0.93) * (NOOR_DIFF.length + 0.99)),
    lit: p > 0.94,
  };
}
type Frame = ReturnType<typeof frameAt>;
const same = (a: Frame, b: Frame) => (Object.keys(a) as (keyof Frame)[]).every((k) => a[k] === b[k]);

export function ScrollStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Copied into a plain motion value: transforms taken straight off scrollYProgress get handed to a native scroll
  // timeline with a different range, and the headline drifted back in late in the scroll.
  const p = useMotionValue(0);
  const [f, setF] = useState<Frame>(() => frameAt(0));
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    p.set(v);
    const next = frameAt(v);
    setF((prev) => (same(prev, next) ? prev : next));
  });

  // The headline lifts and blurs out as the window takes the stage.
  const headOpacity = useTransform(p, [0.08, 0.2], [1, 0]);
  const headY = useTransform(p, [0.08, 0.2], [0, -48]);
  const headBlur = useTransform(p, [0.08, 0.2], ["blur(0px)", "blur(10px)"]);
  // The stage rises from under the headline and grows to full size.
  const stageY = useTransform(p, [0, 0.2], ["34vh", "0vh"], { ease: easeOutCubic });
  const stageScale = useTransform(p, [0, 0.2], [0.9, 1], { ease: easeOutCubic });
  const listOpacity = useTransform(p, [0.12, 0.22], [0, 1]);
  // The cursor's glide to Approve, relative to the button: in from the lower right, settle, press, drift off.
  const curX = useTransform(p, [0.5, 0.6, 0.66, 0.72], [300, 26, 26, 70], { ease: easeOutCubic });
  const curY = useTransform(p, [0.5, 0.6, 0.66, 0.72], [190, 14, 14, 60], { ease: easeOutCubic });
  const curOpacity = useTransform(p, [0.5, 0.53, 0.68, 0.72], [0, 1, 1, 0]);

  const rules = f.clicked ? RULES_AFTER : RULES_BEFORE;

  return (
    <div ref={ref} className="relative hidden h-[340vh] lg:block">
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden px-4 pt-[96px] pb-10">
        <motion.div style={{ opacity: headOpacity, y: headY, filter: headBlur }} className="absolute inset-x-0 top-[132px] px-4 text-center">
          <h2 className="hm-display text-[48px]">
            One correction.
            <br />
            <span className="tone-2">The whole team learns it.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-[58ch] text-[16px] leading-relaxed text-muted">
            Agents only propose. A person approves. Then it&apos;s in every session.
          </p>
        </motion.div>

        <motion.div
          style={{ y: stageY, scale: stageScale }}
          className="mx-auto grid w-full max-w-[1120px] flex-1 origin-top grid-cols-[300px_1fr] items-center gap-12"
        >
          <motion.ol style={{ opacity: listOpacity }} className="flex flex-col">
            {STEPS.map((s, i) => (
              <StepRow key={s.title} n={i + 1} title={s.title} body={s.body} active={f.step === i} progress={p} from={s.from} to={s.to} />
            ))}
          </motion.ol>

          <div className="relative h-[min(470px,62svh)]">
            {/* 1. Alex's terminal */}
            <Pane on={f.step === 0}>
              <Term title={`alex — claude — ${REPO}`} rules={RULES_BEFORE}>
                <Hook>{HIVE.sessionLoaded(RULES_BEFORE, 2)}</Hook>
                <Prompt>{PROMPTS.alexAsk}</Prompt>
                <Tool name="Update" arg="src/export.ts" result="Updated src/export.ts with 5 additions" />
                <div className="mt-1 ml-4 rounded bg-[#1f3a24]/60 px-2 py-1 text-[#9fe2b0]">
                  + export function writeCsvExport(rows: Row[], path: string) {"{ … }"}
                </div>
                <Prompt typing={f.typedA < PROMPTS.alexCorrect.length}>{PROMPTS.alexCorrect.slice(0, f.typedA)}</Prompt>
                <BlurIn show={f.captured}>
                  <Hook>{CAPTURED?.kind === "hook" ? CAPTURED.text : HIVE.lessonCaptured(LESSON, "@jordan")}</Hook>
                </BlurIn>
              </Term>
            </Pane>

            {/* 2. Jordan's approval queue (the web app, a light window) */}
            <Pane on={f.step === 1}>
              <div className="flex h-full flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,.12),0_30px_70px_-18px_rgba(0,0,0,.26),0_10px_24px_-12px_rgba(0,0,0,.14)]">
                <div className="relative flex h-11 shrink-0 items-center border-b border-line px-4">
                  <span className="flex gap-2">
                    <span className="size-3 rounded-full bg-[#ff5f57]" />
                    <span className="size-3 rounded-full bg-[#febc2e]" />
                    <span className="size-3 rounded-full bg-[#28c840]" />
                  </span>
                  <span className="absolute inset-x-0 flex items-center justify-center gap-2 text-[13px] font-medium">
                    <Logo className="size-4" /> Approvals
                    <span className="rounded-full bg-elevated px-2 text-[11.5px] text-muted tabular-nums">
                      {f.clicked ? 0 : f.landed ? 1 : 0} waiting
                    </span>
                  </span>
                  <RuleCount rules={rules} className="ml-auto text-fg/70" />
                </div>
                <div className="relative flex-1 bg-bg p-6">
                  <AnimatePresence>
                    {f.landed ? (
                      <motion.div
                        initial={{ opacity: 0, y: -18, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        className="hm-card mx-auto max-w-[520px] p-5"
                      >
                        <div className="flex items-center gap-2 text-[12.5px] text-muted">
                          <span className="size-2 rounded-full bg-honey" /> From Alex&apos;s correction
                          <span className="hm-chip ml-auto" data-kind="repo">#repo/{REPO}</span>
                        </div>
                        <div className="mt-2 text-[17px] font-semibold">{LESSON}</div>
                        <p className="mt-1 text-[13.5px] text-muted">Proposed by Alex&apos;s Claude Code agent · just now</p>
                        <div className="mt-4 h-9">
                          <AnimatePresence mode="wait" initial={false}>
                            {f.clicked ? (
                              <motion.div
                                key="ok"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.35, ease: EASE }}
                                className="flex h-9 items-center gap-2 text-[14px] font-medium text-ok"
                              >
                                <span className="flex size-6 items-center justify-center rounded-full bg-ok text-white">
                                  <Check className="size-3.5" strokeWidth={3} />
                                </span>
                                Approved by Jordan · in every agent&apos;s next session
                              </motion.div>
                            ) : (
                              <motion.div key="ask" exit={{ opacity: 0, transition: { duration: 0.15 } }} className="relative flex gap-2">
                                <span className={cn("hm-pill hm-pill-primary h-9 px-4 text-[13px] transition-transform duration-150", f.pressing && "scale-95")}>
                                  Approve
                                </span>
                                <span className="hm-pill hm-glass h-9 px-4 text-[13px]">Reject</span>
                                <Cursor x={curX} y={curY} opacity={curOpacity} />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {/* The approval toast slides in from the top right. */}
                  <AnimatePresence>
                    {f.clicked ? (
                      <motion.div
                        initial={{ opacity: 0, x: 60, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        className="absolute right-4 bottom-4 flex items-center gap-2.5 rounded-[14px] bg-white p-3 pr-4 shadow-[0_0_0_1px_rgba(14,15,18,.06),0_12px_30px_-8px_rgba(15,23,42,.25)]"
                      >
                        <span className="flex size-8 items-center justify-center rounded-[9px] bg-fg">
                          <Logo onDark className="size-4.5" />
                        </span>
                        <span className="text-[12.5px] leading-snug">
                          <span className="font-semibold">Lesson approved</span>
                          <br />
                          <span className="text-fg/70">
                            #repo/{REPO} now has {RULES_AFTER} rules
                          </span>
                        </span>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </Pane>

            {/* 3. Noor's terminal, one rule richer */}
            <Pane on={f.step === 2}>
              <Term title={`noor — claude — ${REPO}`} rules={RULES_AFTER}>
                <Hook>{HIVE.sessionLoaded(RULES_AFTER, 2)}</Hook>
                <Prompt typing={f.typedC > 0 && f.typedC < PROMPTS.noorAsk.length}>{PROMPTS.noorAsk.slice(0, f.typedC)}</Prompt>
                <BlurIn show={f.diff > 0}>
                  <Tool name="Update" arg="src/export.ts" result="Updated src/export.ts with 4 additions" />
                </BlurIn>
                <div className="mt-1 ml-4 space-y-px">
                  {NOOR_DIFF.slice(0, f.diff).map((l) => (
                    <motion.div
                      key={l.text}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className={cn(
                        "flex items-center gap-3 rounded px-2 py-0.5 whitespace-pre text-[#9fe2b0] transition-colors duration-500",
                        l.mark ? (f.lit ? "bg-[#f5a52426] text-[var(--win-honey)] shadow-[inset_2px_0_0_var(--win-honey)]" : "bg-[#1f3a24]/60") : "bg-[#1f3a24]/60",
                      )}
                    >
                      {l.sign} {l.text}
                      {l.mark ? (
                        <motion.span
                          animate={{ opacity: f.lit ? 1 : 0, x: f.lit ? 0 : -6 }}
                          transition={{ duration: 0.4, ease: EASE }}
                          className="ml-auto rounded bg-[var(--win-honey)] px-1.5 text-[11px] font-medium text-[#1c1c1e]"
                        >
                          Hivemind · {l.mark}
                        </motion.span>
                      ) : null}
                    </motion.div>
                  ))}
                </div>
              </Term>
            </Pane>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/** A row in the step list, Space-style: the active step in ink with its line open, the rest faded. */
function StepRow({ n, title, body, active, progress, from, to }: { n: number; title: string; body: string; active: boolean; progress: MotionValue<number>; from: number; to: number }) {
  const fill = useTransform(progress, [from, to], [0, 1]);
  return (
    <li className="border-t border-line py-5 first:border-t-0">
      <div className={cn("flex items-baseline gap-4 transition-colors duration-500", active ? "text-fg" : "text-fg/30")}>
        <span className="w-6 text-[12px] tabular-nums" style={MONO}>
          0{n}
        </span>
        <span className="font-brand text-[22px] leading-tight font-medium tracking-[-0.02em]">{title}</span>
      </div>
      <AnimatePresence initial={false}>
        {active ? (
          <motion.p
            initial={{ height: 0, opacity: 0, filter: "blur(4px)" }}
            animate={{ height: "auto", opacity: 1, filter: "blur(0px)" }}
            exit={{ height: 0, opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.5, ease: EASE }}
            className="overflow-hidden pl-10 text-[14.5px] leading-relaxed text-muted"
          >
            <span className="block pt-2">{body}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
      <div className="mt-4 ml-10 h-px bg-line">
        <motion.div style={{ scaleX: fill }} className="h-px origin-left bg-fg/60" />
      </div>
    </li>
  );
}

/** One window on the stage. Panes swap with a blur crossfade, as Space's mockups do. */
function Pane({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={on ? { opacity: 1, scale: 1, filter: "blur(0px)", y: 0 } : { opacity: 0, scale: 0.97, filter: "blur(8px)", y: 10 }}
      transition={{ duration: 0.55, ease: EASE }}
      className={cn("absolute inset-0", !on && "pointer-events-none")}
      aria-hidden={!on}
    >
      {children}
    </motion.div>
  );
}

function Term({ title, rules, children }: { title: string; rules: number; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[14px] bg-window text-[13px] leading-[1.65] text-[var(--win-text)] shadow-[0_0_0_1px_rgba(0,0,0,.5),0_30px_70px_-18px_rgba(0,0,0,.35)]">
      <div className="relative flex h-9 shrink-0 items-center bg-[#2a2a2c] px-3.5">
        <span className="flex gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="absolute inset-x-0 text-center text-[12px] text-[var(--win-muted)]">{title}</span>
        <RuleCount rules={rules} className="ml-auto text-[var(--win-muted)]" />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden p-5" style={MONO}>
        {children}
      </div>
    </div>
  );
}

function RuleCount({ rules, className }: { rules: number; className?: string }) {
  return (
    <span className={cn("relative z-10 flex items-center gap-1.5 text-[11.5px] tabular-nums", className)}>
      <svg viewBox="-8 -8 16 16" className="size-3" aria-hidden>
        <path d="M0-6.5L5.63-3.25L5.63 3.25L0 6.5L-5.63 3.25L-5.63-3.25Z" fill="var(--honey)" />
      </svg>
      <motion.span key={rules} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35, ease: EASE }}>
        {rules} rules
      </motion.span>
    </span>
  );
}

function Hook({ children }: { children: ReactNode }) {
  return <div className="text-[var(--win-honey)]">{children}</div>;
}

function Prompt({ children, typing }: { children: ReactNode; typing?: boolean }) {
  return (
    <div className="rounded-[8px] bg-white/[0.04] px-3 py-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
      <span className="text-[var(--win-muted)]">&gt; </span>
      {children}
      {typing ? <span className="ml-px inline-block h-[1.05em] w-[0.55em] translate-y-[0.15em] animate-pulse bg-[var(--win-text)]" /> : null}
    </div>
  );
}

function Tool({ name, arg, result }: { name: string; arg: string; result: string }) {
  return (
    <div>
      <div>
        <span className="text-[var(--win-teal)]">●</span> <span className="font-semibold">{name}</span>({arg})
      </div>
      <div className="text-[var(--win-muted)]">⎿ {result}</div>
    </div>
  );
}

/** Text arriving the way Space's launcher words do: from a 4px blur to sharp. */
function BlurIn({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={show ? { opacity: 1, filter: "blur(0px)", y: 0 } : { opacity: 0, filter: "blur(4px)", y: 4 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** The fake macOS cursor, positioned relative to the Approve button and driven by scroll. */
function Cursor({ x, y, opacity }: { x: MotionValue<number>; y: MotionValue<number>; opacity: MotionValue<number> }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      style={{ x, y, opacity }}
      className="pointer-events-none absolute top-0 left-0 z-30 size-6 drop-shadow-[0_2px_3px_rgba(0,0,0,.3)]"
      aria-hidden
    >
      <path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 2.7-1.2-2.9-6.5h6.4L4 2.5Z" fill="#0e0f12" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </motion.svg>
  );
}
