"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { Ban, Check, Hourglass, Lock, X } from "lucide-react";
import { toast } from "sonner";
import type { Memory } from "@/mocks/types";
import { useHivemind } from "./store";
import { hmTokens } from "./cm-tokens";
import { useEntities } from "./use-entities";
import { Avatar, ConfidenceBar, LockBadge, StatusPill } from "./bits";
import { RichText } from "./rich-text";
import { SOURCE_LABEL, approverFor, canApprove, canLock, cn, scopeLabel, timeAgo } from "./utils";

export function MemoryEditor() {
  const { openTabs, activeTab, memories, openMemory, closeTab } = useHivemind();
  const tabs = openTabs
    .map((id) => memories.find((m) => m.id === id))
    .filter((m): m is Memory => !!m);
  const active = tabs.find((m) => m.id === activeTab) ?? null;

  return (
    <div className="flex h-full min-w-0 flex-col bg-bg">
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-panel">
        {tabs.map((m) => (
          <div
            key={m.id}
            className={cn(
              "group flex max-w-56 shrink-0 items-center gap-1.5 border-r border-line pr-1 pl-3 text-[12px] transition-colors duration-150",
              m.id === activeTab ? "bg-bg text-fg" : "text-muted hover:text-fg",
            )}
          >
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
              className="rounded p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-elevated"
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
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
      <svg viewBox="0 0 24 24" className="size-10 opacity-40" aria-hidden>
        <path d="M12 2.5 20.2 7.25v9.5L12 21.5 3.8 16.75v-9.5L12 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <span>Open a lesson from the vault.</span>
    </div>
  );
}

function MemoryView({ memory: m }: { memory: Memory }) {
  const { user, scopes, people, approve, reject, restore, updateMemory, select, memoryBySlug, openMemory } =
    useHivemind();
  const entities = useEntities();
  const allowed = canApprove(user, m, scopes);
  const approver = approverFor(m, scopes, people);
  const editable = (!m.locked || canLock(user)) && (allowed || m.author === user?.id);
  const author = people.find((p) => p.id === m.author);

  const extensions = useMemo(
    () => [
      ...hmTokens({
        entities,
        onChipClick: (kind, id) => {
          if (kind === "link") {
            const target = memoryBySlug(id);
            if (target) openMemory(target.id);
          } else if (kind === "person") select({ kind: "person", id });
          else if (kind !== "lock") select({ kind: "scope", id });
        },
      }),
    ],
    // entities change on every poll; rebuilding extensions is cheap at this size
    [entities, memoryBySlug, openMemory, select],
  );

  const doApprove = async () => {
    const before = m;
    await approve(m.id);
    toast.success(`Approved "${m.title}"`, {
      description: `Every agent in ${scopeLabel(m.scopeId)} gets it next session.`,
      action: { label: "Undo", onClick: () => restore(before) },
    });
  };
  const doReject = async () => {
    const before = m;
    await reject(m.id);
    toast(`Rejected "${m.title}"`, { action: { label: "Undo", onClick: () => restore(before) } });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-line px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 text-[18px] leading-snug font-semibold tracking-tight">{m.title}</h1>
          {(m.status === "pending" || m.status === "blocked") && allowed ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={doReject}
                className="flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-[12px] text-muted transition-colors duration-150 hover:border-danger/50 hover:text-danger"
              >
                <X className="size-3.5" /> Reject
              </button>
              {m.status === "pending" ? (
                <button
                  type="button"
                  onClick={doApprove}
                  className="flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-[12px] font-semibold text-black transition-[filter] duration-150 hover:brightness-110"
                >
                  <Check className="size-3.5" /> Approve
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <StatusPill status={m.status} />
          {m.locked ? <LockBadge /> : null}
          <RichText text={scopeLabel(m.scopeId)} />
          <span className="capitalize">{m.kind}</span>
          <span>·</span>
          <span>{SOURCE_LABEL[m.source]}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Avatar person={author} id={m.author} className="size-4 text-[9px]" />
            {author?.name ?? (m.author.startsWith("agent:") ? "Agent" : m.author)}
          </span>
          <span>·</span>
          <span>{timeAgo(m.updatedAt)}</span>
        </div>

        {m.status === "blocked" && m.blockedReason ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px]">
            <Ban className="mt-0.5 size-3.5 shrink-0 text-danger" />
            <RichText text={m.blockedReason} />
          </div>
        ) : null}

        {m.status === "pending" && !allowed && approver ? (
          <div className="mt-3 text-[12px] text-muted">
            Waiting for <RichText text={`@${approver.id}`} /> to approve for {scopeLabel(m.scopeId)}.
          </div>
        ) : null}

        {m.status === "invalid" && m.invalidatedBy ? (
          <div className="mt-3 text-[12px] text-muted">
            Invalidated by <RichText text={`[[${m.invalidatedBy}]]`} />. Kept for history, never served to agents.
          </div>
        ) : null}

        <ConfidenceBar memory={m} className="mt-3 max-w-sm" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          value={m.body}
          height="100%"
          className="h-full"
          theme="none"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLineGutter: false,
            autocompletion: false,
          }}
          editable={editable}
          extensions={extensions}
          onChange={(body) => updateMemory(m.id, { body })}
        />
      </div>

      {!editable ? (
        <div className="shrink-0 border-t border-line px-5 py-2 text-[11px] text-muted">
          {m.locked
            ? "Locked by Security. Only Security can edit locked rules."
            : "Read-only for your role. Corrections you give your agent are proposed here for review."}
        </div>
      ) : null}
    </div>
  );
}
