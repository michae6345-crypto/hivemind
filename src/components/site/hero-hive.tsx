"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion, type Variants } from "motion/react";
import { Logo } from "@/components/hm/bits";
import { cn } from "@/components/hm/utils";

// The hero acts out the product in one loop, so a visitor knows what Hivemind does before reading a word of the
// page: each hex is a teammate's coding agent, the middle one is the team's memory. The step rail under the hive
// says in words what the animation is showing, and clicking a step jumps to it.

const EASE = [0.22, 1, 0.36, 1] as const;
const rise: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 1.1, ease: EASE } },
};

// ── Geometry (SVG user units) ──────────────────────────────────────────────

const W = 640;
const H = 600;
const C = { x: 320, y: 300 };
const R_HIVE = 106;
const R_CELL = 78;
const RING = 210;

const at = (deg: number) => ({
  x: C.x + RING * Math.cos((deg * Math.PI) / 180),
  y: C.y + RING * Math.sin((deg * Math.PI) / 180),
});

function hexPath(cx: number, cy: number, r: number) {
  const pts = Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join("L")}Z`;
}

/** A segment from the edge of the hive to the edge of a cell, so particles leave and land on the hex walls. */
function spoke(to: { x: number; y: number }) {
  const dx = to.x - C.x;
  const dy = to.y - C.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const a = R_HIVE * 0.9;
  const b = R_CELL * 0.9;
  return { x1: C.x + ux * a, y1: C.y + uy * a, x2: to.x - ux * b, y2: to.y - uy * b };
}

type CellId = "kevin" | "emily" | "tom" | "ben" | "lauren";
const AGENTS: { id: CellId; tool: string; deg: number }[] = [
  { id: "kevin", tool: "Claude Code", deg: 210 },
  { id: "emily", tool: "Cursor", deg: -30 },
  { id: "tom", tool: "Codex", deg: 30 },
  { id: "ben", tool: "Copilot", deg: 90 },
  { id: "lauren", tool: "Gemini CLI", deg: 150 },
];
const LOCK = at(-90);
const POS = Object.fromEntries(AGENTS.map((a) => [a.id, at(a.deg)])) as Record<CellId, { x: number; y: number }>;

// ── The story ──────────────────────────────────────────────────────────────

const CORRECTION = "No. Exports must call assertSingleCustomer() first.";
const BAD = "Just reuse Lab A's rows in Lab B's tests.";

const STEPS: { label: ReactNode; ms: number }[] = [
  { label: <><Chip>@kevin</Chip> corrects Claude Code</>, ms: 3400 },
  { label: <>It becomes a lesson, waiting on <Chip>@ben</Chip></>, ms: 2600 },
  { label: <><Chip>@ben</Chip> approves it</>, ms: 2000 },
  { label: <>Every agent follows it next session</>, ms: 3200 },
  { label: <>A bad lesson hits <Chip kind="lock">@greg</Chip>&apos;s 🔒 rule</>, ms: 4200 },
];

function Chip({ children, kind = "person" }: { children: ReactNode; kind?: "person" | "lock" }) {
  return (
    <span className="hm-chip" data-kind={kind}>
      {children}
    </span>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────

export function HeroHive({ evalOff, evalOn, runs }: { evalOff: number; evalOn: number; runs: number }) {
  return (
    <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-8">
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } } }}
        className="flex flex-col items-center text-center lg:items-start lg:text-left"
      >
        <motion.p
          variants={rise}
          className="hm-glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[12px] tracking-tight text-fg/80"
        >
          <span className="size-1.5 rounded-full bg-honey" aria-hidden />
          Shared memory for your team&apos;s AI coding agents
        </motion.p>
        <h1 className="hm-display mt-6 text-[46px] sm:text-[64px] lg:text-[50px] lg:whitespace-nowrap xl:text-[62px]">
          <motion.span variants={rise} className="block">
            Correct one agent.
          </motion.span>
          <motion.span variants={rise} className="tone-2 block">
            Every agent learns.
          </motion.span>
        </h1>
        <motion.p variants={rise} className="mt-6 max-w-[48ch] text-[16px] leading-relaxed text-muted sm:text-[17px]">
          Tell your coding agent it got something wrong, and Hivemind saves the fix as a lesson. Once your lead approves
          it, every agent on the team follows it from its next session: Claude Code, Cursor, Codex, Copilot and Gemini CLI.
        </motion.p>
        <motion.div variants={rise} className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
          <a href="#demo" className="hm-pill hm-pill-primary h-11 px-5 text-[14px]">
            <Play className="size-4 fill-current" /> Watch it work
          </a>
          <Link href="/app" className="hm-pill hm-glass hm-pill-glass h-11 px-5 text-[14px]">
            Open the app
          </Link>
        </motion.div>
        <motion.a
          variants={rise}
          href="#results"
          className="group mt-8 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-mono text-[12.5px] text-muted lg:justify-start"
        >
          <span className="whitespace-nowrap">
            <span className="text-fg tabular-nums">{evalOff}</span>/{runs} runs broke a team rule without it
          </span>
          <span aria-hidden className="text-line">
            ·
          </span>
          <span className="whitespace-nowrap">
            <span className="text-ok tabular-nums">{evalOn}</span>/{runs} with it
          </span>
          <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
            →
          </span>
        </motion.a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.2, ease: EASE, delay: 0.25 }}
      >
        <Hive />
      </motion.div>
    </div>
  );
}

// ── The hive ───────────────────────────────────────────────────────────────

function Hive() {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.35 });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0); // bumps on every pass, so animations restart even on the same step
  const playing = inView && !reduce;

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      setStep((s) => (s + 1) % STEPS.length);
      setRun((r) => r + 1);
    }, STEPS[step].ms);
    return () => clearTimeout(id);
  }, [step, run, playing]);

  // Reduced motion: the finished state (every agent knows the lesson), no loop.
  const s = reduce ? 3 : step;
  const learned = s >= 1;
  const approved = s >= 2;
  const spread = s >= 3;

  return (
    <figure ref={box} className="relative mx-auto w-full max-w-[600px]" aria-label="How Hivemind works, animated">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-hidden>
        <defs>
          <filter id="hh-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#0f172a" floodOpacity="0.09" />
          </filter>
          <filter id="hh-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <pattern id="hh-lattice" width="36" height="62.35" patternUnits="userSpaceOnUse">
            <path d="M18 0 L36 10.39 L36 31.18 L18 41.57 L0 31.18 L0 10.39 Z M18 41.57 L18 62.35" fill="none" stroke="#e2a03a" strokeOpacity="0.22" strokeWidth="1" />
          </pattern>
          <radialGradient id="hh-fadeg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="hh-fade">
            <rect x={-120} y={-60} width={W + 240} height={H + 120} fill="url(#hh-fadeg)" />
          </mask>
          <radialGradient id="hh-honey" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#fff7e8" />
            <stop offset="100%" stopColor="#fbe8c6" />
          </radialGradient>
        </defs>

        {/* A faint honeycomb lattice that fades out from the hive */}
        <rect x={-120} y={-60} width={W + 240} height={H + 120} fill="url(#hh-lattice)" mask="url(#hh-fade)" />

        {/* Spokes */}
        {[...AGENTS.map((a) => POS[a.id]), LOCK].map((p, i) => {
          const l = spoke(p);
          return (
            <line
              key={i}
              {...l}
              stroke="#cfd4dc"
              strokeWidth={2}
              strokeDasharray="0.1 8"
              strokeLinecap="round"
            />
          );
        })}

        {/* Lock cell: Greg's rule */}
        <LockCell flash={s === 4} key={`lock-${run}`} />

        {/* Agent cells */}
        {AGENTS.map((a) => {
          const p = POS[a.id];
          const state =
            (s === 0 && a.id === "kevin") || (s === 2 && a.id === "ben")
              ? "active"
              : s === 4 && a.id === "emily"
                ? "warn"
                : spread
                  ? "knows"
                  : "idle";
          return <AgentCell key={a.id} x={p.x} y={p.y} handle={a.id} tool={a.tool} state={state} />;
        })}

        {/* The hive */}
        <HiveCore learned={learned} approved={approved} blocked={s === 4} stepKey={`${s}-${run}`} />

        {/* Particles */}
        {!reduce && (
          <g key={`p-${run}`}>
            {s === 1 && <Particle from="kevin" to="hive" color="var(--honey)" delay={0.1} />}
            {s === 2 && <Particle from="ben" to="hive" color="var(--ok)" delay={0.15} small />}
            {s === 3 &&
              AGENTS.map((a, i) => <Particle key={a.id} from="hive" to={a.id} color="var(--honey)" delay={0.1 + i * 0.09} />)}
            {s === 4 && <Bounce />}
          </g>
        )}

        {/* Speech bubbles */}
        <AnimatePresence>
          {s === 0 && !reduce && (
            <Bubble key={`b0-${run}`} x={8} y={14} w={238} text={CORRECTION} tail={{ x: 120, y: POS.kevin.y - R_CELL + 6 }} />
          )}
          {s === 4 && (
            <Bubble
              key={`b4-${run}`}
              x={W - 8 - 238}
              y={14}
              w={238}
              text={BAD}
              tail={{ x: POS.emily.x + 30, y: POS.emily.y - R_CELL + 6 }}
              tone="danger"
            />
          )}
        </AnimatePresence>
      </svg>

      <Rail step={s} run={run} playing={playing} onPick={(i) => { setStep(i); setRun((r) => r + 1); }} />
    </figure>
  );
}

function AgentCell({ x, y, handle, tool, state }: { x: number; y: number; handle: string; tool: string; state: "idle" | "active" | "knows" | "warn" }) {
  const stroke =
    state === "active" ? "var(--honey)" : state === "knows" ? "#ecc27c" : state === "warn" ? "var(--danger)" : "var(--border)";
  return (
    <g>
      <motion.path
        d={hexPath(x, y, R_CELL)}
        fill={state === "warn" ? "var(--danger)" : "var(--honey)"}
        filter="url(#hh-glow)"
        initial={false}
        animate={{ opacity: state === "active" ? 0.55 : state === "warn" ? 0.3 : 0 }}
        transition={{ duration: 0.5 }}
      />
      <motion.path
        d={hexPath(x, y, R_CELL)}
        filter="url(#hh-shadow)"
        strokeWidth={state === "idle" ? 1.2 : 2}
        strokeLinejoin="round"
        initial={false}
        animate={{ fill: state === "knows" ? "#fff6e6" : "#ffffff", stroke }}
        transition={{ duration: 0.5 }}
      />
      <text x={x} y={y - 6} textAnchor="middle" className="font-mono" fontSize={16} fontWeight={600} fill="var(--chip-person)">
        @{handle}
      </text>
      <text x={x} y={y + 15} textAnchor="middle" fontSize={13.5} fill="var(--muted)">
        {tool}
      </text>
      <AnimatePresence>
        {state === "knows" && (
          <motion.g
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            style={{ transformOrigin: `${x}px ${y + 38}px` }}
          >
            <rect x={x - 33} y={y + 27} width={66} height={20} rx={10} fill="var(--honey)" />
            <text x={x} y={y + 41} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
              ✓ knows it
            </text>
          </motion.g>
        )}
      </AnimatePresence>
    </g>
  );
}

function LockCell({ flash }: { flash: boolean }) {
  const { x, y } = LOCK;
  return (
    <g>
      <motion.path
        d={hexPath(x, y, R_CELL)}
        fill="var(--danger)"
        filter="url(#hh-glow)"
        initial={{ opacity: 0 }}
        animate={{ opacity: flash ? [0, 0, 0.55, 0.15] : 0 }}
        transition={{ duration: 2.2, times: [0, 0.42, 0.55, 1] }}
      />
      <path d={hexPath(x, y, R_CELL)} fill="#fff5f5" stroke="#f3c4c6" strokeWidth={1.4} filter="url(#hh-shadow)" />
      {/* padlock */}
      <g transform={`translate(${x - 8} ${y - 36})`} stroke="var(--danger)" fill="none" strokeWidth={2} strokeLinecap="round">
        <path d="M3.5 8V5.5a4.5 4.5 0 0 1 9 0V8" />
        <rect x="1" y="8" width="14" height="10" rx="2.5" fill="var(--danger)" stroke="none" />
      </g>
      <text x={x} y={y + 2} textAnchor="middle" className="font-mono" fontSize={14} fontWeight={600} fill="var(--danger)">
        @greg
      </text>
      <text x={x} y={y + 20} textAnchor="middle" fontSize={11.5} fill="var(--muted)">
        Never mix lab data
      </text>
    </g>
  );
}

function HiveCore({ learned, approved, blocked, stepKey }: { learned: boolean; approved: boolean; blocked: boolean; stepKey: string }) {
  const { x, y } = C;
  return (
    <g>
      <motion.path
        d={hexPath(x, y, R_HIVE)}
        fill="var(--honey)"
        filter="url(#hh-glow)"
        initial={false}
        animate={{ opacity: approved && !blocked ? 0.4 : learned ? 0.22 : 0.12 }}
        transition={{ duration: 0.6 }}
      />
      <motion.path
        d={hexPath(x, y, R_HIVE)}
        fill="url(#hh-honey)"
        strokeWidth={2.2}
        strokeLinejoin="round"
        filter="url(#hh-shadow)"
        initial={false}
        animate={{ stroke: blocked ? "var(--danger)" : "var(--honey)" }}
        transition={{ duration: 0.3 }}
      />
      <foreignObject x={x - 80} y={y - 72} width={160} height={144}>
        <div className="flex h-full flex-col items-center justify-center text-center leading-tight">
          <AnimatePresence mode="wait" initial={false}>
            {!learned ? (
              <motion.div key="idle" {...swap} className="flex flex-col items-center">
                <Logo className="size-8" />
                <div className="hm-display mt-2 text-[17px]">Team memory</div>
                <div className="mt-1 font-mono text-[10.5px] text-muted">10 lessons · 2 🔒 rules</div>
              </motion.div>
            ) : blocked ? (
              <motion.div key={`blocked-${stepKey}`} {...swap} className="flex flex-col items-center">
                <div className="font-mono text-[10.5px] tracking-wide text-danger uppercase">Blocked</div>
                <div className="mt-1 text-[12.5px] font-medium text-fg">Breaks @greg&apos;s</div>
                <div className="text-[12.5px] font-medium text-fg">🔒 lab-isolation rule</div>
                <div className="mt-1.5 font-mono text-[10.5px] text-muted">no agent sees it</div>
              </motion.div>
            ) : (
              <motion.div key={approved ? "ok" : "pending"} {...swap} className="flex flex-col items-center">
                <div className="font-mono text-[10px] tracking-wide text-muted uppercase">New lesson</div>
                <div className="mt-1 text-[12.5px] font-medium text-fg">Exports call</div>
                <div className="font-mono text-[11.5px] text-fg">assertSingleCustomer()</div>
                <div
                  className={cn(
                    "mt-2 rounded-full px-2 py-0.5 font-mono text-[10.5px]",
                    approved ? "bg-ok text-white" : "border border-dashed border-honey text-[#9a6510]",
                  )}
                >
                  {approved ? "✓ approved · @ben" : "pending · @ben"}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </foreignObject>
    </g>
  );
}

const swap = {
  initial: { opacity: 0, y: 6, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -6, filter: "blur(4px)" },
  transition: { duration: 0.35, ease: EASE },
};

function Particle({ from, to, color, delay, small }: { from: CellId | "hive"; to: CellId | "hive"; color: string; delay: number; small?: boolean }) {
  const cell = from === "hive" ? POS[to as CellId] : POS[from];
  const l = spoke(cell);
  const [a, b] = from === "hive" ? [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }] : [{ x: l.x2, y: l.y2 }, { x: l.x1, y: l.y1 }];
  const d = 0.85;
  return (
    <g>
      <motion.line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0.9 }}
        animate={{ pathLength: 1, opacity: [0.9, 0.9, 0] }}
        transition={{ pathLength: { duration: d, ease: EASE, delay }, opacity: { duration: d + 0.6, times: [0, 0.6, 1], delay } }}
      />
      <motion.circle
        r={small ? 5 : 7}
        fill={color}
        initial={{ cx: a.x, cy: a.y, opacity: 0 }}
        animate={{ cx: b.x, cy: b.y, opacity: [0, 1, 1, 0] }}
        transition={{ duration: d, ease: EASE, delay, opacity: { duration: d, times: [0, 0.1, 0.85, 1], delay } }}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </g>
  );
}

/** The bad lesson flies at the hive, hits the wall, and bounces back to @emily. */
function Bounce() {
  const l = spoke(POS.emily);
  const hit = { x: l.x1 + (l.x2 - l.x1) * 0.08, y: l.y1 + (l.y2 - l.y1) * 0.08 };
  const lock = spoke(LOCK);
  return (
    <g>
      <motion.line
        {...lock}
        stroke="var(--danger)"
        strokeWidth={2.5}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 0, 1, 1], opacity: [0, 0, 1, 0] }}
        transition={{ duration: 2.4, times: [0, 0.38, 0.5, 1], delay: 1.2 }}
      />
      <motion.circle
        r={7}
        fill="var(--danger)"
        initial={{ cx: l.x2, cy: l.y2, opacity: 0 }}
        animate={{ cx: [l.x2, hit.x, l.x2], cy: [l.y2, hit.y, l.y2], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.9, times: [0, 0.45, 1], ease: EASE, delay: 1.2, opacity: { duration: 1.9, times: [0, 0.05, 0.85, 1], delay: 1.2 } }}
        style={{ filter: "drop-shadow(0 0 6px var(--danger))" }}
      />
    </g>
  );
}

function Bubble({ x, y, w, text, tail, tone }: { x: number; y: number; w: number; text: string; tail: { x: number; y: number }; tone?: "danger" }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), 28);
    return () => clearInterval(id);
  }, [text]);
  const h = 62;
  const bx = Math.min(Math.max(tail.x, x + 22), x + w - 22);
  return (
    <motion.g
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <path
        d={`M${bx - 9} ${y + h - 1} L${tail.x} ${tail.y} L${bx + 9} ${y + h - 1} Z`}
        fill="var(--window)"
      />
      <rect x={x} y={y} width={w} height={h} rx={12} fill="var(--window)" filter="url(#hh-shadow)" />
      <foreignObject x={x + 12} y={y + 8} width={w - 24} height={h - 16}>
        <div className="font-mono text-[12px] leading-[1.45]" style={{ color: tone === "danger" ? "#fda4a6" : "var(--win-text)" }}>
          <span style={{ color: "var(--win-honey)" }}>&gt; </span>
          {text.slice(0, n)}
          <span className="ml-px inline-block h-[13px] w-[6px] translate-y-[2px] animate-pulse bg-current opacity-70" />
        </div>
      </foreignObject>
    </motion.g>
  );
}

function Rail({ step, run, playing, onPick }: { step: number; run: number; playing: boolean; onPick: (i: number) => void }) {
  return (
    <ol className="mt-4 grid grid-cols-5 gap-1.5 sm:gap-2">
      {STEPS.map((st, i) => {
        const on = i === step;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={on ? "step" : undefined}
              className={cn(
                "group flex h-full w-full flex-col gap-1.5 rounded-xl p-2 text-left transition-colors duration-200 sm:p-2.5",
                on ? "hm-card" : "hover:bg-white/70",
              )}
            >
              <span className="relative block h-[3px] w-full overflow-hidden rounded-full bg-line">
                {on ? (
                  <motion.span
                    key={`${i}-${run}`}
                    className="absolute inset-y-0 left-0 rounded-full bg-honey"
                    initial={{ width: playing ? "0%" : "100%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: playing ? st.ms / 1000 : 0, ease: "linear" }}
                  />
                ) : i < step ? (
                  <span className="absolute inset-0 rounded-full bg-honey/40" />
                ) : null}
              </span>
              <span className="font-mono text-[10.5px] text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span
                className={cn(
                  "hidden text-[12.5px] leading-snug sm:block",
                  on ? "text-fg" : "text-muted group-hover:text-fg",
                )}
              >
                {st.label}
              </span>
            </button>
          </li>
        );
      })}
      <li className="col-span-5 px-1 text-[13px] leading-snug text-fg sm:hidden" aria-live="polite">
        {STEPS.map((st, i) => (i === step ? <Fragment key={i}>{st.label}</Fragment> : null))}
      </li>
    </ol>
  );
}
