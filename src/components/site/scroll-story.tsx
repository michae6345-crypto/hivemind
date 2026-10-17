"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Lock, PanelLeft, RotateCw, Search, Share, Wifi } from "lucide-react";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { Logo, Wordmark } from "@/components/hm/bits";
import { cn } from "@/components/hm/utils";
import { HIVE, LESSON, PROMPTS, REPO, SCENES } from "./demo-script";
import { Handles } from "@/components/hm/handles";

// "How it works" as a pinned, scroll-scrubbed scene on a small macOS desktop, the way spacefs.com runs its Finder
// story. The stage sticks for ~3.5 screens. Scroll progress goes through a spring first (Space eases its scenes the
// same way), and everything on the desktop is a function of that one number, so it moves smoothly and scrolling
// back plays it in reverse. Windows open on top of each other like real macOS windows; the menu bar and the Dock
// follow the front app.
// Desktop only (lg+); smaller screens get the three step cards in site.tsx.
//
// Scroll map, 0..1 across the section:
//   0.00–0.16  the desktop rises and settles; 0.05–0.15 the headline lifts and blurs out
//   0.18–0.42  1. Kevin's Terminal: the correction types into Claude Code's input box (0.20–0.33), is sent (0.35),
//              and Hivemind captures the lesson (0.38)
//   0.42–0.70  2. the browser opens on Approvals (0.42–0.47), the lesson lands (0.48), the cursor glides to Approve
//              (0.51–0.59), clicks (0.60), a notification slides in (0.62–0.66)
//   0.70–1.00  3. Emily's Terminal opens (0.70–0.75), loads one more rule, the prompt types (0.76–0.84), the diff
//              arrives (0.86–0.93) and assertSingleCustomer() lights up as Kevin's lesson (0.94)

const MONO = { fontFamily: 'ui-monospace, "SF Mono", Menlo, var(--font-geist-mono), monospace' } as const;
const SYS = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", var(--font-geist-sans), sans-serif' } as const;

const RULES_BEFORE = SCENES[0].rules;
const RULES_AFTER = SCENES[1].rules;
const ALEX_DIFF = SCENES[0].steps.find((s) => s.kind === "diff")!.lines;
const NOOR_DIFF = SCENES[1].steps.find((s) => s.kind === "diff")!.lines;
/** Kevin's "lesson captured" line, exactly as the Terminal demo prints it. */
const CAPTURED = SCENES[0].steps.find((s) => s.kind === "hook" && s.text.startsWith("📝"));

