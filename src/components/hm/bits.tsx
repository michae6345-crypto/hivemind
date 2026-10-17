"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import type { Memory, Person } from "@/mocks/types";
import { STATUS_META, cn, confidence } from "./utils";

// The tonal chain mark (logo canvas, direction 11): a locked rule on top, an approved lesson
// overlapping it, and a dashed cell for the next lesson. On the light page the overlap blends with `multiply`.
const CELL_LOCK = "M60 13L84.25 27L84.25 55L60 69L35.75 55L35.75 27Z";
const CELL_LESSON = "M38 51.1L62.25 65.1L62.25 93.1L38 107.1L13.75 93.1L13.75 65.1Z";
const CELL_NEXT = "M82 52.7L104.86 65.9L104.86 92.3L82 105.5L59.14 92.3L59.14 65.9Z";

/** The mark. `intro` plays the one-time assembly: the rule lands, the lesson joins it, the next cell appears. */
export function Logo({ className, intro = false }: { className?: string; intro?: boolean }) {
  const pop = (delay: number) =>
    intro
      ? {
          initial: { scale: 0.3, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          transition: { type: "spring" as const, stiffness: 520, damping: 24, delay },
        }
      : {};
  return (
    <svg viewBox="0 0 120 120" className={cn("size-5 overflow-visible", className)} aria-hidden>
      <motion.path d={CELL_LOCK} fill="var(--chip-lock)" style={{ mixBlendMode: "multiply" }} {...pop(0.1)} />
      <motion.path d={CELL_LESSON} fill="var(--honey)" style={{ mixBlendMode: "multiply" }} {...pop(0.28)} />
      <motion.path
        d={CELL_NEXT}
        fill="none"
        stroke="var(--honey)"
        strokeWidth="7.5"
        strokeDasharray="13 8"
        strokeLinejoin="round"
        {...(intro
          ? {
              initial: { rotate: -60, opacity: 0 },
              animate: { rotate: 0, opacity: 1 },
              transition: { type: "spring" as const, stiffness: 260, damping: 20, delay: 0.46 },
            }
          : {})}
      />
    </svg>
  );
}

const TITTLE = "M50 4L89.84 27L89.84 73L50 96L10.16 73L10.16 27Z";

/** "hivemind" set in Syne Bold with hexagon dots on the i's: one honey, one locked-rule rose. */
export function Wordmark({ className }: { className?: string }) {
  const i = (fill: string) => (
    <span className="relative inline-block" aria-hidden>
      ı
      <svg viewBox="0 0 100 100" className="absolute top-[0.1em] left-1/2 size-[0.2em] -translate-x-1/2">
        <path d={TITTLE} fill={fill} />
      </svg>
    </span>
  );
  return (
    <span className={cn("font-brand leading-none font-bold tracking-[-0.03em]", className)}>
      <span className="sr-only">Hivemind</span>
      <span aria-hidden>
        h{i("var(--honey)")}vem{i("var(--chip-lock)")}nd
      </span>
    </span>
  );
}

export function StatusPill({ status, className }: { status: Memory["status"]; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function LockBadge({ className }: { className?: string }) {
  return (
    <span className={cn("hm-chip inline-flex h-5 items-center gap-1 text-[11px]", className)} data-kind="lock">
      <Lock className="size-3" /> Locked
    </span>
  );
}

export function ConfidenceBar({ memory, className }: { memory: Memory; className?: string }) {
  const c = confidence(memory);
  const pct = Math.round(c * 100);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${Math.max(pct, 2)}%`,
            background: memory.locked ? "var(--chip-lock)" : "var(--honey)",
          }}
        />
      </div>
      <span className="w-14 text-right font-mono text-[11px] text-muted tabular-nums">
        {memory.locked ? "locked" : `${pct}%`}
      </span>
    </div>
  );
}

export function Avatar({ person, id, className }: { person?: Person; id: string; className?: string }) {
  const isAgent = id.startsWith("agent:");
  const label = isAgent ? "AI" : (person?.name ?? id).split(" ").map((w) => w[0]).join("").slice(0, 2);
  return (
    <span
      title={isAgent ? "Agent" : person?.name}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        isAgent ? "bg-link/12 text-link" : "bg-elevated text-fg/80 ring-1 ring-line",
        className,
      )}
    >
      {label.toUpperCase()}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/20 px-1 font-mono text-[10px] opacity-60">
      {children}
    </kbd>
  );
}

export function SectionHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
      <span className="text-[12px] font-semibold text-fg/70">{children}</span>
      {right}
    </div>
  );
}

/** Small heading inside a panel. Sentence case on purpose; no all-caps eyebrows. */
export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("mb-2 text-[12px] font-semibold text-fg/60", className)}>{children}</h3>;
}
