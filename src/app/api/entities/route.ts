import type { NextRequest } from "next/server";
import type { Entity } from "@/contracts";
import { err, json } from "@/lib/auth";
import { getPeople, getScopes, listMemories } from "@/lib/queries";

const scopeKind = (id: string): Entity["kind"] => (id === "org" ? "org" : id.startsWith("team/") ? "team" : "repo");

/** GET /api/entities?q=&kind= → { entities } for editor autocomplete (mirrors the UI's useEntities). */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().replace(/^[#@]|^\[\[/, "");
  const kind = req.nextUrl.searchParams.get("kind");
  try {
    const [people, scopes, memories] = await Promise.all([getPeople(), getScopes(), listMemories()]);
    const all: Entity[] = [
      ...people.map<Entity>((p) => ({ kind: "person", id: p.id, label: p.name, detail: p.title })),
      ...scopes
        .filter((s) => s.level !== "personal")
        .map<Entity>((s) => ({
          kind: scopeKind(s.id),
          id: s.id,
          label: s.level === "org" ? s.name : `#${s.id}`,
          detail: `${s.level}${s.owner ? ` · owner @${s.owner}` : ""}`,
        })),
      ...memories
        .filter((m) => m.status !== "rejected" && m.status !== "invalid")
        .map<Entity>((m) => ({
          kind: "link",
          id: m.slug,
          label: m.title,
          detail: `${m.locked ? "Locked " : ""}${m.kind} · #${m.scopeId} · ${m.status}`,
        })),
    ];
    const entities = all.filter(
      (e) => (!kind || e.kind === kind) && (!q || e.id.toLowerCase().includes(q) || e.label.toLowerCase().includes(q)),
    );
    return json({ entities: entities.slice(0, 100) });
  } catch (e) {
    return err((e as Error).message, 500);
  }
}