const STEPS = [
  { title: "Kevin corrects their agent", body: "One correction in plain English. Hivemind turns it into a lesson.", from: 0.18, to: 0.42 },
  { title: "Ben approves it", body: "Agents only propose. A lead approves before anything spreads.", from: 0.42, to: 0.7 },
  { title: "Emily's agent gets it right", body: "Every agent starts its next session with the lesson, credited to Kevin.", from: 0.7, to: 1 },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Everything discrete on the desktop, derived from (smoothed) progress. Re-renders only when one of these changes. */
function frameAt(p: number) {
  return {
    step: p < 0.42 ? 0 : p < 0.7 ? 1 : 2,
    front: p < 0.445 ? "alex" : p < 0.725 ? "browser" : "noor",
    typedA: Math.round(span(p, 0.2, 0.33) * PROMPTS.alexCorrect.length),
    sentA: p > 0.35,
    captured: p > 0.38,
    pressing: p > 0.59 && p <= 0.605,
    clicked: p > 0.605,
    typedC: Math.round(span(p, 0.76, 0.84) * PROMPTS.noorAsk.length),
    sentC: p > 0.85,
    diff: Math.floor(span(p, 0.86, 0.93) * (NOOR_DIFF.length + 0.99)),
    lit: p > 0.94,
  };
}
type Frame = ReturnType<typeof frameAt>;
const same = (a: Frame, b: Frame) => (Object.keys(a) as (keyof Frame)[]).every((k) => a[k] === b[k]);

export function ScrollStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Copied into a plain motion value (transforms taken straight off scrollYProgress got a native scroll timeline with
  // the wrong range), then eased with a spring so a flick of the wheel glides instead of jumping.
  const raw = useMotionValue(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => raw.set(v));
  const p = useSpring(raw, { stiffness: 140, damping: 32, mass: 0.6, restDelta: 0.0005 });
  const [f, setF] = useState<Frame>(() => frameAt(0));
  useMotionValueEvent(p, "change", (v) => {
    const next = frameAt(v);
    setF((prev) => (same(prev, next) ? prev : next));
  });

  const headOpacity = useTransform(p, [0.05, 0.15], [1, 0]);
  const headY = useTransform(p, [0.05, 0.15], [0, -56]);
  const headBlur = useTransform(p, [0.05, 0.15], ["blur(0px)", "blur(12px)"]);
  const stageY = useTransform(p, [0, 0.16], ["30vh", "0vh"], { ease: easeOut });
  const stageScale = useTransform(p, [0, 0.16], [0.88, 1], { ease: easeOut });
  const listOpacity = useTransform(p, [0.1, 0.18], [0, 1]);
  const listX = useTransform(p, [0.1, 0.18], [-16, 0], { ease: easeOut });

  return (
    <div ref={ref} className="relative hidden h-[360vh] lg:block">
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden px-4 pt-[92px] pb-8">
        <motion.div style={{ opacity: headOpacity, y: headY, filter: headBlur }} className="absolute inset-x-0 top-[124px] px-4 text-center">
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
          className="mx-auto grid w-full max-w-[1280px] flex-1 origin-top grid-cols-[290px_1fr] items-center gap-8"
        >
          <motion.ol style={{ opacity: listOpacity, x: listX }} className="flex flex-col">
            {STEPS.map((s, i) => (
              <StepRow key={s.title} n={i + 1} title={s.title} body={s.body} active={f.step === i} progress={p} from={s.from} to={s.to} />
            ))}
          </motion.ol>

          <Desktop p={p} f={f} />
        </motion.div>
      </div>
    </div>
  );
}

// ── The desktop ──────────────────────────────────────────────────────────────

function Desktop({ p, f }: { p: MotionValue<number>; f: Frame }) {
  const app = f.front === "browser" ? "Safari" : "Terminal";
  // Window opens: macOS zooms a new window up from ~90%; it is opaque almost at once, so nothing shows through.
  const brOpacity = useTransform(p, [0.42, 0.432], [0, 1]);
  const brScale = useTransform(p, [0.42, 0.465], [0.9, 1], { ease: easeOut });
  const brY = useTransform(p, [0.42, 0.465], [18, 0], { ease: easeOut });
  const nrOpacity = useTransform(p, [0.7, 0.712], [0, 1]);
  const nrScale = useTransform(p, [0.7, 0.745], [0.9, 1], { ease: easeOut });
  const nrY = useTransform(p, [0.7, 0.745], [18, 0], { ease: easeOut });
  // The macOS notification for the approval, top right.
  const noteX = useTransform(p, [0.62, 0.66, 0.7, 0.73], [380, 0, 0, 380], { ease: easeOut });
  const noteOpacity = useTransform(p, [0.62, 0.64, 0.71, 0.73], [0, 1, 1, 0]);

  return (
    <div
      className="relative mx-auto aspect-[16/10] w-full max-w-[min(1000px,calc((100svh-150px)*1.6))] overflow-hidden rounded-[18px] shadow-[0_0_0_1px_rgba(14,15,18,.08),0_40px_90px_-24px_rgba(15,23,42,.35)] select-none"
      style={{
        ...SYS,
        background:
          "radial-gradient(90% 80% at 12% 8%, #c7d6f3 0%, rgba(199,214,243,0) 60%), radial-gradient(80% 90% at 92% 96%, #f6d2bd 0%, rgba(246,210,189,0) 62%), radial-gradient(60% 50% at 70% 30%, #e6dcf3 0%, rgba(230,220,243,0) 70%), linear-gradient(135deg, #dce5f6 0%, #ebe6f1 50%, #f4e2d6 100%)",
      }}
      aria-label="A macOS desktop showing the three steps"
      role="img"
    >
      <MenuBar app={app} rules={f.clicked ? RULES_AFTER : RULES_BEFORE} />

      {/* 1. Kevin's Terminal */}
      <Window className="top-[8.5%] left-[3.5%] h-[74%] w-[68%]" active={f.front === "alex"} z={1}>
        <TermChrome title={`kevin — claude — ${REPO} — 80×24`} active={f.front === "alex"} />
        <ClaudeCode
          rules={RULES_BEFORE}
          ask={PROMPTS.alexAsk}
          history={
            <>
              <Bullet name="Update" arg="src/export.ts" result="Updated src/export.ts with 5 additions" />
              <Diff lines={ALEX_DIFF.slice(0, 2)} more />
              {f.sentA ? <UserLine>{PROMPTS.alexCorrect}</UserLine> : null}
              <Fade show={f.captured}>
                <HiveLine>{CAPTURED?.kind === "hook" ? CAPTURED.text : HIVE.lessonCaptured(LESSON, "@ben")}</HiveLine>
              </Fade>
            </>
          }
          input={f.sentA ? "" : PROMPTS.alexCorrect.slice(0, f.typedA)}
          typing={!f.sentA && f.typedA > 0}
        />
      </Window>

      {/* 2. The browser on the Hivemind app's Approvals */}
      <motion.div style={{ opacity: brOpacity, scale: brScale, y: brY }} className="absolute top-[12%] left-[24%] z-[2] h-[76%] w-[72%] origin-bottom">
        <Window className="inset-0" active={f.front === "browser"} z={0}>
          <BrowserChrome active={f.front === "browser"} />
          <Approvals p={p} f={f} />
        </Window>
      </motion.div>

      {/* 3. Emily's Terminal */}
      <motion.div style={{ opacity: nrOpacity, scale: nrScale, y: nrY }} className="absolute top-[16%] left-[11%] z-[3] h-[72%] w-[68%] origin-bottom">
        <Window className="inset-0" active={f.front === "noor"} z={0}>
          <TermChrome title={`emily — claude — ${REPO} — 80×24`} active={f.front === "noor"} />
          <ClaudeCode
            rules={RULES_AFTER}
            ask={f.sentC ? PROMPTS.noorAsk : null}
            history={
              <>
                <Fade show={f.diff > 0}>
                  <Bullet name="Update" arg="src/export.ts" result="Updated src/export.ts with 4 additions" />
                </Fade>
                <div className="space-y-px">
                  {NOOR_DIFF.slice(0, f.diff).map((l) => (
                    <motion.div
                      key={l.text}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25 }}
                      className={cn(
                        "ml-5 flex items-center gap-2 rounded-[3px] px-1.5 whitespace-pre transition-colors duration-500",
                        l.mark && f.lit ? "bg-[#f5a52430] text-[var(--win-honey)] shadow-[inset_2px_0_0_var(--win-honey)]" : "bg-[#173a22] text-[#a5e3b4]",
                      )}
                    >
                      {l.sign} {l.text}
                      {l.mark ? (
                        <span
                          className={cn(
                            "ml-auto rounded-[3px] bg-[var(--win-honey)] px-1 text-[9.5px] font-medium text-[#1c1c1e] transition-opacity duration-500",
                            f.lit ? "opacity-100" : "opacity-0",
                          )}
                        >
                          Hivemind · {l.mark}
                        </span>
                      ) : null}
                    </motion.div>
                  ))}
                </div>
              </>
            }
            input={f.sentC ? "" : PROMPTS.noorAsk.slice(0, f.typedC)}
            typing={!f.sentC && f.typedC > 0}
          />
        </Window>
      </motion.div>

      {/* Notification, top right */}
      <motion.div
        style={{ x: noteX, opacity: noteOpacity }}
        className="absolute top-[7.5%] right-[1.5%] z-[6] flex w-[42%] items-start gap-2.5 rounded-[14px] bg-white/80 p-2.5 shadow-[0_0_0_0.5px_rgba(0,0,0,.12),0_10px_30px_-8px_rgba(15,23,42,.3)] backdrop-blur-xl"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#1c1c1e]">
          <Logo onDark className="size-4" />
        </span>
        <span className="min-w-0 text-[10.5px] leading-snug">
          <span className="flex justify-between">
            <span className="font-semibold">Hivemind</span>
            <span className="text-fg/45">now</span>
          </span>
          <span className="block font-medium">Lesson approved by @ben</span>
          <span className="block truncate text-fg/70">
            #repo/{REPO} now has {RULES_AFTER} rules
          </span>
        </span>
      </motion.div>

      <Dock front={f.front} />
    </div>
  );
}

