"use client";

import {
  Ban,
  Bot,
  Check,
  GitPullRequest,
  MessageSquareQuote,
  PlayCircle,
  ShieldX,
  TriangleAlert,
  ArrowRightLeft,
  X,
  FileText,
} from "lucide-react";
import type { Evidence, FeedEvent } from "@/mocks/types";
import { useHivemind } from "./store";
import { Avatar, ConfidenceBar, SectionHeader, StatusPill } from "./bits";
import { RichText } from "./rich-text";
import { confidence, scopeChain, scopeLabel, timeAgo } from "./utils";

export function Inspector() {
  const { selection, activeTab } = useHivemind();
  const sel = selection ?? (activeTab ? { kind: "memory" as const, id: activeTab } : null);

  return (
    <div className="flex h-full flex-col bg-panel">
      <SectionHeader>Inspector</SectionHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sel?.kind === "memory" ? <MemoryInspector id={sel.id} /> : null}
        {sel?.kind === "person" ? <PersonInspector id={sel.id} /> : null}
        {sel?.kind === "scope" ? <ScopeInspector id={sel.id} /> : null}
        {!sel ? <p className="p-3 text-muted">Select a lesson, person or scope.</p> : null}
      </div>
      <LiveFeed />
    </div>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function MemoryInspector({ id }: { id: string }) {
  const { memories, scopes } = useHivemind();
  const m = memories.find((x) => x.id === id);
  if (!m) return null;
  const chain = scopeChain(m.scopeId, scopes).reverse();
  const backlinks = memories.filter((x) => x.id !== m.id && x.body.includes(`[[${m.slug}]]`));
  const c = confidence(m);

  return (
    <>
      <Block title="Confidence">
        <ConfidenceBar memory={m} />
        <p className="mt-2 text-[12px] text-muted">
          {m.locked
            ? "Locked rules bypass scoring and never decay."
            : `${plural(Math.round(m.alpha - 1), "confirmation")}, ${plural(Math.round(m.beta - 1), "contradiction")}. Ranked by the lower bound of its 95% interval: ${(c * 100).toFixed(0)}%.`}
        </p>
      </Block>

      <Block title={`Receipt · ${m.evidence.length} source${m.evidence.length === 1 ? "" : "s"}`}>
        {m.evidence.length === 0 ? (
          <p className="text-[12px] text-muted">Written directly by a person; no correction behind it.</p>
        ) : (
          <ul className="space-y-2">
            {m.evidence.map((e, i) => (
              <EvidenceCard key={i} e={e} />
            ))}
          </ul>
        )}
      </Block>

      <Block title="Applies to">
        <div className="flex flex-wrap items-center gap-1 text-[12px]">
          {chain.map((s, i) => (
            <span key={s.id} className="flex items-center gap-1">
              {i > 0 ? <span className="text-muted">›</span> : null}
              <RichText text={s.level === "personal" ? `@${s.name}` : scopeLabel(s.id)} />
            </span>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Every agent working in this scope or below loads it in its context pack.
        </p>
      </Block>

      {backlinks.length ? (
        <Block title={`Backlinks · ${backlinks.length}`}>
          <ul className="space-y-1">
            {backlinks.map((b) => (
              <li key={b.id}>
                <RichText text={`[[${b.slug}]]`} />
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </>
  );
}

function EvidenceCard({ e }: { e: Evidence }) {
  const { people } = useHivemind();
  const person = people.find((p) => p.id === e.actor);
  const Icon =
    e.type === "review_comment" ? GitPullRequest : e.type === "agent" ? Bot : e.type === "correction" ? MessageSquareQuote : FileText;
  const label =
    e.type === "review_comment" ? "PR review" : e.type === "agent" ? "Agent proposal" : e.type === "correction" ? "Correction" : "Written";
  return (
    <li className="rounded-md border border-line bg-bg p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted">
        <Icon className="size-3" />
        <span>{label}</span>
        {e.ref ? <span className="font-mono">· {e.ref}</span> : null}
        <span className="ml-auto">{timeAgo(e.at)}</span>
      </div>
      <blockquote className="border-l-2 border-accent/60 pl-2 text-[13px] leading-snug text-fg/90">
        “{e.quote}”
      </blockquote>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
        <Avatar person={person} id={e.actor} className="size-4 text-[9px]" />
        {person?.name ?? (e.actor.startsWith("agent:") ? `Agent (${e.actor.slice(6)})` : e.actor)}
      </div>
    </li>
  );
}

function PersonInspector({ id }: { id: string }) {
  const { people, memories, scopes } = useHivemind();
  const p = people.find((x) => x.id === id);
  if (!p) return null;
  const taught = memories.filter(
    (m) => m.author === p.id || m.evidence.some((e) => e.actor === p.id),
  );
  const owns = scopes.filter((s) => s.owner === p.id && s.level !== "personal");
  return (
    <>
      <Block title="Person">
        <div className="flex items-center gap-2">
          <Avatar person={p} id={p.id} className="size-8 text-[12px]" />
          <div>
            <div className="font-semibold">{p.name}</div>
            <div className="text-[12px] text-muted">{p.title}</div>
          </div>
        </div>
        {owns.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1 text-[12px] text-muted">
            Approves for {owns.map((s) => <RichText key={s.id} text={scopeLabel(s.id)} />)}
          </div>
        ) : null}
      </Block>
      <Block title={`Taught · ${taught.length}`}>
        <ul className="space-y-1">
          {taught.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2">
              <RichText text={`[[${m.slug}]]`} />
              <StatusPill status={m.status} />
            </li>
          ))}
        </ul>
      </Block>
    </>
  );
}

function ScopeInspector({ id }: { id: string }) {
  const { scopes, memories, people } = useHivemind();
  const s = scopes.find((x) => x.id === id);
  if (!s) return null;
  const chainIds = new Set(scopeChain(id, scopes).map((x) => x.id));
  const inherited = memories.filter((m) => chainIds.has(m.scopeId) && m.status === "active");
  const locked = inherited.filter((m) => m.locked);
  const owner = people.find((p) => p.id === s.owner);
  return (
    <>
      <Block title={s.level}>
        <div className="text-[15px] font-semibold">{s.level === "personal" ? `@${s.name}` : s.name}</div>
        {owner ? (
          <div className="mt-1 text-[12px] text-muted">
            Owner <RichText text={`@${owner.id}`} />
          </div>
        ) : null}
        <p className="mt-2 text-[12px] text-muted">
          An agent here starts with {inherited.length} active lessons, {locked.length} of them locked.
        </p>
      </Block>
      <Block title="Locked rules in force">
        <ul className="space-y-1">
          {locked.map((m) => (
            <li key={m.id}>
              <RichText text={`🔒 [[${m.slug}]]`} />
            </li>
          ))}
        </ul>
      </Block>
    </>
  );
}

const FEED_ICON: Record<FeedEvent["type"], { icon: typeof Check; className: string }> = {
  correction: { icon: MessageSquareQuote, className: "text-accent" },
  review_comment: { icon: GitPullRequest, className: "text-accent" },
  approval: { icon: Check, className: "text-ok" },
  rejection: { icon: X, className: "text-muted" },
  blocked: { icon: Ban, className: "text-danger" },
  collision: { icon: TriangleAlert, className: "text-accent" },
  session_start: { icon: PlayCircle, className: "text-muted" },
  deny: { icon: ShieldX, className: "text-danger" },
  transfer: { icon: ArrowRightLeft, className: "text-repo" },
};

function LiveFeed() {
  const { feed, activity, people } = useHivemind();
  const warnings = activity.filter((a) => a.warning);
  return (
    <div className="flex max-h-[46%] min-h-40 shrink-0 flex-col border-t border-line">
      <SectionHeader
        right={
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-ok" /> live
          </span>
        }
      >
        Activity
      </SectionHeader>
      <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {warnings.map((a) => {
          const who = people.find((p) => p.id === a.actor);
          return (
            <li key={a.id} className="mb-2 flex gap-2 rounded-md border border-accent/30 bg-accent/10 px-2 py-1.5 text-[12px]">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span>
                <span className="font-medium">{who?.name.split(" ")[0] ?? a.actor}’s agent</span> is editing{" "}
                <span className="font-mono text-[11px]">{a.repo}/{a.file}</span>. {a.warning}
              </span>
            </li>
          );
        })}
        {feed.map((e) => {
          const meta = FEED_ICON[e.type];
          const Icon = meta.icon;
          const who = people.find((p) => p.id === e.actor);
          return (
            <li key={e.id} className="flex gap-2 py-1.5 text-[12px] leading-snug">
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${meta.className}`} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{who?.name.split(" ")[0] ?? e.actor}</span>{" "}
                <RichText text={e.text} className="text-fg/80" />
              </span>
              <span className="shrink-0 text-[11px] text-muted">{timeAgo(e.at)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
