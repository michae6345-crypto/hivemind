"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { Ban, Hourglass, Lock, X } from "lucide-react";
import type { Memory, Person } from "@/mocks/types";
import { useHivemind } from "./store";
import { hmTokens } from "./cm-tokens";
import { useEntities } from "./use-entities";
import { ConfidenceBar, LockBadge, StatusPill } from "./bits";
import { RichText } from "./rich-text";
import { Guardrail } from "./guardrail";
import { DecisionButtons } from "./decision-buttons";
import { HexField } from "./hex";
import { approverFor, canApprove, canLock, cn, scopeLabel, timeAgo } from "./utils";

export function MemoryEditor() {
  const { openTabs, activeTab, memories, openMemory, closeTab } = useHivemind();
  const tabs = openTabs.map((id) => memories.find((m) => m.id === id)).filter((m): m is Memory => !!m);
  const active = tabs.find((m) => m.id === activeTab) ?? null;

  return (
    <div className="flex h-full min-w-0 flex-col bg-bg">
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-panel" role="tablist">
        {tabs.map((m) => (
          <div
            key={m.id}
            role="tab"
            aria-selected={m.id === activeTab}
            className={cn(
              "group relative flex max-w-60 shrink-0 items-center gap-1.5 border-r border-line pr-1 pl-3 text-[12px] transition-colors duration-150",
              m.id === activeTab ? "bg-bg text-fg" : "text-muted hover:text-fg",
            )}
          >
            {m.id === activeTab ? <span className="absolute inset-x-0 top-0 h-px bg-accent" /> : null}
            <button type="button" onClick={() => openMemory(m.id)} className="flex min-w-0 items-center gap-1.5">
              {m.locked ? (
                <Lock className="size-3 shrink-0 text-lock" />
              ) : m.status === "pending" ? (
                <Hourglass className="size-3 shrink-0 text-accent" />
              ) : m.status === "blocked" ? (
                <Ban className="size-3 shrink-0 text-danger" />
              ) : null}
              <span className="truncate">{m.title}</span>
            </button>
            <button
              type="button"
              aria-label={`Close ${m.title}`}
              onClick={() => closeTab(m.id)}
              className="rounded p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-elevated focus-visible:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
      {active ? <MemoryView key={active.id} memory={active} /> : <EmptyEditor />}
    </div>
  );
}

function EmptyEditor() {
  const { setComposerOpen } = useHivemind();
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden text-muted">
      <HexField className="absolute inset-0 opacity-[0.35]" />
      <p className="relative text-[14px] text-fg/80">Open a lesson from the vault, or write a rule every agent will follow.</p>
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="relative h-8 rounded-md border border-line bg-panel px-3 text-[13px] text-fg transition-colors duration-150 hover:border-accent/50"
      >
        Write a rule
      </button>
    </div>
  );
}

function provenance(m: Memory, author: Person | undefined) {
  const who = author?.name ?? (m.author.startsWith("agent:") ? "an agent" : m.author);
  const kind = m.kind === "owner" ? "Owner note" : m.kind.charAt(0).toUpperCase() + m.kind.slice(1);
  switch (m.source) {
    case "correction":
      return `${kind} learned from ${who}'s correction`;
    case "review":
      return `${kind} learned from ${who}'s PR review`;
    case "agent":
      return `${kind} proposed by an agent`;
    default:
      return `${kind} written by ${who}`;
  }
}

function MemoryView({ memory: m }: { memory: Memory }) {
  const { user, scopes, people, updateMemory, select, memoryBySlug, openMemory, recentlyChanged } = useHivemind();
  const entities = useEntities();
  const allowed = canApprove(user, m, scopes);
  const approver = approverFor(m, scopes, people);
  const editable = (!m.locked || canLock(user)) && (allowed || m.author === user?.id) && m.status !== "blocked";
  const author = people.find((p) => p.id === m.author);
  const flash = recentlyChanged.has(m.id);

  const extensions = useMemo(
    () =>
      hmTokens({
        entities,
        onChipClick: (kind, id) => {
          if (kind === "link") {
            const target = memoryBySlug(id);
            if (target) openMemory(target.id);
          } else if (kind === "person") select({ kind: "person", id });
          else if (kind !== "lock") select({ kind: "scope", id });
        },
      }),
    [entities, memoryBySlug, openMemory, select],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("shrink-0 border-b border-line px-6 pt-5 pb-4", flash && "hm-flash")}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <StatusPill status={m.status} />
              {m.locked ? <LockBadge /> : null}
              <RichText text={scopeLabel(m.scopeId)} className="text-[12px]" />
            </div>
            <h1 className="text-[20px] leading-snug font-semibold tracking-[-0.01em] text-balance">{m.title}</h1>
            <p className="mt-1 text-[12px] text-muted">
              {provenance(m, author)}, {timeAgo(m.updatedAt)}
              {m.expiresAt ? `. Expires ${new Date(m.expiresAt).toLocaleDateString()}` : ""}
            </p>
          </div>
          <div className="shrink-0 pt-6">
            <DecisionButtons memory={m} />
          </div>
        </div>

        {m.status === "blocked" ? (
          <div className="mt-4">
            <Guardrail memory={m} />
          </div>
        ) : null}

        {m.status === "pending" && !allowed && approver ? (
          <p className="mt-3 text-[12px] text-muted">
            Waiting on <RichText text={`@${approver.id}`} /> to approve it for {scopeLabel(m.scopeId)}.
          </p>
        ) : null}

        {m.status === "invalid" && m.invalidatedBy ? (
          <p className="mt-3 text-[12px] text-muted">
            Replaced by <RichText text={`[[${m.invalidatedBy}]]`} />. Kept for history; never sent to agents.
          </p>
        ) : null}

        {m.status !== "blocked" ? (
          <div className="mt-4 flex max-w-md items-center gap-3">
            <span className="w-20 shrink-0 text-[12px] text-muted">Confidence</span>
            <ConfidenceBar memory={m} className="flex-1" />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          value={m.body}
          height="100%"
          className="h-full"
          theme="none"
          basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLineGutter: false, autocompletion: false }}
          editable={editable}
          extensions={extensions}
          onChange={(body) => updateMemory(m.id, { body })}
        />
      </div>

      {!editable ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-line px-6 py-2 text-[12px] text-muted">
          <Lock className="size-3" />
          {m.status === "blocked"
            ? "Blocked lessons can't be edited into shape. Dismiss it, or change the locked rule."
            : m.locked
              ? "Only Security can edit a locked rule."
              : "Read-only for your role. When you correct your agent, Hivemind proposes the lesson here."}
        </div>
      ) : null}
    </div>
  );
}
