"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  Hourglass,
  Lock,
  Package,
  Search,
  User,
  Users,
  UserRound,
  Info,
} from "lucide-react";
import type { Memory, Scope } from "@/mocks/types";
import { useHivemind } from "./store";
import { SectionHeader } from "./bits";
import { cn } from "./utils";

const LEVEL_ICON = { org: Building2, team: Users, repo: Package, personal: User } as const;
const LEVEL_COLOR = {
  org: "text-org",
  team: "text-team",
  repo: "text-repo",
  personal: "text-person",
} as const;

export function ScopeTree() {
  const { scopes, memories } = useHivemind();
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return memories.filter(
      (m) =>
        m.status !== "rejected" &&
        (!needle || m.title.toLowerCase().includes(needle) || m.body.toLowerCase().includes(needle)),
    );
  }, [memories, q]);

  const children = useMemo(() => {
    const map = new Map<string | null, Scope[]>();
    const order = { org: 0, team: 1, repo: 2, personal: 3 };
    for (const s of scopes) {
      const list = map.get(s.parentId) ?? [];
      list.push(s);
      map.set(s.parentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => order[a.level] - order[b.level] || a.name.localeCompare(b.name));
    return map;
  }, [scopes]);

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const roots = children.get(null) ?? [];

  return (
    <div className="flex h-full flex-col bg-panel">
      <SectionHeader>Vault</SectionHeader>
      <div className="border-b border-line p-2">
        <label className="flex h-7 items-center gap-2 rounded-md border border-line bg-bg px-2 text-muted focus-within:border-accent/60">
          <Search className="size-3.5" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter lessons"
            className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-muted"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {roots.map((s) => (
          <ScopeNode
            key={s.id}
            scope={s}
            depth={0}
            childrenMap={children}
            memories={visible}
            collapsed={collapsed}
            toggle={toggle}
            filtering={!!q.trim()}
          />
        ))}
      </div>
      <Legend />
    </div>
  );
}

function ScopeNode({
  scope,
  depth,
  childrenMap,
  memories,
  collapsed,
  toggle,
  filtering,
}: {
  scope: Scope;
  depth: number;
  childrenMap: Map<string | null, Scope[]>;
  memories: Memory[];
  collapsed: Set<string>;
  toggle: (id: string) => void;
  filtering: boolean;
}) {
  const { select, selection } = useHivemind();
  const Icon = LEVEL_ICON[scope.level];
  const own = memories
    .filter((m) => m.scopeId === scope.id)
    .sort((a, b) => Number(b.locked) - Number(a.locked) || a.title.localeCompare(b.title));
  const kids = childrenMap.get(scope.id) ?? [];
  const subtree = (id: string): Memory[] => [
    ...memories.filter((m) => m.scopeId === id),
    ...(childrenMap.get(id) ?? []).flatMap((c) => subtree(c.id)),
  ];
  const all = subtree(scope.id);
  const pending = all.filter((m) => m.status === "pending").length;
  const blocked = all.filter((m) => m.status === "blocked").length;
  if (filtering && all.length === 0) return null;

  const isOpen = filtering || !collapsed.has(scope.id);
  const isSelected = selection?.kind === "scope" && selection.id === scope.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          toggle(scope.id);
          select({ kind: "scope", id: scope.id });
        }}
        className={cn(
          "group flex h-7 w-full items-center gap-1.5 pr-2 text-left transition-colors duration-150 hover:bg-elevated",
          isSelected && "bg-elevated",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {isOpen ? (
          <ChevronDown className="size-3 shrink-0 text-muted" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted" />
        )}
        <Icon className={cn("size-3.5 shrink-0", LEVEL_COLOR[scope.level])} />
        <span className={cn("truncate", scope.level === "org" ? "font-semibold" : "font-medium")}>
          {scope.level === "personal" ? `@${scope.name}` : scope.name}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {blocked ? (
            <span className="inline-flex h-4 items-center gap-0.5 rounded bg-danger/15 px-1 text-[10px] font-semibold text-danger">
              <Ban className="size-2.5" />
              {blocked}
            </span>
          ) : null}
          {pending ? (
            <span className="inline-flex h-4 items-center gap-0.5 rounded bg-accent/15 px-1 text-[10px] font-semibold text-accent">
              <Hourglass className="size-2.5" />
              {pending}
            </span>
          ) : null}
        </span>
      </button>

      {isOpen ? (
        <>
          {own.map((m) => (
            <MemoryRow key={m.id} memory={m} depth={depth + 1} />
          ))}
          {kids.map((k) => (
            <ScopeNode
              key={k.id}
              scope={k}
              depth={depth + 1}
              childrenMap={childrenMap}
              memories={memories}
              collapsed={collapsed}
              toggle={toggle}
              filtering={filtering}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function MemoryRow({ memory: m, depth }: { memory: Memory; depth: number }) {
  const { openMemory, activeTab } = useHivemind();
  const Icon = m.locked
    ? Lock
    : m.status === "pending"
      ? Hourglass
      : m.status === "blocked"
        ? Ban
        : m.kind === "owner"
          ? UserRound
          : m.kind === "fact"
            ? Info
            : FileText;
  const iconColor = m.locked
    ? "text-lock"
    : m.status === "pending"
      ? "text-accent"
      : m.status === "blocked"
        ? "text-danger"
        : "text-muted";
  return (
    <button
      type="button"
      onClick={() => openMemory(m.id)}
      className={cn(
        "flex h-7 w-full items-center gap-1.5 pr-2 text-left text-[13px] transition-colors duration-150 hover:bg-elevated",
        activeTab === m.id ? "bg-accent/10 text-fg" : "text-fg/85",
      )}
      style={{ paddingLeft: 8 + depth * 14 + 12 }}
      title={m.title}
    >
      <Icon className={cn("size-3.5 shrink-0", iconColor)} />
      <span className={cn("truncate", m.status === "invalid" && "text-muted line-through")}>{m.title}</span>
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-3 py-2 text-[11px] text-muted">
      <span className="flex items-center gap-1"><Lock className="size-3 text-lock" /> locked</span>
      <span className="flex items-center gap-1"><Hourglass className="size-3 text-accent" /> pending</span>
      <span className="flex items-center gap-1"><Ban className="size-3 text-danger" /> blocked</span>
    </div>
  );
}
