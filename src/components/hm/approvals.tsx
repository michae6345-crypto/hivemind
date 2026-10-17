"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Bot, GitPullRequest, Inbox, MessageSquareQuote, PenLine } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Memory } from "@/mocks/types";
import { useHivemind } from "./store";
import { useGo } from "./nav";
import { useDecide } from "./decisions";
import { DecisionButtons } from "./decision-buttons";
import { Guardrail } from "./guardrail";
import { Avatar, ConfidenceBar, Label, SectionHeader, StatusPill } from "./bits";
import { RichText } from "./rich-text";
import { HexField } from "./hex";
import { approverFor, canApprove, cn, reachFor, scopeChain, scopeLabel, timeAgo } from "./utils";

const SOURCE_ICON = { correction: MessageSquareQuote, review: GitPullRequest, agent: Bot, human: PenLine } as const;
const SOURCE_TEXT = {
  correction: "a correction in a coding session",
  review: "a PR review comment",
  agent: "an agent's proposal",
  human: "a person",
} as const;

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
  const pick = (m: Memory) => {
    const idx = ordered.findIndex((x) => x.id === m.id);
    setSelectedId(ordered.at(idx + 1)?.id ?? ordered.at(idx - 1)?.id ?? null);
  };

  return (
    <div className="flex h-full">
      <div className="flex w-[400px] shrink-0 flex-col border-r border-line bg-panel">
        <SectionHeader right={<span className="text-[12px] text-muted">{ordered.length} waiting</span>}>
          Review queue
        </SectionHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <Group title="For you to approve" items={mine} selected={selected} onSelect={setSelectedId} />
          <Group title="Stopped by a locked rule" items={blocked} selected={selected} onSelect={setSelectedId} />
          <Group title="Waiting on someone else" items={others} selected={selected} onSelect={setSelectedId} />
        </div>
      </div>
      <div className="relative min-w-0 flex-1 overflow-y-auto bg-bg">
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <Detail memory={selected} onDone={() => pick(selected)} />
          </motion.div>
        ) : (
          <div className="relative flex h-full flex-col items-center justify-center gap-2 text-muted">
            <HexField className="absolute inset-0 opacity-40" />
            <Inbox className="relative size-6" />
            <p className="relative text-[14px] text-fg/80">Nothing to review. Every lesson has an owner&apos;s sign-off.</p>
          </div>
        )}
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
    <div className="relative pt-3">
      <div className="px-3 pb-1.5 text-[12px] font-semibold text-fg/60">
        {title} <span className="font-normal text-muted">{items.length}</span>
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
      {items.map((m) => {
        const Icon = m.status === "blocked" ? Ban : SOURCE_ICON[m.source];
        const author = people.find((p) => p.id === m.author);
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
              "flex w-full flex-col gap-1 border-l-2 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-elevated",
              selected?.id === m.id ? "border-accent bg-elevated" : "border-transparent",
              recentlyChanged.has(m.id) && "hm-flash",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className={cn("size-3.5 shrink-0", m.status === "blocked" ? "text-danger" : "text-accent")} />
              <span className={cn("truncate font-medium", m.status === "blocked" && "text-danger")}>{m.title}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(m.updatedAt)}</span>
            </div>
            <div className="flex items-center gap-2 pl-5.5 text-[12px] text-muted">
              <RichText text={scopeLabel(m.scopeId)} inert />
              <span className="truncate">{author?.name ?? (m.author.startsWith("agent:") ? "Agent" : m.author)}</span>
            </div>
          </motion.button>
        );
      })}
      </AnimatePresence>
    </div>
  );
}

