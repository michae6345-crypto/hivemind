"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { REPO, SCENES, type Scene, type Step } from "./demo-script";
import { cn } from "@/components/hm/utils";

type NotifyStep = Extract<Step, { kind: "notify" }>;

interface Line {
  id: number;
  step: Step;
  /** For prompts: how much has been typed so far. */
  typed?: string;
  done: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reduced motion: the last scene, fully written, no typing and no loop.
const LAST = SCENES.length - 1;
const STATIC_LINES: Line[] = SCENES[LAST].steps
  .filter((s) => s.kind !== "pause" && s.kind !== "cursor" && s.kind !== "notify" && s.kind !== "spinner")
  .map((step, i) => ({ id: i, step, typed: step.kind === "prompt" ? step.text : undefined, done: true }));

/**
 * A dark macOS Terminal running Claude Code with Hivemind, playing demo-script.ts once it is on screen, then looping.
 * Notifications and the fake cursor belong to the desktop around it, so they go out through callbacks.
 */
export function Terminal({
  className,
  onNotify,
  onCursor,
  onScene,
  height = 420,
}: {
  className?: string;
  onNotify?: (n: NotifyStep) => void;
  /** Resolves once the cursor has reached its target and clicked. */
  onCursor?: (target: "approve") => Promise<void>;
  onScene?: (scene: Scene, index: number) => void;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduce = useReducedMotion();
  const [scene, setScene] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const cb = useRef({ onNotify, onCursor, onScene });
  useEffect(() => {
    cb.current = { onNotify, onCursor, onScene };
  });

  useEffect(() => {
    if (reduce || !inView) return;
    let alive = true;
    let id = 0;
    const push = (l: Omit<Line, "id">) => {
      const line = { ...l, id: id++ };
      setLines((ls) => [...ls, line]);
      return line.id;
    };
    const patch = (lineId: number, p: Partial<Line>) =>
      setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, ...p } : l)));

