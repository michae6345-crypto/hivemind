"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Lock, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Memory, Scope } from "@/mocks/types";
import { useHivemind } from "./store";
import { useGo } from "./nav";
import { StatusPill } from "./bits";
import { DecisionButtons } from "./decision-buttons";
import { RichText } from "./rich-text";
import { Handles } from "./handles";
import { cn, reachFor, scopeLabel, timeAgo } from "./utils";

const GROUPS: { level: Scope["level"]; title: string }[] = [
  { level: "org", title: "Company" },
  { level: "team", title: "Team" },
  { level: "repo", title: "Repo" },
];

const SOURCE_TEXT = {
  correction: "a correction in a coding session",
  review: "a PR review comment",
  agent: "an agent's proposal",
  human: "a person",
} as const;

/** Lessons: every lesson the company's agents share, grouped by where it applies, and one readable card. */
export function Lessons() {
  const { memories, scopes, openId, openMemory } = useHivemind();
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const levelOf = new Map(scopes.map((s) => [s.id, s.level]));
    const shown = memories.filter(
      (m) =>
        m.status !== "rejected" &&
        m.status !== "invalid" &&
        (!needle || m.title.toLowerCase().includes(needle) || m.body.toLowerCase().includes(needle)),
    );
    const rank = (m: Memory) => (m.locked ? 0 : m.status === "active" ? 1 : m.status === "pending" ? 2 : 3);
    return GROUPS.map((g) => ({
      ...g,
      items: shown
        .filter((m) => levelOf.get(m.scopeId) === g.level)
        .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title)),
    })).filter((g) => g.items.length);
  }, [memories, scopes, q]);

  const flat = groups.flatMap((g) => g.items);
  const open = flat.find((m) => m.id === openId) ?? memories.find((m) => m.id === openId) ?? flat[0] ?? null;

  // Up / down step through the list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const i = flat.findIndex((m) => m.id === open?.id);
      const next = flat[e.key === "ArrowDown" ? Math.min(flat.length - 1, i + 1) : Math.max(0, i - 1)];
      if (next) {
        e.preventDefault();
        openMemory(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, open, openMemory]);

  return (
    <div className="flex h-full">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="p-3">
          <label className="flex h-9 items-center gap-2 rounded-full bg-elevated px-3.5 text-muted focus-within:ring-2 focus-within:ring-accent/30">
            <Search className="size-3.5" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter lessons"
              className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-muted"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((g) => (
            <section key={g.level} className="mt-2">
              <h2 className="px-2.5 pt-2 pb-1.5 text-[12px] font-medium text-muted">
                {g.title} <span className="text-muted/70 tabular-nums">{g.items.length}</span>
              </h2>
              {g.items.map((m) => (
                <Row key={m.id} memory={m} active={open?.id === m.id} onClick={() => openMemory(m.id)} />
              ))}
            </section>
          ))}
          {!groups.length ? <p className="px-3 py-6 text-[13px] text-muted">No lessons match “{q}”.</p> : null}
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.div
              key={open.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-[720px] px-8 py-10"
            >
              <LessonCard memory={open} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A lesson's mark in the list: locked rule, approved lesson (honey), waiting (dashed), blocked. */
function Mark({ memory: m }: { memory: Memory }) {
  if (m.locked) return <Lock className="size-3.5 shrink-0 text-lock" />;
  if (m.status === "blocked") return <Ban className="size-3.5 shrink-0 text-danger" />;
  return (
    <svg viewBox="-8 -8 16 16" className="size-3.5 shrink-0" aria-hidden>
      <path
        d="M0-6.5L5.63-3.25L5.63 3.25L0 6.5L-5.63 3.25L-5.63-3.25Z"
        fill={m.status === "active" ? "var(--honey)" : "none"}
        stroke="var(--honey)"
        strokeWidth={1.4}
        strokeDasharray={m.status === "pending" ? "2.4 1.8" : undefined}
      />
    </svg>
  );
}

function Row({ memory: m, active, onClick }: { memory: Memory; active: boolean; onClick: () => void }) {
  const { recentlyChanged } = useHivemind();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-150",
        active ? "bg-elevated" : "hover:bg-elevated/70",
        recentlyChanged.has(m.id) && "hm-flash",
      )}
      title={m.title}
    >
      <Mark memory={m} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13.5px]", active ? "font-medium text-fg" : "text-fg/85", m.status === "blocked" && "text-danger")}>
          {m.title}
        </span>
        <span className="block truncate font-mono text-[11px] text-muted">{scopeLabel(m.scopeId)}</span>
      </span>
    </button>
  );
}

/** One lesson, written to be read: what agents are told, where it came from, who it reaches. */
function LessonCard({ memory: m }: { memory: Memory }) {
  const { people, scopes } = useHivemind();
  const go = useGo();
  const author = people.find((p) => p.id === m.author);
  const reach = reachFor(m.scopeId, scopes, people);
  const quote = m.evidence[0];
  const quoted = quote ? people.find((p) => p.id === quote.actor) : undefined;

  return (
    <article className="hm-card p-8">
      <div className="flex flex-wrap items-center gap-2">
        {m.locked ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-lock/10 px-2.5 text-[12px] font-medium text-lock">
            <Lock className="size-3" /> Locked rule
          </span>
        ) : (
          <StatusPill status={m.status} className="h-6 rounded-full px-2.5 text-[12px]" />
        )}
        <RichText text={scopeLabel(m.scopeId)} inert className="text-[13px]" />
      </div>

      <h1 className="mt-4 text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">{m.title}</h1>

      <div className="mt-5 text-[16px] leading-relaxed whitespace-pre-wrap text-fg/90">
        <RichText text={m.body.replace(/^🔒\s*/u, "")} />
      </div>

      {quote ? (
        <figure className="mt-7 rounded-xl bg-elevated px-5 py-4">
          <blockquote className="text-[15px] leading-snug">“{quote.quote}”</blockquote>
          <figcaption className="mt-2 text-[12.5px] text-muted">
            {quoted ? <Handles text={`@${quoted.id}`} /> : quote.actor.startsWith("agent:") ? "An agent" : quote.actor}
            {quote.ref ? `, ${quote.ref}` : ""}, {timeAgo(quote.at)}
          </figcaption>
        </figure>
      ) : null}

      <p className="mt-7 border-t border-line pt-5 text-[13px] leading-relaxed text-muted">
        <Handles
          text={m.locked
          ? `Locked by ${author ? `@${author.id}, ${author.title}` : "Security"}. Any lesson that contradicts it is blocked before it reaches an agent.`
          : m.status === "active"
            ? `Learned from ${SOURCE_TEXT[m.source]}${author ? ` by @${author.id}` : ""}. ${reach} ${reach === 1 ? "person's agent loads" : "people's agents load"} it at the start of every session.`
            : m.status === "pending"
              ? `Learned from ${SOURCE_TEXT[m.source]}${author ? ` by @${author.id}` : ""}. No agent sees it until it's approved.`
              : "It contradicts a locked rule, so no agent will ever see it."}
        />
      </p>

      {m.status === "pending" || m.status === "blocked" ? (
        <div className="mt-5 flex items-center gap-3">
          <DecisionButtons memory={m} />
          <button
            type="button"
            onClick={() => go("/app/approvals")}
            className="ml-auto text-[13px] text-muted underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline"
          >
            Open in Approvals
          </button>
        </div>
      ) : null}
    </article>
  );
}
