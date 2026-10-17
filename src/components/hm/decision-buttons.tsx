"use client";

import { Check, Lock, X } from "lucide-react";
import type { Memory } from "@/mocks/types";
import { useHivemind } from "./store";
import { useDecide } from "./decisions";
import { Kbd } from "./bits";
import { canApprove, cn } from "./utils";

/**
 * Approve / Reject, shown to every role. When the role can't act on this scope the button still
 * works: it asks the API, gets the 403, and shows the chain-of-command toast. That refusal is the demo moment.
 */
export function DecisionButtons({
  memory: m,
  size = "sm",
  shortcuts,
  onDone,
}: {
  memory: Memory;
  size?: "sm" | "md";
  shortcuts?: boolean;
  onDone?: () => void;
}) {
  const { user, scopes } = useHivemind();
  const { onApprove, onReject } = useDecide();
  const allowed = canApprove(user, m, scopes);
  const h = size === "md" ? "h-8 px-3 text-[13px]" : "h-7 px-2.5 text-[12px]";

  if (m.status !== "pending" && m.status !== "blocked") return null;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={async () => {
          if (await onReject(m)) onDone?.();
        }}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-line text-muted transition-colors duration-150 hover:border-danger/50 hover:text-danger",
          h,
        )}
      >
        <X className="size-3.5" /> {m.status === "blocked" ? "Dismiss" : "Reject"}
        {shortcuts ? <Kbd>R</Kbd> : null}
      </button>
      {m.status === "pending" ? (
        <button
          type="button"
          onClick={async () => {
            if (await onApprove(m)) onDone?.();
          }}
          title={allowed ? undefined : "Your role can't approve for this scope"}
          className={cn(
            "flex items-center gap-1.5 rounded-md font-semibold transition-[filter,background-color] duration-150",
            allowed
              ? "bg-accent text-black hover:brightness-110"
              : "border border-accent/40 bg-accent/10 text-accent hover:bg-accent/15",
            h,
          )}
        >
          {allowed ? <Check className="size-3.5" /> : <Lock className="size-3.5" />} Approve
          {shortcuts ? <Kbd>A</Kbd> : null}
        </button>
      ) : null}
    </div>
  );
}