function MenuBar({ app, rules }: { app: string; rules: number }) {
  return (
    <div className="absolute inset-x-0 top-0 z-[5] flex h-[5.2%] min-h-6 items-center gap-3.5 bg-white/40 px-3 text-[11px] text-fg/90 backdrop-blur-md">
      <Logo className="size-3" />
      <motion.span key={app} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="font-semibold">
        {app}
      </motion.span>
      <span className="flex gap-3.5 text-fg/80">
        {(app === "Safari" ? ["File", "Edit", "View", "History", "Bookmarks", "Window", "Help"] : ["Shell", "Edit", "View", "Window", "Help"]).map((m) => (
          <span key={m}>{m}</span>
        ))}
      </span>
      <span className="ml-auto flex items-center gap-1 tabular-nums">
        <svg viewBox="-8 -8 16 16" className="size-2.5" aria-hidden>
          <path d="M0-6.5L5.63-3.25L5.63 3.25L0 6.5L-5.63 3.25L-5.63-3.25Z" fill="var(--honey)" />
        </svg>
        <motion.span key={rules} initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }}>
          {rules} rules
        </motion.span>
      </span>
      <Wifi className="size-3" />
      <span className="flex h-2.5 w-5 items-center rounded-[3px] border border-fg/60 p-px">
        <span className="h-full w-3/4 rounded-[1px] bg-fg/70" />
      </span>
      <span className="tabular-nums">Sat 9:41 AM</span>
    </div>
  );
}

