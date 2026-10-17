"use client";

import { Lock, ShieldX } from "lucide-react";
import { motion } from "motion/react";
import type { Memory } from "@/mocks/types";
import { useHivemind } from "./store";
import { Avatar } from "./bits";
import { RichText } from "./rich-text";
import { Handles } from "./handles";
import { cn, scopeChain, timeAgo } from "./utils";

/** Find the locked rule a blocked lesson ran into: the [[slug]] named in blockedReason, else the nearest lock up its scope chain. */
export function useConflictingRule(m: Memory): Memory | undefined {
  const { memories, memoryBySlug, scopes } = useHivemind();
  const named = m.blockedReason?.match(/\[\[([a-z0-9][\w-]*)\]\]/)?.[1];
  if (named) {
    const hit = memoryBySlug(named);
    if (hit) return hit;
  }
  const chain = scopeChain(m.scopeId, scopes).map((s) => s.id);
  return memories.find((x) => x.locked && x.status === "active" && chain.includes(x.scopeId));
}

/**
 * The Lemma "guardrail" moment: what someone tried to teach, set against the locked rule that stopped it.
 */
export function Guardrail({ memory: m, compact }: { memory: Memory; compact?: boolean }) {
  const { people, openMemory } = useHivemind();
  const rule = useConflictingRule(m);
  const proposal = m.evidence.at(-1);
  const proposer = people.find((p) => p.id === (proposal?.actor ?? m.author));
  const ruleOwner = people.find((p) => p.id === rule?.author);
  const reason = m.blockedReason?.replace(/^Contradicts\s+🔒\s+\[\[[\w-]+\]\]\s*(\([^)]*\))?:?\s*/i, "") ?? "";

  return (
    <div className="hm-guardrail overflow-hidden rounded-lg border border-danger/35 bg-danger/[0.06]">
      <div className="flex items-center gap-2 border-b border-danger/25 px-4 py-2.5">
        <ShieldX className="size-4 text-danger" />
        <span className="font-semibold text-danger">Blocked by a locked rule</span>
        <span className="text-[12px] text-muted">It never reaches an agent, and nobody below Security can override it.</span>
      </div>
      <div className={cn("grid gap-3 p-4", compact ? "grid-cols-1" : "grid-cols-[1fr_auto_1fr] items-stretch")}>
        {/* The proposal runs into the locked rule and is pushed back: plays once, when the block is shown. */}
        <motion.div
          className="rounded-md border border-line bg-bg/60 p-3"
          animate={compact ? { y: [0, 10, -3, 0] } : { x: [0, 18, -6, 0] }}
          transition={{ duration: 0.55, times: [0, 0.35, 0.7, 1], delay: 0.25, ease: "easeOut" }}
        >
          <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
            <Avatar person={proposer} id={proposal?.actor ?? m.author} className="size-4 text-[9px]" />
            <span>
              {proposer ? <Handles text={`@${proposer.id}`} /> : "Someone"} tried to teach{proposal ? `, ${timeAgo(proposal.at)}` : ""}
            </span>
          </div>
          <p className="text-[14px] leading-snug">“{proposal?.quote ?? m.body}”</p>
        </motion.div>
        {!compact ? (
          <div className="flex items-center">
            <span className="flex size-7 items-center justify-center rounded-full border border-danger/40 bg-danger/15 text-[11px] font-semibold text-danger">
              vs
            </span>
          </div>
        ) : null}
        {rule ? (
          <motion.button
            type="button"
            onClick={() => openMemory(rule.id)}
            animate={{ scale: [1, 1.035, 1] }}
            transition={{ duration: 0.35, delay: 0.42, ease: "easeOut" }}
            className="rounded-md border border-lock/40 bg-lock/[0.07] p-3 text-left transition-colors duration-150 hover:bg-lock/[0.12]"
          >
            <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
              <Lock className="size-3.5 text-lock" />
              <span>
                Locked by {ruleOwner ? <Handles text={`@${ruleOwner.id}`} /> : "Security"}
                {ruleOwner ? `, ${ruleOwner.title}` : ""}
              </span>
            </div>
            <p className="text-[14px] leading-snug font-medium">{rule.title}</p>
          </motion.button>
        ) : null}
      </div>
      {reason ? (
        <div className="border-t border-danger/20 px-4 py-2.5 text-[13px] text-fg/85">
          <RichText text={reason.charAt(0).toUpperCase() + reason.slice(1)} />
        </div>
      ) : null}
    </div>
  );
}
