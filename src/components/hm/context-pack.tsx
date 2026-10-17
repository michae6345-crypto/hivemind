"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, TerminalSquare } from "lucide-react";
import type { Memory, Person, Scope } from "@/mocks/types";
import { API, useHivemind } from "./store";
import { confidence, scopeChain } from "./utils";

interface Pack {
  markdown: string;
  count: number;
  tokens: number;
  live: boolean;
}

/** Same shape the SessionStart hook injects: locked rules first, then the scope chain, most specific last. */
function buildLocalPack(targetScope: string, scopes: Scope[], memories: Memory[], who?: Person): Pack {
  const chain = scopeChain(targetScope, scopes).reverse(); // org → … → target
  const ids = new Set(chain.map((s) => s.id));
  const served = memories.filter((m) => ids.has(m.scopeId) && m.status === "active");
  const locked = served.filter((m) => m.locked);
  const lines: string[] = [];
  const head = chain.at(-1);
  lines.push(`# Hivemind context${head ? ` for ${head.level === "personal" ? "@" + head.name : "#" + head.id}` : ""}`);
  if (who) lines.push(`Engineer: @${who.id} (${who.title})`);
  lines.push("");
  if (locked.length) {
    lines.push("## Locked rules (never override)");
    locked.forEach((m) => lines.push(`- 🔒 ${m.title} [[${m.slug}]]`));
    lines.push("");
  }
  for (const s of chain) {
    const items = served
      .filter((m) => m.scopeId === s.id && !m.locked)
      .sort((a, b) => confidence(b) - confidence(a));
    if (!items.length) continue;
    const label = s.level === "org" ? "Company" : s.level === "personal" ? `Personal (@${s.name})` : `${s.level === "team" ? "Team" : "Repo"} ${s.name}`;
    lines.push(`## ${label}`);
    items.forEach((m) => lines.push(`- ${m.title} [[${m.slug}]]`));
    lines.push("");
  }
  lines.push("If the engineer corrects you, Hivemind proposes it as a lesson for review.");
  const markdown = lines.join("\n");
  return { markdown, count: served.length, tokens: Math.round(markdown.length / 4), live: false };
}

export function ContextPackPreview({ scopeId, person }: { scopeId: string; person?: Person }) {
  const { scopes, memories, headers, live } = useHivemind();
  const local = useMemo(() => buildLocalPack(scopeId, scopes, memories, person), [scopeId, scopes, memories, person]);
  const [remote, setRemote] = useState<Pack | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!live.core) return;
    let cancel = false;
    const repo = scopeId.startsWith("repo/") ? scopeId : "";
    const qs = new URLSearchParams({ repo, user: person?.id ?? "", session: "preview" });
    fetch(`${API}/api/context-pack?${qs}`, { headers, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { markdown?: string; memoryIds?: string[]; tokens?: number } | null) => {
        if (cancel || !d?.markdown) return;
        setRemote({ markdown: d.markdown, count: d.memoryIds?.length ?? 0, tokens: d.tokens ?? Math.round(d.markdown.length / 4), live: true });
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [live.core, scopeId, person, headers]);

  const pack = remote ?? local;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px]">
        <TerminalSquare className="size-3.5 text-accent" />
        <span className="font-medium">Session start</span>
        <span className="text-muted">
          {pack.count} lessons, about {pack.tokens.toLocaleString()} tokens
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(pack.markdown).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="ml-auto rounded p-1 text-muted transition-colors duration-150 hover:bg-elevated hover:text-fg"
          aria-label="Copy context pack"
        >
          {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto px-3 py-2.5 font-mono text-[11.5px] leading-[1.6] whitespace-pre-wrap text-fg/85">
        {pack.markdown.split("\n").map((line, i) => (
          <span
            key={i}
            className={
              line.startsWith("# ")
                ? "text-fg"
                : line.startsWith("## ")
                  ? "text-accent"
                  : line.startsWith("- 🔒")
                    ? "text-lock"
                    : undefined
            }
          >
            {line}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}
