"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Bot, Check, GitPullRequest, Hourglass, Inbox, MessageSquareQuote, X } from "lucide-react";
import { toast } from "sonner";
import type { Memory } from "@/mocks/types";
import { useHivemind } from "./store";
import { Avatar, ConfidenceBar, Kbd, LockBadge, SectionHeader, StatusPill } from "./bits";
import { RichText } from "./rich-text";
import { SOURCE_LABEL, approverFor, canApprove, cn, reachFor, scopeChain, scopeLabel, timeAgo } from "./utils";

const SOURCE_ICON = { correction: MessageSquareQuote, review: GitPullRequest, agent: Bot, human: Check } as const;

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

  return (
    <div className="flex h-full">
      <div className="flex w-[420px] shrink-0 flex-col border-r border-line bg-panel">
        <SectionHeader right={<span className="text-[11px] text-muted">{ordered.length} in queue</span>}>
          Approvals
        </SectionHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Group title="Needs your approval" items={mine} selected={selected} onSelect={setSelectedId} />
          <Group title="Blocked by a locked rule" items={blocked} selected={selected} onSelect={setSelectedId} />
          <Group title="Waiting on someone else" items={others} selected={selected} onSelect={setSelectedId} />
          {ordered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-muted">
              <Inbox className="size-6" />
              Inbox zero. Every lesson is reviewed.
            </div>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto bg-bg">
        {selected ? <Detail key={selected.id} memory={selected} onDone={(nextId) => setSelectedId(nextId)} ordered={ordered} /> : null}
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
  const { people } = useHivemind();
  if (!items.length) return null;
  return (
    <div>
      <div className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {title} · {items.length}
      </div>
      {items.map((m) => {
        const Icon = m.status === "blocked" ? Ban : SOURCE_ICON[m.source];
        const author = people.find((p) => p.id === m.author);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            className={cn(
              "flex w-full flex-col gap-1 border-l-2 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-elevated",
              selected?.id === m.id ? "border-accent bg-elevated" : "border-transparent",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className={cn("size-3.5 shrink-0", m.status === "blocked" ? "text-danger" : "text-accent")} />
              <span className="truncate font-medium">{m.title}</span>
              <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(m.updatedAt)}</span>
            </div>
            <div className="flex items-center gap-2 pl-5.5 text-[12px] text-muted">
              <RichText text={scopeLabel(m.scopeId)} inert />
              <span>·</span>
              <span className="truncate">
                {author?.name ?? (m.author.startsWith("agent:") ? "Agent" : m.author)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Detail({
  memory: m,
  ordered,
  onDone,
}: {
  memory: Memory;
  ordered: Memory[];
  onDone: (nextId: string | null) => void;
}) {
  const { user, scopes, people, approve, reject, restore, updateMemory, openMemory } = useHivemind();
  const router = useRouter();
  const allowed = canApprove(user, m, scopes);
  const approver = approverFor(m, scopes, people);
  const author = people.find((p) => p.id === m.author);
  const chainIds = new Set(scopeChain(m.scopeId, scopes).map((s) => s.id));
  const reach = reachFor(m.scopeId, scopes, people);
  const scopeOptions = scopes.filter(
    (s) => s.level !== "personal" && (user?.role === "security" || chainIds.has(s.id) || s.parentId === m.scopeId),
  );
  const next = () => {
    const idx = ordered.findIndex((x) => x.id === m.id);
    return ordered.at(idx + 1)?.id ?? ordered.at(idx - 1)?.id ?? null;
  };

  const doApprove = async () => {
    if (!allowed || m.status !== "pending") return;
    const before = m;
    await approve(m.id);
    toast.success(`Approved "${m.title}"`, {
      description: `${reach || "Every"} agent${reach === 1 ? "" : "s"} in ${scopeLabel(m.scopeId)} get it next session.`,
      action: { label: "Undo", onClick: () => restore(before) },
    });
    onDone(next());
  };
  const doReject = async () => {
    if (!allowed) return;
    const before = m;
    await reject(m.id);
    toast(`Rejected "${m.title}"`, { action: { label: "Undo", onClick: () => restore(before) } });
    onDone(next());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "a") doApprove();
      else if (e.key === "r") doReject();
      else if (e.key === "e") document.getElementById("hm-scope-select")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto max-w-3xl px-8 py-7">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <StatusPill status={m.status} />
        {m.locked ? <LockBadge /> : null}
        <span>{SOURCE_LABEL[m.source]}</span>
        <span>·</span>
        <span>{timeAgo(m.updatedAt)}</span>
      </div>
      <h1 className="mt-2 text-[22px] leading-snug font-semibold tracking-tight">{m.title}</h1>

      {m.status === "blocked" && m.blockedReason ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px]">
          <Ban className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <div className="font-semibold text-danger">Blocked before anyone saw it</div>
            <RichText text={m.blockedReason} />
            <div className="mt-1 text-[12px] text-muted">Locked rules can&apos;t be overridden from below. It never reaches an agent.</div>
          </div>
        </div>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">The lesson</h2>
        <div className="rounded-md border border-line bg-panel px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap">
          <RichText text={m.body} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">Receipt</h2>
        {m.evidence.map((e, i) => {
          const who = people.find((p) => p.id === e.actor);
          return (
            <figure key={i} className="mb-2 rounded-md border border-line bg-panel px-4 py-3">
              <blockquote className="border-l-2 border-accent pl-3 text-[15px] leading-snug">“{e.quote}”</blockquote>
              <figcaption className="mt-2 flex items-center gap-2 text-[12px] text-muted">
                <Avatar person={who} id={e.actor} className="size-4 text-[9px]" />
                {who?.name ?? (e.actor.startsWith("agent:") ? "Agent" : e.actor)}
                {e.ref ? <span className="font-mono">· {e.ref}</span> : null}
                <span>· {timeAgo(e.at)}</span>
              </figcaption>
            </figure>
          );
        })}
        <p className="mt-1 text-[12px] text-muted">
          {m.source === "agent"
            ? "Agents can only propose. Nothing reaches another agent until a person approves it."
            : `Kept only because this quote appears word for word in what ${author?.name.split(" ")[0] ?? "the author"} wrote.`}
        </p>
      </section>

      {m.status === "blocked" ? null : (
      <section className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">Scope</h2>
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
            {reach} {reach === 1 ? "person's agent loads" : "people's agents load"} it once approved.
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">Confidence</h2>
          <ConfidenceBar memory={m} />
          <p className="mt-1.5 text-[12px] text-muted">Rises each session it prevents a correction.</p>
        </div>
      </section>
      )}

      <div className="mt-8 flex items-center gap-2 border-t border-line pt-5">
        {allowed ? (
          <>
            {m.status === "pending" ? (
              <button
                type="button"
                onClick={doApprove}
                className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-black transition-[filter] duration-150 hover:brightness-110"
              >
                <Check className="size-4" /> Approve <Kbd>A</Kbd>
              </button>
            ) : null}
            <button
              type="button"
              onClick={doReject}
              className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[13px] text-muted transition-colors duration-150 hover:border-danger/50 hover:text-danger"
            >
              <X className="size-4" /> {m.status === "blocked" ? "Dismiss" : "Reject"} <Kbd>R</Kbd>
            </button>
            {m.status === "pending" ? (
              <span className="ml-1 flex items-center gap-1 text-[12px] text-muted">
                <Kbd>E</Kbd> change scope
              </span>
            ) : null}
          </>
        ) : (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Hourglass className="size-4 text-accent" />
            {approver ? (
              <>
                Waiting for <RichText text={`@${approver.id}`} /> to review it for {scopeLabel(m.scopeId)}.
              </>
            ) : (
              "Waiting for review."
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            openMemory(m.id);
            router.push("/");
          }}
          className="ml-auto text-[12px] text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Open in vault
        </button>
      </div>
    </div>
  );
}
