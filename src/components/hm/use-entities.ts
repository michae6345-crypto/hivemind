"use client";

import { useMemo } from "react";
import type { Entity } from "@/mocks/types";
import { useHivemind } from "./store";
import { tokenKindForScope } from "./utils";

/** Autocomplete + hover-card entities (mirrors GET /api/entities). */
export function useEntities(): Entity[] {
  const { people, scopes, memories } = useHivemind();
  return useMemo<Entity[]>(
    () => [
      ...people.map<Entity>((p) => ({ kind: "person", id: p.id, label: p.name, detail: p.title })),
      ...scopes
        .filter((s) => s.level !== "personal")
        .map<Entity>((s) => ({
          kind: tokenKindForScope(s.id),
          id: s.id,
          label: s.level === "org" ? s.name : `#${s.id}`,
          detail: `${s.level}${s.owner ? ` · owner @${s.owner}` : ""}`,
        })),
      ...memories
        .filter((m) => m.status !== "rejected")
        .map<Entity>((m) => ({
          kind: "link",
          id: m.slug,
          label: m.title,
          detail: `${m.locked ? "Locked " : ""}${m.kind} · #${m.scopeId} · ${m.status}`,
        })),
    ],
    [people, scopes, memories],
  );
}
