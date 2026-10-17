"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Inbox } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Memory } from "@/mocks/types";
import { useHivemind } from "./store";
import { useDecide } from "./decisions";
import { DecisionButtons } from "./decision-buttons";
import { Guardrail } from "./guardrail";
import { StatusPill } from "./bits";
import { RichText } from "./rich-text";
import { Handles } from "./handles";
import { HexField } from "./hex";
import { LiveActivity } from "./activity";
import { approverFor, canApprove, cn, reachFor, scopeLabel, timeAgo } from "./utils";

const SOURCE_TEXT = {
  correction: "a correction in a coding session",
  review: "a PR review comment",
  agent: "an agent's proposal",
  human: "a person",
} as const;

/** Approvals: one question, one lesson at a time. Approve (A) or reject (R). */
export function Approvals() {
  const { memories, scopes, user } = useHivemind();
  const queue = useMemo(
    () =>
      memories
        .filter((m) => m.status === "pending" || m.status === "blocked")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [memories],
  );
  const mine = queue.filter((m) => m.status === "pending" && canApprove(user, m, scopes));
  const blocked = queue.filter((m) => m.status === "blocked");
  const others = queue.filter((m) => m.status === "pending" && !canApprove(user, m, scopes));
  const ordered = [...mine, ...blocked, ...others];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ordered.find((m) => m.id === selectedId) ?? ordered[0] ?? null;
  const next = (m: Memory) => {
    const idx = ordered.findIndex((x) => x.id === m.id);
    setSelectedId(ordered.at(idx + 1)?.id ?? ordered.at(idx - 1)?.id ?? null);
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-4">
          <Group title="For you to approve" items={mine} selected={selected} onSelect={setSelectedId} />
          <Group title="Stopped by a locked rule" items={blocked} selected={selected} onSelect={setSelectedId} />
          <Group title="Waiting on someone else" items={others} selected={selected} onSelect={setSelectedId} />
          {!ordered.length ? <p className="px-3 py-6 text-[13px] text-muted">The queue is empty.</p> : null}
        </div>
        <LiveActivity />
      </aside>

      <div className="relative min-w-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.16, ease: "easeIn" } }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-[720px] px-8 py-10"
            >
              <Detail memory={selected} onDone={() => next(selected)} />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative flex h-full flex-col items-center justify-center gap-2 text-muted"
            >
              <HexField className="absolute inset-0 opacity-60" />
              <Inbox className="relative size-6" />
              <p className="relative text-[15px] text-fg/80">Nothing to review. Every lesson has an owner&apos;s sign-off.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Group({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: Memory[];
  selected: Memory | null;
  onSelect: (id: string) => void;
}) {
  const { people, recentlyChanged } = useHivemind();
  if (!items.length) return null;
  return (
    <section className="mt-2">
      <h2 className="px-2.5 pt-2 pb-1.5 text-[12px] font-medium text-muted">
        {title} <span className="text-muted/70 tabular-nums">{items.length}</span>
      </h2>
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((m) => {
          const author = people.find((p) => p.id === m.author);
          const active = selected?.id === m.id;
          return (
            <motion.button
              key={m.id}
              layout="position"
              // New lessons slide in from the top; a decided one leaves to the right as the rest close the gap.
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, x: 48, transition: { duration: 0.18, ease: "easeIn" } }}
              type="button"
              onClick={() => onSelect(m.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-150",
                active ? "bg-elevated" : "hover:bg-elevated/70",
                recentlyChanged.has(m.id) && "hm-flash",
              )}
            >
              {m.status === "blocked" ? (
                <Ban className="size-3.5 shrink-0 text-danger" />
              ) : (
                <span className="mx-[3px] size-2 shrink-0 rounded-full bg-honey" />
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13.5px]", active ? "font-medium" : "text-fg/85", m.status === "blocked" && "text-danger")}>
                  {m.title}
                </span>
                <span className="block truncate text-[11.5px] text-muted">
                  {author ? <Handles text={`@${author.id}`} /> : m.author.startsWith("agent:") ? "An agent" : m.author} · {timeAgo(m.updatedAt)}
                </span>
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </section>
  );
}

function Detail({ memory: m, onDone }: { memory: Memory; onDone: () => void }) {
  const { user, scopes, people } = useHivemind();
  const { onApprove, onReject } = useDecide();
  const allowed = canApprove(user, m, scopes);
  const approver = approverFor(m, scopes, people);
  const author = people.find((p) => p.id === m.author);
  const reach = reachFor(m.scopeId, scopes, people);
  const quote = m.evidence.at(-1);
  const quoted = quote ? people.find((p) => p.id === quote.actor) : undefined;

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "a" && m.status === "pending") {
        if (await onApprove(m)) onDone();
      } else if (e.key === "r") {
        if (await onReject(m)) onDone();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <article className="hm-card p-8">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={m.status} className="h-6 rounded-full px-2.5 text-[12px]" />
        <RichText text={scopeLabel(m.scopeId)} inert className="text-[13px]" />
      </div>
      <h1 className="mt-4 text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">{m.title}</h1>
      <p className="mt-2 text-[13.5px] text-muted">
        Learned from {SOURCE_TEXT[m.source]}
        {author ? <> by <Handles text={`@${author.id}`} /></> : ""}, {timeAgo(m.updatedAt)}.
      </p>

      {m.status === "blocked" ? (
        <div className="mt-7">
          <Guardrail memory={m} />
        </div>
      ) : (
        <>
          <div className="mt-6 text-[16px] leading-relaxed whitespace-pre-wrap text-fg/90">
            <RichText text={m.body.replace(/^🔒\s*/u, "")} />
          </div>
          {quote ? (
            <figure className="mt-6 rounded-xl bg-elevated px-5 py-4">
              <blockquote className="text-[15px] leading-snug">“{quote.quote}”</blockquote>
              <figcaption className="mt-2 text-[12.5px] text-muted">
                {quoted ? <Handles text={`@${quoted.id}`} /> : quote.actor.startsWith("agent:") ? "An agent" : quote.actor}
                {quote.ref ? `, ${quote.ref}` : ""}, {timeAgo(quote.at)}
              </figcaption>
            </figure>
          ) : null}
          <p className="mt-6 text-[13px] text-muted">
            {m.source === "agent" ? "Agents can only propose. Nothing reaches another agent until a person approves it. " : ""}
            Once approved, {reach} {reach === 1 ? "person's agent loads" : "people's agents load"} it at the start of their next session.
          </p>
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <DecisionButtons memory={m} size="md" shortcuts onDone={onDone} />
        {m.status === "pending" && !allowed && approver ? (
          <span className="text-[13px] text-muted">
            <Handles text={`Only @${approver.id} can approve this for ${scopeLabel(m.scopeId)}.`} />
          </span>
        ) : null}
      </div>
    </article>
  );
}
