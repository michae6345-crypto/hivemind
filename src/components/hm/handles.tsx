import { Fragment, type ReactNode } from "react";
import { cn, tokenKindForScope } from "./utils";

const HANDLE_RE = /#(org(?:\/[\w.-]+)?|(?:team|repo|personal)\/[\w.-]+)|@([a-z][\w-]*)/g;

/**
 * @handles and #scopes as the highlighted chips the app uses, without the store, so it works on the website,
 * in toasts and in dark windows (`dark`). Owners are always @handles, never full names.
 */
export function Handles({ text, dark, className }: { text: string; dark?: boolean; className?: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(HANDLE_RE)) {
    const from = m.index ?? 0;
    if (from > last) parts.push(<Fragment key={`t${from}`}>{text.slice(last, from)}</Fragment>);
    parts.push(
      <span
        key={`c${from}`}
        className={cn("hm-chip", dark && "hm-chip-dark")}
        data-kind={m[2] ? "person" : tokenKindForScope(m[1])}
        data-static=""
      >
        {m[0]}
      </span>,
    );
    last = from + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key="tail">{text.slice(last)}</Fragment>);
  return className ? <span className={className}>{parts}</span> : <>{parts}</>;
}