function Dock({ front }: { front: Frame["front"] }) {
  const term = front !== "browser";
  return (
    <div className="absolute bottom-[1.6%] left-1/2 z-[5] flex -translate-x-1/2 items-end gap-1.5 rounded-[16px] bg-white/45 px-2 pt-1.5 pb-1 shadow-[0_0_0_0.5px_rgba(255,255,255,.6),0_8px_24px_-6px_rgba(15,23,42,.25)] backdrop-blur-xl">
      <DockIcon label="Finder" className="bg-gradient-to-b from-[#6ec3ff] to-[#1f7ae0]">
        <span className="text-[13px] leading-none text-white">☺</span>
      </DockIcon>
      <DockIcon label="Terminal" running active={term} className="bg-[#1c1c1e]">
        <span className="text-[10px] font-semibold text-white" style={MONO}>
          &gt;_
        </span>
      </DockIcon>
      <DockIcon label="Safari" running={front !== "alex"} active={!term} className="bg-gradient-to-b from-[#f2f7ff] to-[#cfe2ff]">
        <span className="size-4 rounded-full border-[1.5px] border-[#1f7ae0]" />
      </DockIcon>
      <DockIcon label="Hivemind" className="bg-white">
        <Logo className="size-4" />
      </DockIcon>
    </div>
  );
}

function DockIcon({ label, children, className, running, active }: { label: string; children: ReactNode; className?: string; running?: boolean; active?: boolean }) {
  return (
    <span className="flex flex-col items-center gap-[3px]" title={label}>
      <motion.span
        animate={{ y: active ? -3 : 0, scale: active ? 1.08 : 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className={cn("flex size-[26px] items-center justify-center rounded-[7px] shadow-[0_1px_2px_rgba(0,0,0,.2)]", className)}
      >
        {children}
      </motion.span>
      <span className={cn("size-[3px] rounded-full bg-fg/60 transition-opacity duration-300", running ? "opacity-100" : "opacity-0")} />
    </span>
  );
}

function Window({ children, className, active, z }: { children: ReactNode; className?: string; active: boolean; z: number }) {
  return (
    <div
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-[10px] transition-shadow duration-500",
        active
          ? "shadow-[0_0_0_0.5px_rgba(0,0,0,.45),0_28px_60px_-12px_rgba(0,0,0,.45),0_8px_18px_-8px_rgba(0,0,0,.25)]"
          : "shadow-[0_0_0_0.5px_rgba(0,0,0,.3),0_14px_30px_-12px_rgba(0,0,0,.25)]",
        className,
      )}
      style={{ zIndex: z }}
    >
      {children}
    </div>
  );
}

/** Traffic lights: coloured on the front window, grey behind it (as macOS draws inactive windows). */
function Lights({ active }: { active: boolean }) {
  const c = active ? ["#ff5f57", "#febc2e", "#28c840"] : ["#5b5b5f", "#5b5b5f", "#5b5b5f"];
  return (
    <span className="flex gap-[7px]">
      {c.map((col, i) => (
        <span key={i} className="size-[10px] rounded-full transition-colors duration-500" style={{ background: col }} />
      ))}
    </span>
  );
}

function TermChrome({ title, active }: { title: string; active: boolean }) {
  return (
    <div className="relative flex h-7 shrink-0 items-center border-b border-black/60 bg-[#2b2b2d] px-2.5">
      <Lights active={active} />
      <span className={cn("absolute inset-x-0 text-center text-[11px] transition-colors duration-500", active ? "text-[#d4d4d8]" : "text-[#77777d]")}>
        <span className="mr-1 text-[10px]">📁</span>
        {title}
      </span>
    </div>
  );
}

