import { connection } from "next/server";
import type { Metrics } from "@/contracts";
import { json } from "@/lib/auth";
import { db } from "@/lib/db";
import evalResults from "../../../../eval/results.json";
import evalCurve from "../../../../eval/curve.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const ms = (s: string) => new Date(s).getTime();
const PROPOSED = new Set(["correction", "review", "agent"]);
const LIVE_TRANSFER_WINDOW = 24 * 3600e3;

/**
 * GET /api/metrics → Metrics (+ evalDetail, sources).
 * - curve: pack_log sessions in time order; corrections = max(pack_log.corrections, correction events in that session);
 *   lessonApproved = first lesson approved since the previous session.
 * - repeatMistakeRate: share of sessions with a correction about a lesson that was already approved at the time
 *   (correction events tagged payload.lesson, plus correction evidence appended to an approved memory afterwards).
 * - acceptanceRate: approved / (approved + rejected) over proposed lessons (source correction|review|agent, or
 *   approval/rejection events); auto-blocked lessons count as rejected.
 * - transfer: lesson whose first evidence came from X, later served (pack_log.memory_ids) to Y ≠ X in a session that
 *   touched the topic (session_end payload.topics) without a correction on it. Live sessions carry no topic list, so they
 *   count only for lessons approved in the previous 24h.
 * Rows from scripts/seed-history.mjs are synthetic (payload.synthetic=true, session ids hist-*); `sources` reports how many.
 */
export async function GET() {
  await connection(); // always computed at request time (cacheComponents is on)
  const evalPart = toEval();
  try {
    const sb = db();
    const [packs, events, mems] = await Promise.all([
      sb.from("pack_log").select("session_id,actor,repo,memory_ids,corrections,created_at").order("created_at").limit(1000),
      sb.from("events").select("type,actor,session_id,payload,created_at").in("type", ["correction", "approval", "rejection", "session_end"]).order("created_at").limit(10000),
      sb.from("memories").select("id,slug,title,status,source,author,evidence,created_at"),
    ]);
    if (packs.error || events.error || mems.error) throw new Error((packs.error ?? events.error ?? mems.error)!.message);
    return json({ ...compute(packs.data ?? [], events.data ?? [], mems.data ?? []), ...evalPart });
  } catch (e) {
    const empty: Metrics = { curve: [], repeatMistakeRate: 0, acceptanceRate: 0, transfer: [] };
    return json({ ...empty, ...evalPart, error: (e as Error).message });
  }
}

