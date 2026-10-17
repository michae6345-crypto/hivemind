"use client";

import { Fragment, useMemo } from "react";
import { Lock } from "lucide-react";
import { useHivemind } from "./store";
import { tokenize, type Token } from "./utils";

/** Renders body text with live #scope @person [[slug]] 🔒 chips; click opens in the inspector. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const { people, memoryBySlug, openMemory, select } = useHivemind();
  const personIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const tokens = useMemo(() => tokenize(text, personIds), [text, personIds]);

  const onClick = (t: Token) => {
    if (t.kind === "link") {
      const m = memoryBySlug(t.id);
      if (m) openMemory(m.id);
    } else if (t.kind === "person") select({ kind: "person", id: t.id });
    else if (t.kind !== "lock") select({ kind: "scope", id: t.id });
  };

  const parts: React.ReactNode[] = [];
  let last = 0;
  tokens.forEach((t, i) => {
    if (t.from > last) parts.push(<Fragment key={`t${i}`}>{renderInline(text.slice(last, t.from))}</Fragment>);
    if (t.kind === "lock") {
      parts.push(
        <span key={`c${i}`} className="hm-chip inline-flex items-center gap-0.5 align-[-1px]" data-kind="lock">
          <Lock className="size-3" />
        </span>,
      );
    } else {
      const label = t.kind === "link" ? (memoryBySlug(t.id)?.title ?? t.id) : t.text;
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
