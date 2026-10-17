"use client";

import {
  ArrowRightLeft,
  Ban,
  Bot,
  Check,
  FileText,
  GitPullRequest,
  MessageSquareQuote,
  PlayCircle,
  ShieldX,
  TriangleAlert,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Evidence, FeedEvent } from "@/mocks/types";
import { useHivemind } from "./store";
import { Avatar, ConfidenceBar, Label, SectionHeader, StatusPill } from "./bits";
import { RichText } from "./rich-text";
import { ContextPackPreview } from "./context-pack";
import { cn, confidence, scopeChain, scopeLabel, timeAgo } from "./utils";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function Inspector() {
  const { selection, activeTab } = useHivemind();
  const sel = selection ?? (activeTab ? { kind: "memory" as const, id: activeTab } : null);

  return (
    <div className="flex h-full flex-col bg-panel">
      <SectionHeader>Details</SectionHeader>
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

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <Label>{title}</Label>
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
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          {m.locked
            ? "Locked rules skip scoring and never fade."
            : `${plural(Math.round(m.alpha - 1), "confirmation")} and ${plural(Math.round(m.beta - 1), "contradiction")} so far. Ranked by the low end of its 95% interval, ${(c * 100).toFixed(0)}%.`}
        </p>
      </Block>

      <Block title={m.evidence.length ? `Where it came from` : "Source"}>
        {m.evidence.length === 0 ? (
          <p className="text-[12px] text-muted">Written directly by a person.</p>
        ) : (
          <ul className="space-y-2">
            {m.evidence.map((e, i) => (
              <EvidenceCard key={i} e={e} />
            ))}
          </ul>
        )}
      </Block>

      <Block title="Who gets it">
        <div className="flex flex-wrap items-center gap-1 text-[12px]">
          {chain.map((s, i) => (
            <span key={s.id} className="flex items-center gap-1">
              {i > 0 ? <span className="text-muted">›</span> : null}
              <RichText text={s.level === "personal" ? `@${s.name}` : scopeLabel(s.id)} />
            </span>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">Every agent working here or below loads it when a session starts.</p>
      </Block>

      {backlinks.length ? (
        <Block title={`Referenced by ${backlinks.length}`}>
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
    e.type === "review_comment" ? "PR review" : e.type === "agent" ? "Agent proposal" : e.type === "correction" ? "Correction" : "Note";
  return (
    <li className="rounded-md border border-line bg-bg p-2.5">
      <blockquote className="border-l-2 border-accent/60 pl-2 text-[13px] leading-snug text-fg/90">“{e.quote}”</blockquote>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <Avatar person={person} id={e.actor} className="size-4 text-[9px]" />
          {person?.name.split(" ")[0] ?? (e.actor.startsWith("agent:") ? "Agent" : e.actor)}
        </span>
        <span className="flex items-center gap-1">
          <Icon className="size-3" />
          {label}
          {e.ref ? `, ${e.ref}` : ""}
        </span>
        <span className="ml-auto">{timeAgo(e.at)}</span>
      </div>
    </li>
  );
}

function PersonInspector({ id }: { id: string }) {
  const { people, memories, scopes } = useHivemind();
  const p = people.find((x) => x.id === id);
  if (!p) return null;
  const taught = memories.filter((m) => m.author === p.id || m.evidence.some((e) => e.actor === p.id));
  const owns = scopes.filter((s) => s.owner === p.id && s.level !== "personal");
  const personal = scopes.find((s) => s.id === `personal/${p.id}`);
  return (
    <>
      <Block title="Person">
        <div className="flex items-center gap-2.5">
          <Avatar person={p} id={p.id} className="size-8 text-[12px]" />
          <div>
            <div className="font-semibold">{p.name}</div>
            <div className="text-[12px] text-muted">{p.title}</div>
          </div>
        </div>
        {owns.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1 text-[12px] text-muted">
            Approves lessons for {owns.map((s) => <RichText key={s.id} text={scopeLabel(s.id)} />)}
          </div>
        ) : null}
      </Block>
      <Block title={`What ${p.name.split(" ")[0]}'s agent starts with`}>
        <ContextPackPreview scopeId={personal?.id ?? p.scopeId} person={p} />
      </Block>
      <Block title={`Taught ${plural(taught.length, "lesson")}`}>
        <ul className="space-y-1.5">
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
      <Block title={s.level === "org" ? "Company" : s.level === "team" ? "Team" : s.level === "repo" ? "Repository" : "Personal"}>
        <div className="text-[15px] font-semibold">{s.level === "personal" ? `@${s.name}` : s.name}</div>
        {owner ? (
          <div className="mt-1 text-[12px] text-muted">
            Owned by <RichText text={`@${owner.id}`} />
          </div>
        ) : null}
        <p className="mt-2 text-[12px] text-muted">
          An agent here starts with {plural(inherited.length, "lesson")}, {locked.length} of them locked.
        </p>
      </Block>
      <Block title="What an agent here starts with">
        <ContextPackPreview scopeId={s.id} />
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
  const { feed, activity, people, live } = useHivemind();
  const warnings = activity.filter((a) => a.warning);
  // Items already on screen at mount stay put; anything that arrives afterwards slides in at the top.
  const enter = {
    layout: "position" as const,
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: { duration: 0.12 } },
  };
  return (
    <div className="flex max-h-[46%] min-h-40 shrink-0 flex-col border-t border-line">
      <SectionHeader
        right={
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={cn("size-1.5 rounded-full", live.activity ? "bg-ok" : "bg-accent")} />
            {live.activity ? "live" : "seed data"}
          </span>
        }
      >
        Activity
      </SectionHeader>
      <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <AnimatePresence initial={false}>
        {warnings.map((a) => {
          const who = people.find((p) => p.id === a.actor);
          return (
            <motion.li
              key={a.id}
              {...enter}
              className="mb-2 flex gap-2 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-2 text-[12px] leading-snug"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span>
                <span className="font-medium">{who?.name.split(" ")[0] ?? a.actor}&apos;s agent</span> opened{" "}
                <span className="font-medium">
                  {a.repo}/{a.file}
                </span>
                . {a.warning}
              </span>
            </motion.li>
          );
        })}
        {feed.map((e) => {
          const meta = FEED_ICON[e.type] ?? FEED_ICON.session_start;
          const Icon = meta.icon;
          const who = people.find((p) => p.id === e.actor);
          return (
            <motion.li
              key={e.id}
              {...enter}
              className={cn(
                "flex gap-2 rounded-md px-1 py-1.5 text-[12px] leading-snug",
                (e.type === "blocked" || e.type === "deny") && "bg-danger/[0.06]",
              )}
            >
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${meta.className}`} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{who?.name.split(" ")[0] ?? e.actor}</span>{" "}
                <RichText text={e.text} className="text-fg/80" />
              </span>
              <span className="shrink-0 text-[11px] text-muted">{timeAgo(e.at)}</span>
            </motion.li>
          );
        })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