function compute(packs: Row[], events: Row[], mems: Row[]) {
  const byId = new Map(mems.map((m) => [m.id, m]));
  const bySlug = new Map(mems.map((m) => [m.slug, m]));
  const memOf = (p: Row | null | undefined): Row | undefined =>
    !p ? undefined : byId.get(p.memoryId ?? p.memory_id ?? p.id) ?? bySlug.get(String(p.slug ?? p.lesson ?? "").replace(/^mem-/, ""));

  // When each memory was approved (earliest approval event).
  const approvedAt = new Map<string, number>();
  const approvedKeys = new Set<string>();
  const rejectedKeys = new Set<string>();
  for (const e of events) {
    const m = memOf(e.payload);
    const key = m?.id ?? e.payload?.slug ?? e.payload?.memoryId;
    if (e.type === "approval" && key) {
      approvedKeys.add(key);
      if (m && !approvedAt.has(m.id)) approvedAt.set(m.id, ms(e.created_at));
    }
    if (e.type === "rejection" && key) rejectedKeys.add(key);
  }
  for (const m of mems.filter((m) => PROPOSED.has(m.source))) {
    if (m.status === "active" || m.status === "invalid") approvedKeys.add(m.id);
    if (m.status === "rejected" || m.status === "blocked") rejectedKeys.add(m.id);
  }
  for (const k of approvedKeys) rejectedKeys.delete(k);
  const acceptanceRate = approvedKeys.size + rejectedKeys.size ? approvedKeys.size / (approvedKeys.size + rejectedKeys.size) : 0;

  // Per-session corrections.
  const corrBySession = new Map<string, Row[]>();
  for (const e of events.filter((e) => e.type === "correction" && e.session_id)) {
    corrBySession.set(e.session_id, [...(corrBySession.get(e.session_id) ?? []), e]);
  }
  const topicsBySession = new Map<string, string[]>();
  for (const e of events.filter((e) => e.type === "session_end" && Array.isArray(e.payload?.topics))) topicsBySession.set(e.session_id, e.payload.topics);

  // Curve.
  const approvals = [...approvedAt.entries()].map(([id, t]) => ({ slug: byId.get(id)!.slug as string, t })).sort((a, b) => a.t - b.t);
  let prev = -Infinity;
  const curve: Metrics["curve"] = packs.map((p, i) => {
    const t = ms(p.created_at);
    const approved = approvals.find((a) => a.t > prev && a.t <= t);
    prev = t;
    const corrections = Math.max(p.corrections ?? 0, corrBySession.get(p.session_id)?.length ?? 0);
    return approved ? { session: i + 1, corrections, lessonApproved: approved.slug } : { session: i + 1, corrections };
  });

  // Repeat mistakes.
  const repeatSessions = new Set<string>();
  for (const [sid, cs] of corrBySession) {
    for (const c of cs) {
      const m = memOf({ lesson: c.payload?.lesson, memoryId: c.payload?.memoryId });
      const a = m && approvedAt.get(m.id);
      if (a && a < ms(c.created_at)) repeatSessions.add(sid);
    }
  }
  for (const m of mems) {
    const a = approvedAt.get(m.id);
    if (!a) continue;
    for (const ev of (m.evidence ?? []) as Row[]) {
      if ((ev.type === "correction" || ev.type === "review_comment") && ev.at && ms(ev.at) > a && !String(ev.actor).startsWith("agent")) {
        repeatSessions.add(ev.ref ?? `${ev.actor}@${ev.at}`);
      }
    }
  }
  const repeatMistakeRate = packs.length ? Math.min(1, repeatSessions.size / packs.length) : 0;

  // Cross-user transfer.
  const origin = (m: Row): string => {
    const ev = ((m.evidence ?? []) as Row[]).filter((e) => e.actor && !String(e.actor).startsWith("agent")).sort((a, b) => ms(a.at ?? 0) - ms(b.at ?? 0));
    return ev[0]?.actor ?? m.author ?? "unknown";
  };
  const seen = new Set<string>();
  const transfer: Metrics["transfer"] = [];
  for (const p of packs) {
    const t = ms(p.created_at);
    const topics = topicsBySession.get(p.session_id);
    const corrected = new Set((corrBySession.get(p.session_id) ?? []).map((c) => memOf({ lesson: c.payload?.lesson, memoryId: c.payload?.memoryId })?.id).filter(Boolean));
    for (const id of (p.memory_ids ?? []) as string[]) {
      const m = byId.get(id);
      const a = approvedAt.get(id);
      if (!m || !a || a >= t || corrected.has(id)) continue;
      if (topics ? !topics.includes(m.slug) : t - a > LIVE_TRANSFER_WINDOW) continue;
      const from = origin(m);
      const key = `${m.slug}|${from}|${p.actor}`;
      if (from === p.actor || seen.has(key)) continue;
      seen.add(key);
      transfer.push({ lesson: m.slug, from, to: p.actor, at: p.created_at });
    }
  }
  transfer.sort((a, b) => ms(b.at) - ms(a.at));

  return {
    curve,
    repeatMistakeRate: +repeatMistakeRate.toFixed(3),
    acceptanceRate: +acceptanceRate.toFixed(3),
    transfer,
    sources: {
      sessions: packs.length,
      syntheticSessions: packs.filter((p) => String(p.session_id).startsWith("hist-")).length,
      syntheticNote: "Sessions hist-* and events with payload.synthetic=true are generated by scripts/seed-history.mjs (see docs/eval.md).",
    },
  };
}

/** Contract `eval` (OFF vs ON) plus the detail an evals reviewer wants: n, held-out split, placebo arm, CIs, curve. */
function toEval(): { eval?: Metrics["eval"]; evalDetail?: unknown } {
  const r = evalResults as Row;
  if (!r?.off || !r?.on) return {};
  const arm = (a: Row) => ({ violationsPerTask: a.violationsPerTask, passRate: a.passRate });
  return {
    eval: { tasks: r.tasks, runs: r.runs, off: arm(r.off), on: arm(r.on) },
    evalDetail: {
      model: r.model,
      n: { off: r.off.n, on: r.on.n, placebo: r.placebo?.n ?? 0 },
      placebo: r.placebo ? arm(r.placebo) : null,
      targetViolations: { off: r.off.targetViolations, on: r.on.targetViolations, placebo: r.placebo?.targetViolations ?? null },
      passRateCI95: { off: r.off.passRateCI95, on: r.on.passRateCI95, placebo: r.placebo?.passRateCI95 ?? null },
      heldOut: r.heldOut,
      heldOutTasks: r.heldOutTasks,
      stats: r.stats,
      curve: (evalCurve as Row)?.points ?? [],
    },
  };
}