    const run = async () => {
      while (alive) {
        for (let si = 0; si < SCENES.length && alive; si++) {
          const sc = SCENES[si];
          setScene(si);
          setLines([]);
          cb.current.onScene?.(sc, si);
          await sleep(500);
          for (const step of sc.steps) {
            if (!alive) return;
            switch (step.kind) {
              case "prompt": {
                const lid = push({ step, typed: "", done: false });
                await sleep(350);
                for (let i = 1; i <= step.text.length && alive; i++) {
                  patch(lid, { typed: step.text.slice(0, i) });
                  await sleep(step.text[i - 1] === " " ? 34 : 22 + Math.random() * 26);
                }
                await sleep(320);
                patch(lid, { done: true });
                await sleep(380);
                break;
              }
              case "spinner": {
                const lid = push({ step, done: false });
                await sleep(step.ms);
                setLines((ls) => ls.filter((l) => l.id !== lid));
                break;
              }
              case "diff": {
                push({ step, done: true });
                await sleep(260 + step.lines.length * 170);
                break;
              }
              case "notify":
                cb.current.onNotify?.(step);
                await sleep(350);
                break;
              case "cursor":
                await (cb.current.onCursor?.(step.target) ?? sleep(800));
                break;
              case "pause":
                await sleep(step.ms);
                break;
              default:
                push({ step, done: true });
                await sleep(step.kind === "hook" ? 900 : step.kind === "tool" ? 520 : 700);
            }
          }
        }
        await sleep(400);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [inView, reduce]);

  const shown = reduce ? STATIC_LINES : lines;
  const sceneIdx = reduce ? LAST : scene;
  const who = SCENES[sceneIdx].who;

  return (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-[12px] bg-window text-[12.5px] leading-[1.6] text-[var(--win-text)] shadow-[0_0_0_1px_rgba(0,0,0,.5),0_24px_60px_-12px_rgba(15,23,42,.45)]",
        className,
      )}
      style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
    >
      <div className="relative flex h-8 items-center border-b border-white/[0.06] bg-[#2a2a2c] px-3">
        <span className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="absolute inset-x-0 text-center font-sans text-[12px] text-[var(--win-muted)]">
          {who} — claude — {REPO}
        </span>
      </div>
      <div
        className="flex flex-col justify-end overflow-hidden px-4 py-3 [mask-image:linear-gradient(to_bottom,transparent,#000_56px)]"
        style={{ height }}
      >
        <AnimatePresence initial={false}>
          {shown.map((l) => (
            <motion.div
              key={`${sceneIdx}-${l.id}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              layout="position"
            >
              <LineView line={l} />
            </motion.div>
          ))}
        </AnimatePresence>
        <PromptBar active={!shown.some((l) => l.step.kind === "prompt" && !l.done)} />
      </div>
    </div>
  );
}

function Caret() {
  return <span className="ml-px inline-block h-[1.1em] w-[0.6em] translate-y-[0.18em] animate-[hm-caret_1s_steps(1)_infinite] bg-[var(--win-text)]" />;
}

/** The empty input box at the bottom, like Claude Code's. */
function PromptBar({ active }: { active: boolean }) {
  return (
    <div className="mt-2 rounded-md border border-white/10 px-2.5 py-1 text-[var(--win-muted)]">
      &gt; {active ? <Caret /> : null}
    </div>
  );
}

function LineView({ line: l }: { line: Line }) {
  const s = l.step;
  switch (s.kind) {
    case "prompt":
      return l.done ? (
        <div className="mt-2 text-[var(--win-muted)]">&gt; {s.text}</div>
      ) : (
        <div className="mt-2 rounded-md border border-white/25 px-2.5 py-1">
          &gt; {l.typed}
          <Caret />
        </div>
      );
    case "hook": {
      const color = s.tone === "rose" ? "var(--win-rose)" : "var(--win-honey)";
      return (
        <div className="mt-1 flex gap-2" style={{ color }}>
          <span className="shrink-0 text-[var(--win-muted)]">⎿</span>
          <span>{s.text}</span>
        </div>
      );
    }
    case "tool":
      return (
        <div className="mt-2">
          <div>
            <span className="text-[var(--win-teal)]">⏺</span> <span className="font-semibold">{s.name}</span>({s.arg})
          </div>
          {s.result ? (
            <div className="text-[var(--win-muted)]">
              <span className="mr-2">  ⎿</span>
              {s.result}
            </div>
          ) : null}
        </div>
      );
    case "spinner":
      return (
        <div className="mt-2 text-[var(--win-muted)]">
          <motion.span
            className="mr-1.5 inline-block text-[var(--win-text)]"
            animate={{ rotate: [0, 90, 180], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
          >
            ✻
          </motion.span>
          {s.text} <span className="opacity-60">(esc to interrupt)</span>
        </div>
      );
    case "diff":
      return (
        <div className="mt-1 ml-6 overflow-hidden rounded-md border border-white/[0.06]">
          {s.lines.map((d, i) => (
            <div
              key={i}
              style={{ animationDelay: `${120 + i * 170}ms` }}
              className={cn(
                "flex animate-[hm-line-in_300ms_cubic-bezier(0.22,1,0.36,1)_both] items-center gap-3 px-2 whitespace-pre motion-reduce:animate-none",
                d.sign === "+" && "bg-[#2ea04326]",
                d.sign === "-" && "bg-[#f8514926]",
                d.mark && "bg-[#f5a52422] shadow-[inset_2px_0_0_var(--win-honey)]",
              )}
            >
              <span className="text-[var(--win-muted)]">{d.sign}</span>
              <span className="min-w-0 truncate">{d.text}</span>
              {d.mark ? (
                <span className="ml-auto shrink-0 font-sans text-[11px] text-[var(--win-honey)]">← Hivemind · {d.mark}</span>
              ) : null}
            </div>
          ))}
        </div>
      );
    case "say":
      return (
        <div className="mt-2">
          <span>⏺</span> {s.text}
        </div>
      );
    default:
      return null;
  }
}
