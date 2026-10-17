import { connection } from "next/server";
import type { ActivityItem, FeedEvent, LiveResponse } from "@/contracts";
import { err, json } from "@/lib/auth";
import { db } from "@/lib/db";
import { toActivity, toMemory } from "@/lib/map";
import { COLLISION_WINDOW_MIN } from "../record";

// GET /api/activity/live → { items: last 30 min of agent edits (collisions flagged), feed: recent FeedEvents }
/* eslint-disable @typescript-eslint/no-explicit-any */

const short = (repo: string | null | undefined) => (repo ?? "").replace(/^repo\//, "");
const clip = (s: unknown, n = 90) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
const mins = (ms: number) => Math.max(1, Math.round(ms / 60000));

export async function GET() {
  await connection();
  const sb = db();
  const now = Date.now();
  const since30 = new Date(now - 30 * 60000).toISOString();
  const since24h = new Date(now - 24 * 3600000).toISOString();
  try {
    const [act, ev, mem] = await Promise.all([
      sb.from("activity").select("*").gte("created_at", since30).order("created_at", { ascending: false }).limit(200),
      sb
        .from("events")
        .select("*")
        .in("type", ["correction", "review_comment", "session_start", "approval", "agent_proposal"])
        .order("created_at", { ascending: false })
        .limit(40),
      sb.from("memories").select("*").gte("updated_at", since24h).order("updated_at", { ascending: false }).limit(40),
    ]);
    if (act.error) throw new Error(act.error.message);

    // ---- activity items, flag collisions (another session on the same file within the window before it)
    const rows = act.data ?? [];
    const feed: FeedEvent[] = [];
    const items: ActivityItem[] = rows.map((r: any, i: number) => {
      const item = { ...toActivity(r), repo: short(r.repo) };
      const t = new Date(r.created_at).getTime();
      const other = rows
        .slice(i + 1)
        .find(
          (o: any) =>
            o.file === r.file &&
            o.repo === r.repo &&
            o.session_id !== r.session_id &&
            t - new Date(o.created_at).getTime() <= COLLISION_WINDOW_MIN * 60000,
        );
      if (other) {
        const gap = mins(t - new Date(other.created_at).getTime());
        item.warning = `@${other.actor}'s agent edited this file ${gap} min earlier`;
        feed.push({
          id: `col-${r.id}`,
          type: "collision",
          actor: item.actor,
          text: `started editing ${short(r.repo)}/${r.file} while @${other.actor}'s agent is in it`,
          at: r.created_at,
          repo: item.repo,
        });
      }
      return item;
    });

    // ---- events
    for (const e of ev.data ?? []) {
      const p = e.payload ?? {};
      const base = { id: `ev-${e.id}`, actor: e.actor ?? "someone", at: e.created_at, repo: short(e.repo) || undefined };
      const memoryId = typeof p.memoryId === "string" ? p.memoryId : undefined;
      if (e.type === "session_start") {
        const n = Array.isArray(p.memoryIds) ? p.memoryIds.length : 0;
        const tok = Number(p.tokens ?? 0);
        feed.push({
          ...base,
          type: "session_start",
          text: `started a session: ${p.lessons ?? n} lessons and ${p.locked ?? 0} 🔒 rules loaded (${tok >= 1000 ? (tok / 1000).toFixed(1) + "k" : tok} tokens)`,
        });
      } else if (e.type === "correction") {
        feed.push({ ...base, type: "correction", memoryId, text: `corrected an agent: “${clip(p.text ?? p.prompt)}”` });
      } else if (e.type === "review_comment") {
        feed.push({ ...base, type: "review_comment", memoryId, text: `left a review comment: “${clip(p.text)}”` });
      } else if (e.type === "approval") {
        const rejected = p.action === "reject" || p.status === "rejected";
        const what = p.slug ? `[[${p.slug}]]` : clip(p.title ?? "a lesson", 60);
        feed.push({ ...base, type: rejected ? "rejection" : "approval", memoryId, text: `${rejected ? "rejected" : "approved"} ${what}` });
      }
    }

    // ---- memory status changes (blocked / approved / rejected / agent proposals), last 24h
    for (const r of mem.data ?? []) {
      const m = toMemory(r);
      const changed = new Date(m.updatedAt).getTime() - new Date(m.createdAt).getTime() > 1000;
      const base = { id: `mem-${m.id}-${m.status}`, actor: m.author, at: m.updatedAt, memoryId: m.id };
      if (m.status === "blocked") {
        feed.push({ ...base, type: "blocked", text: `proposed [[${m.slug}]] — 🚫 blocked by a 🔒 rule${m.blockedReason ? `: ${clip(m.blockedReason, 80)}` : ""}` });
      } else if (m.status === "rejected") {
        feed.push({ ...base, type: "rejection", text: `had [[${m.slug}]] rejected` });
      } else if (m.status === "active" && changed && m.source !== "human") {
        feed.push({ ...base, type: "approval", text: `[[${m.slug}]] approved for #${m.scopeId}` });
      } else if (m.status === "pending" && m.source === "agent") {
        feed.push({ ...base, type: "correction", text: `had an agent propose [[${m.slug}]] (pending approval)` });
      }
    }

    const seen = new Set<string>();
    const out: LiveResponse = {
      items: items.slice(0, 50),
      feed: feed
        .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 30),
    };
    return json(out);
  } catch (e) {
    return err(e instanceof Error ? e.message : "live failed", 500);
  }
}
