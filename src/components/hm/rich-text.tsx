"use client";

import { Fragment, useMemo } from "react";
import { Lock } from "lucide-react";
import { useHivemind } from "./store";
import { useGo } from "./nav";
import { tokenize, type Token } from "./utils";

/** Renders body text with #scope @person [[slug]] 🔒 chips; a [[lesson]] chip opens that lesson. */
export function RichText({
  text,
  className,
  inert,
}: {
  text: string;
  className?: string;
  /** Render chips as spans (use inside buttons/links). */
  inert?: boolean;
}) {
  const { people, memoryBySlug, openMemory } = useHivemind();
  const go = useGo();
  const personIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const tokens = useMemo(() => tokenize(text, personIds), [text, personIds]);

  const onClick = (t: Token) => {
    const m = memoryBySlug(t.id);
    if (!m) return;
    openMemory(m.id);
    go("/app");
  };

  const parts: React.ReactNode[] = [];
  let last = 0;
  tokens.forEach((t, i) => {
    if (t.from > last) parts.push(<Fragment key={`t${i}`}>{renderInline(text.slice(last, t.from))}</Fragment>);
    if (t.kind === "lock") {
      parts.push(
        <Lock key={`c${i}`} aria-label="Locked" className="inline size-3.5 align-[-2px] text-lock" />,
      );
    } else {
      const label = t.kind === "link" ? (memoryBySlug(t.id)?.title ?? t.id) : t.text;
      if (inert || t.kind !== "link") {
        parts.push(
          <span key={`c${i}`} className="hm-chip" data-kind={t.kind} data-id={t.id}>
            {label}
          </span>,
        );
        last = t.to;
        return;
      }
      parts.push(
        <button
          type="button"
          key={`c${i}`}
          className="hm-chip"
          data-kind={t.kind}
          data-id={t.id}
          onClick={(e) => {
            e.stopPropagation();
            onClick(t);
          }}
        >
          {label}
        </button>,
      );
    }
    last = t.to;
  });
  if (last < text.length) parts.push(<Fragment key="tail">{renderInline(text.slice(last))}</Fragment>);

  return <span className={className}>{parts}</span>;
}

/** Minimal inline markdown: `code` and **bold**. */
function renderInline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1])
      out.push(
        <code key={i++} className="rounded bg-elevated px-1 py-px font-mono text-[12px] text-fg">
          {m[1]}
        </code>,
      );
    else out.push(<strong key={i++} className="font-semibold text-fg">{m[2]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