function Detail({ memory: m, onDone }: { memory: Memory; onDone: () => void }) {
  const { user, scopes, people, updateMemory, openMemory } = useHivemind();
  const { onApprove, onReject } = useDecide();
  const go = useGo();
  const allowed = canApprove(user, m, scopes);
  const approver = approverFor(m, scopes, people);
  const author = people.find((p) => p.id === m.author);
  const reach = reachFor(m.scopeId, scopes, people);
  const chainIds = new Set(scopeChain(m.scopeId, scopes).map((s) => s.id));
  const scopeOptions = scopes.filter(
    (s) => s.level !== "personal" && (user?.role === "security" || chainIds.has(s.id) || s.parentId === m.scopeId),
  );

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "a" && m.status === "pending") {
        if (await onApprove(m)) onDone();
      } else if (e.key === "r") {
        if (await onReject(m)) onDone();
      } else if (e.key === "e") document.getElementById("hm-scope-select")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto max-w-3xl px-10 py-8">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={m.status} />
        <RichText text={scopeLabel(m.scopeId)} className="text-[12px]" />
      </div>
      <h1 className="mt-2 text-[24px] leading-tight font-semibold tracking-[-0.015em] text-balance">{m.title}</h1>
      <p className="mt-1.5 text-[13px] text-muted">
        Learned from {SOURCE_TEXT[m.source]}
        {author ? ` by ${author.name}` : ""}, {timeAgo(m.updatedAt)}.
      </p>

      {m.status === "blocked" ? (
        <div className="mt-6">
          <Guardrail memory={m} />
        </div>
      ) : (
        <>
          <section className="mt-7">
            <Label>What every agent would be told</Label>
            <div className="rounded-lg border border-line bg-panel px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap">
              <RichText text={m.body} />
            </div>
          </section>

          <section className="mt-6">
            <Label>Where it came from</Label>
            {m.evidence.map((e, i) => {
              const who = people.find((p) => p.id === e.actor);
              return (
                <figure key={i} className="mb-2 rounded-lg border border-line bg-panel px-4 py-3">
                  <blockquote className="border-l-2 border-accent pl-3 text-[15px] leading-snug">“{e.quote}”</blockquote>
                  <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Avatar person={who} id={e.actor} className="size-4 text-[9px]" />
                      {who?.name ?? (e.actor.startsWith("agent:") ? "Agent" : e.actor)}
                    </span>
                    {e.ref ? <span>{e.ref}</span> : null}
                    <span>{timeAgo(e.at)}</span>
                  </figcaption>
                </figure>
              );
            })}
            <p className="text-[12px] text-muted">
              {m.source === "agent"
                ? "Agents can only propose. Nothing reaches another agent until a person approves it."
                : `Hivemind keeps a lesson only when its quote appears word for word in what ${author?.name.split(" ")[0] ?? "the author"} wrote.`}
            </p>
          </section>

          <section className="mt-6 grid grid-cols-2 gap-6">
            <div>
              <Label>Scope</Label>
              <select
                id="hm-scope-select"
                value={m.scopeId}
                disabled={!allowed}
                onChange={(e) => updateMemory(m.id, { scopeId: e.target.value })}
                className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent/60 disabled:opacity-60"
              >
                {scopeOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {scopeLabel(s.id)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[12px] text-muted">
                Once approved, {reach} {reach === 1 ? "person's agent loads" : "people's agents load"} it at session start.
              </p>
            </div>
            <div>
              <Label>Confidence</Label>
              <ConfidenceBar memory={m} />
              <p className="mt-1.5 text-[12px] text-muted">Rises every session it saves someone a correction.</p>
            </div>
          </section>
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <DecisionButtons memory={m} size="md" shortcuts onDone={onDone} />
        {m.status === "pending" && !allowed && approver ? (
          <span className="text-[12px] text-muted">
            Only <RichText text={`@${approver.id}`} /> can approve this for {scopeLabel(m.scopeId)}.
          </span>
        ) : m.status === "pending" ? (
          <span className="text-[12px] text-muted">Press E to change the scope.</span>
        ) : null}
        <button
          type="button"
          onClick={() => {
            openMemory(m.id);
            go("/");
          }}
          className="ml-auto text-[12px] text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Open in vault
        </button>
      </div>
    </div>
  );
}
