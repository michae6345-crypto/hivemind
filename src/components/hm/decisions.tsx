"use client";

import { toast } from "sonner";
import type { Memory } from "@/mocks/types";
import { useHivemind } from "./store";
import { reachFor, scopeLabel } from "./utils";
import { Handles } from "./handles";

/** Approve / reject with the toasts the demo relies on, including the 403 "chain of command" moment. */
export function useDecide() {
  const { approve, reject, restore, mode, scopes, people } = useHivemind();

  const onApprove = async (m: Memory) => {
    const before = m;
    const r = await approve(m.id);
    if (!r.ok) {
      toast.error(r.forbidden ? "Not your call" : "Couldn't approve", {
        description: r.error ? <Handles text={r.error} /> : undefined,
        className: "hm-toast-forbidden",
      });
      return false;
    }
    const reach = reachFor(m.scopeId, scopes, people);
    toast.success(`Approved: ${m.title}`, {
      description: (
        <Handles
          text={
            reach > 0
              ? `${reach} ${reach === 1 ? "person's agent loads" : "people's agents load"} it from their next session in ${scopeLabel(m.scopeId)}.`
              : `Every agent in ${scopeLabel(m.scopeId)} loads it from its next session.`
          }
        />
      ),
      action: mode === "mock" ? { label: "Undo", onClick: () => restore(before) } : undefined,
    });
    return true;
  };

  const onReject = async (m: Memory) => {
    const before = m;
    const r = await reject(m.id);
    if (!r.ok) {
      toast.error(r.forbidden ? "Not your call" : "Couldn't reject", { description: r.error ? <Handles text={r.error} /> : undefined, className: "hm-toast-forbidden" });
      return false;
    }
    toast(`Rejected: ${m.title}`, {
      description: "It won't reach any agent.",
      action: mode === "mock" ? { label: "Undo", onClick: () => restore(before) } : undefined,
    });
    return true;
  };

  return { onApprove, onReject };
}
