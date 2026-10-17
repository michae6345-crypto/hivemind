"use client";

import { Lock } from "lucide-react";
import type { Memory, Person } from "@/mocks/types";
import { STATUS_META, cn, confidence } from "./utils";

export function Logo({ className }: { className?: string }) {
  // Hexagon cell with a smaller cell inside: the "hive".
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      <path
        d="M12 2.5 20.2 7.25v9.5L12 21.5 3.8 16.75v-9.5L12 2.5Z"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 8.2 15.3 10.1v3.8L12 15.8 8.7 13.9v-3.8L12 8.2Z" fill="var(--accent)" />
    </svg>
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
            background: memory.locked ? "var(--chip-lock)" : "var(--accent)",
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
        isAgent ? "bg-link/15 text-link" : "bg-person/15 text-person",
        className,
      )}
    >
      {label.toUpperCase()}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-line bg-elevated px-1 font-mono text-[10px] text-muted">
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
