"use client";

import { TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ActivityItem } from "@/mocks/types";
import { useHivemind } from "./store";
import { Handles } from "./handles";
import { useNow } from "./use-now";
import { cn, timeAgo } from "./utils";

type AgentKind = NonNullable<ActivityItem["agent"]>;

/** Plain tool names; no third-party logos. "other" and a missing agent get no badge. */
export const AGENT_NAME: Record<AgentKind, string | null> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  copilot: "Copilot",
  codex: "Codex",
  "claude-ai": "Claude",
  windsurf: "Windsurf",
  vscode: "VS Code",
  other: null,
};

export const WORKS_WITH = "Works with Claude Code, Cursor, Gemini CLI, Copilot, Codex and Claude";

/** A tiny neutral pill naming the coding tool behind an event. */
export function AgentBadge({ agent, className }: { agent?: AgentKind; className?: string }) {
  const name = agent ? AGENT_NAME[agent] : null;
  if (!name) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-full border border-line bg-panel px-1.5 font-sans text-[11px] leading-none text-fg/80",
        className,
      )}
    >
      {name}
    </span>
  );
}

/** "Live activity": the last five agent edits, with collision warnings. The only activity the web app shows. */
export function LiveActivity() {
  const { activity } = useHivemind();
  const now = useNow();
  const items = activity
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const file = (path: string) => path.split("/").at(-1) ?? path;

  return (
    <section className="border-t border-line px-2 pt-3 pb-3">
      <h2 className="flex items-center gap-1.5 px-2.5 pb-1.5 text-[12px] font-medium text-muted">
        <span className="relative flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-ok/60 motion-reduce:hidden" />
          <span className="relative size-1.5 rounded-full bg-ok" />
        </span>
        Live activity
      </h2>
      {!items.length ? <p className="px-2.5 py-1 text-[12px] text-muted">No agents working right now.</p> : null}
      <ul>
        <AnimatePresence initial={false}>
          {items.map((a) => (
            <motion.li
              key={a.id}
              layout="position"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-[10px] px-2.5 py-1.5"
            >
              <div className="flex items-center gap-1.5 text-[12.5px]">
                <span className="shrink-0">
                  <Handles text={`@${a.actor}'s`} />
                </span>
                <AgentBadge agent={a.agent} />
                <span className="min-w-0 truncate text-fg/85">
                  agent edited <span className="font-mono text-[11.5px]">{file(a.file)}</span>
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(a.createdAt, now)}</span>
              </div>
              {a.warning ? (
                <div className="mt-0.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-[#9a6412]">
                  <TriangleAlert className="mt-px size-3 shrink-0" />
                  <Handles text={a.warning} />
                </div>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
