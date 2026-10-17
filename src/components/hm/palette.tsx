"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, Inbox, LineChart, Lock, PenLine, Search, User, UserCog, Users } from "lucide-react";
import { ROLE_USERS, useHivemind } from "./store";
import { cn, scopeLabel } from "./utils";

interface Item {
  id: string;
  group: string;
  label: string;
  detail?: string;
  icon: typeof Search;
  run: () => void;
}

/** ⌘K: jump to any lesson, person or scope, or run an action. */
export function Palette() {
  const { paletteOpen, setPaletteOpen, memories, people, scopes, openMemory, select, setRole, setComposerOpen } = useHivemind();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const close = () => {
    setPaletteOpen(false);
    setQ("");
    setCursor(0);
  };

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => {
      router.push(path);
      close();
    };
    const all: Item[] = [
      { id: "a-rule", group: "Actions", label: "Write a rule", icon: PenLine, run: () => { setComposerOpen(true); close(); } },
      { id: "a-vault", group: "Actions", label: "Open the vault", icon: BookOpen, run: go("/") },
      { id: "a-review", group: "Actions", label: "Open the review queue", icon: Inbox, run: go("/approvals") },
      { id: "a-learning", group: "Actions", label: "See how agents are learning", icon: LineChart, run: go("/learning") },
      ...ROLE_USERS.map((r) => ({
        id: `role-${r.role}`,
        group: "Actions",
        label: `View as ${r.label}`,
        icon: UserCog,
        run: () => {
          setRole(r.role);
          close();
        },
      })),
      ...memories
        .filter((m) => m.status !== "rejected")
        .map((m) => ({
          id: m.id,
          group: "Lessons",
          label: m.title,
          detail: scopeLabel(m.scopeId),
          icon: m.locked ? Lock : FileText,
          run: () => {
            openMemory(m.id);
            router.push("/");
            close();
          },
        })),
      ...people.map((p) => ({
        id: `p-${p.id}`,
        group: "People",
        label: p.name,
        detail: p.title,
        icon: User,
        run: () => {
          select({ kind: "person", id: p.id });
          router.push("/");
          close();
        },
      })),
      ...scopes
        .filter((s) => s.level !== "personal")
        .map((s) => ({
          id: `s-${s.id}`,
          group: "Teams and repos",
          label: s.level === "org" ? s.name : `#${s.id}`,
          detail: s.level,
          icon: Users,
          run: () => {
            select({ kind: "scope", id: s.id });
            router.push("/");
            close();
          },
        })),
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return all.filter((i) => i.group === "Actions" || i.group === "Lessons").slice(0, 14);
    return all.filter((i) => `${i.label} ${i.detail ?? ""}`.toLowerCase().includes(needle)).slice(0, 30);
    // close/router are stable enough for a palette list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, memories, people, scopes]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!paletteOpen) return null;

  let index = -1;
  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh]" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/55" onClick={close} />
      <div className="relative w-[min(580px,92vw)] overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                items.at(cursor)?.run();
              }
            }}
            placeholder="Search lessons, people, teams, or type a command"
            className="h-11 w-full bg-transparent text-[14px] outline-none placeholder:text-muted"
          />
        </div>
        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {items.length === 0 ? <li className="px-4 py-6 text-center text-muted">No matches.</li> : null}
          {groups.map((g) => (
            <li key={g}>
              <div className="px-4 pt-2 pb-1 text-[11px] font-semibold text-fg/50">{g}</div>
              <ul>
                {items
                  .filter((i) => i.group === g)
                  .map((i) => {
                    index += 1;
                    const my = index;
                    const Icon = i.icon;
                    return (
                      <li key={i.id}>
                        <button
                          type="button"
                          data-index={my}
                          onMouseMove={() => setCursor(my)}
                          onClick={i.run}
                          className={cn(
                            "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px]",
                            my === cursor ? "bg-accent/12 text-fg" : "text-fg/85",
                          )}
                        >
                          <Icon className={cn("size-4 shrink-0", my === cursor ? "text-accent" : "text-muted")} />
                          <span className="truncate">{i.label}</span>
                          {i.detail ? <span className="ml-auto shrink-0 truncate text-[12px] text-muted">{i.detail}</span> : null}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