/** Claude Code in a Terminal: header, transcript, and the rounded input box at the bottom. */
function ClaudeCode({ rules, ask, history, input, typing }: { rules: number; ask: string | null; history: ReactNode; input: string; typing: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1e1e1e] px-3 pt-2.5 pb-2 text-[10.5px] leading-[1.6] text-[#e4e4e7]" style={MONO}>
      <div className="flex items-center gap-2.5">
        <span className="text-[16px] leading-none text-[#d97757]">✻</span>
        <div className="leading-tight">
          <div className="font-semibold">Claude Code</div>
          <div className="text-[#8b8b93]">Sonnet 5.5 · ~/{REPO}</div>
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-hidden">
        <HiveLine>{HIVE.sessionLoaded(rules, 2)}</HiveLine>
        {ask ? <UserLine>{ask}</UserLine> : null}
        {history}
      </div>
      <div className="mt-2 rounded-[6px] border border-[#5c5c63] px-2 py-1">
        <span className="text-[#8b8b93]">&gt; </span>
        {input}
        {typing || input === "" ? <span className="hm-caret ml-px inline-block h-[1.05em] w-[0.55em] translate-y-[0.18em] bg-[#e4e4e7]" /> : null}
      </div>
      <div className="mt-1 pl-2 text-[9.5px] text-[#77777d]">? for shortcuts</div>
    </div>
  );
}

function HiveLine({ children }: { children: string }) {
  return (
    <div className="text-[var(--win-honey)]">
      <Handles text={children} dark />
    </div>
  );
}

function UserLine({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="rounded-[4px] bg-white/[0.06] px-1.5 text-[#d4d4d8]">
      <span className="text-[#8b8b93]">&gt; </span>
      {children}
    </motion.div>
  );
}

function Bullet({ name, arg, result }: { name: string; arg: string; result: string }) {
  return (
    <div>
      <div>
        <span className="text-[#4ade80]">⏺</span> <span className="font-semibold">{name}</span>({arg})
      </div>
      <div className="pl-3 text-[#8b8b93]">⎿ {result}</div>
    </div>
  );
}

function Diff({ lines, more }: { lines: { sign: string; text: string }[]; more?: boolean }) {
  return (
    <div className="space-y-px">
      {lines.map((l) => (
        <div key={l.text} className="ml-5 rounded-[3px] bg-[#173a22] px-1.5 whitespace-pre text-[#a5e3b4]">
          {l.sign} {l.text}
        </div>
      ))}
      {more ? <div className="ml-5 px-1.5 text-[#77777d]">…</div> : null}
    </div>
  );
}

function Fade({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={show ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 3, filter: "blur(3px)" }}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  );
}

function BrowserChrome({ active }: { active: boolean }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2.5 border-b border-black/10 bg-[#f6f6f6] px-2.5 text-[#6e6e73]">
      <Lights active={active} />
      <PanelLeft className="ml-1 size-3.5" />
      <ChevronLeft className="size-3.5" />
      <ChevronRight className="size-3.5 opacity-40" />
      <div className="mx-auto flex h-6 w-[58%] items-center justify-center gap-1.5 rounded-[6px] bg-black/[0.055] text-[10.5px] text-fg/75">
        <Lock className="size-2.5" />
        hivemind-beta-virid.vercel.app/app/approvals
        <RotateCw className="ml-auto mr-2 size-2.5 opacity-60" />
      </div>
      <Share className="size-3.5" />
    </div>
  );
}

/** The Hivemind app's Approvals, as Ben sees it. */
function Approvals({ p, f }: { p: MotionValue<number>; f: Frame }) {
  const cardY = useTransform(p, [0.47, 0.51], [-14, 0], { ease: easeOut });
  const cardOpacity = useTransform(p, [0.47, 0.5], [0, 1]);
  // The cursor, relative to the Approve button: in from the lower right, settles, clicks, drifts off.
  const curX = useTransform(p, [0.51, 0.59, 0.64, 0.69], [250, 20, 20, 60], { ease: easeOut });
  const curY = useTransform(p, [0.51, 0.59, 0.64, 0.69], [120, 12, 12, 46], { ease: easeOut });
  const curOpacity = useTransform(p, [0.5, 0.52, 0.67, 0.69], [0, 1, 1, 0]);
  const waiting = f.clicked ? 0 : 1;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f7f8fa]" style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div className="flex h-9 shrink-0 items-center gap-5 border-b border-line bg-white px-3.5 text-[11px]">
        <span className="flex items-center gap-1.5">
          <Logo className="size-3.5" />
          <Wordmark className="text-[12.5px]" />
        </span>
        <span className="text-muted">Lessons</span>
        <span className="relative flex h-full items-center gap-1 font-medium">
          Approvals
          <span className="flex size-3.5 items-center justify-center rounded-full bg-fg text-[8px] text-white tabular-nums">{waiting}</span>
          <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent" />
        </span>
        <span className="text-muted">Results</span>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-elevated px-2 py-0.5 text-[10px] text-muted">
          <Search className="size-2.5" /> Viewing as @ben (Lead)
        </span>
      </div>
      <div className="relative flex-1 p-4">
        <div className="mb-2 text-[10.5px] text-muted">Waiting on you · {waiting}</div>
        <motion.div style={{ y: cardY, opacity: cardOpacity }} className="rounded-[12px] bg-white p-3.5 shadow-[0_0_0_1px_var(--border),0_8px_24px_rgba(15,23,42,.06)]">
          <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <span className="size-1.5 rounded-full bg-honey" /> Correction from <Handles text="@kevin" />
            <span className="hm-chip ml-auto !text-[10px]" data-kind="repo">
              #repo/{REPO}
            </span>
          </div>
          <div className="mt-1.5 text-[13.5px] font-semibold">{LESSON}</div>
          <p className="mt-0.5 text-[11px] text-muted">
            Proposed by <Handles text="@kevin" /> · Claude Code agent · just now
          </p>
          <div className="relative mt-3 h-7">
            <div className={cn("absolute inset-0 flex gap-1.5 transition-opacity duration-300", f.clicked ? "pointer-events-none opacity-0" : "opacity-100")}>
              <span className={cn("hm-pill hm-pill-primary h-7 px-3 text-[11px] transition-transform duration-150", f.pressing && "scale-95")}>Approve</span>
              <span className="hm-pill hm-glass h-7 px-3 text-[11px]">Reject</span>
            </div>
            <div className={cn("absolute inset-0 flex items-center gap-1.5 text-[11.5px] font-medium text-ok transition-opacity duration-300", f.clicked ? "opacity-100" : "opacity-0")}>
              <span className="flex size-4.5 items-center justify-center rounded-full bg-ok text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
              Approved by <Handles text="@ben" /> · in every agent&apos;s next session
            </div>
            <Cursor x={curX} y={curY} opacity={curOpacity} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/** A row in the step list, Space-style: the active step in ink with its line showing, the rest faded. No height
 *  animation, so nothing on the page moves while a row changes. */
function StepRow({ n, title, body, active, progress, from, to }: { n: number; title: string; body: string; active: boolean; progress: MotionValue<number>; from: number; to: number }) {
  const fill = useTransform(progress, [from, to], [0, 1]);
  return (
    <li className="border-t border-line py-4 first:border-t-0">
      <div className={cn("flex items-baseline gap-3 transition-colors duration-500", active ? "text-fg" : "text-fg/30")}>
        <span className="w-5 text-[11.5px] tabular-nums" style={{ fontFamily: "var(--font-geist-mono), monospace" }}>
          0{n}
        </span>
        <span className="font-brand text-[19px] leading-tight font-medium tracking-[-0.02em] whitespace-nowrap">{title}</span>
      </div>
      <p className={cn("mt-1.5 pl-8 text-[13.5px] leading-relaxed text-muted transition-[opacity,filter] duration-500", active ? "opacity-100 blur-0" : "opacity-0 blur-[3px]")}>
        {body}
      </p>
      <div className="mt-3 ml-8 h-px bg-line">
        <motion.div style={{ scaleX: fill }} className="h-px origin-left bg-fg/60" />
      </div>
    </li>
  );
}

/** The fake macOS cursor, positioned relative to the Approve button and driven by scroll. */
function Cursor({ x, y, opacity }: { x: MotionValue<number>; y: MotionValue<number>; opacity: MotionValue<number> }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      style={{ x, y, opacity }}
      className="pointer-events-none absolute top-0 left-0 z-30 size-5 drop-shadow-[0_2px_3px_rgba(0,0,0,.3)]"
      aria-hidden
    >
      <path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 2.7-1.2-2.9-6.5h6.4L4 2.5Z" fill="#0e0f12" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </motion.svg>
  );
}
