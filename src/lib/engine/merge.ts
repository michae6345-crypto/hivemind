import "server-only";
import { z } from "zod";
import { llmJson, logStep, type EnginePath } from "./llm";
import { MERGE_SYSTEM } from "./prompts";
import { identifiers, jaccard, overlap, polarity, tokens } from "./extract";
import { contradicts } from "./conflict";

// Step ③: Mem0-style ADD / UPDATE / DELETE / NONE against existing unlocked lessons in the scope chain.

export type ExistingLesson = { id: string; title: string; body: string };
export type MergeDecision = {
  event: "ADD" | "UPDATE" | "DELETE" | "NONE";
  target: ExistingLesson | null;
  mergedText?: string;
  path: EnginePath;
};

const MergeSchema = z.object({
  event: z.enum(["ADD", "UPDATE", "DELETE", "NONE"]),
  target_id: z.number().nullable(),
  merged_text: z.string().nullable(),
});

export async function decideMerge(candidate: { title: string; body: string }, existing: ExistingLesson[]): Promise<MergeDecision> {
  if (!existing.length) return { event: "ADD", target: null, path: "heuristic" };
  // Keep the prompt small: only the most lexically related lessons, with short integer ids (mapped back below).
  const cTok = tokens(`${candidate.title} ${candidate.body}`);
  const ranked = existing
    .map((e) => ({ e, s: jaccard(cTok, tokens(`${e.title} ${e.body}`)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.e);

  const user = `EXISTING LESSONS:\n${JSON.stringify(ranked.map((e, i) => ({ id: i, text: `${e.title} — ${e.body.slice(0, 300)}` })), null, 1)}\n\nNEW LESSON: ${candidate.title} — ${candidate.body}`;
  const out = await llmJson("merge", MergeSchema, MERGE_SYSTEM, user, 500);
  if (out) {
    const target = out.target_id != null ? (ranked[out.target_id] ?? null) : null;
    // An op that names no valid target degrades to ADD (or is dropped as NONE-irrelevant → treat as ADD of a new lesson).
    const event = out.event !== "ADD" && !target ? "ADD" : out.event;
    logStep("merge", "llm", `${event}${target ? ` → "${target.title}"` : ""}`);
    return { event, target: event === "ADD" ? null : target, mergedText: out.merged_text ?? undefined, path: "llm" };
  }
  const h = heuristicMerge(candidate, ranked);
  logStep("merge", "heuristic", `${h.event}${h.target ? ` → "${h.target.title}"` : ""}`);
  return h;
}

/** Duplicate = high token overlap or a shared code identifier with the same polarity; DELETE = same topic, opposite polarity. */
export function heuristicMerge(candidate: { title: string; body: string }, existing: ExistingLesson[]): MergeDecision {
  const cText = `${candidate.title}. ${candidate.body}`;
  const cTok = tokens(cText);
  const cIds = identifiers(cText);
  const cPol = polarity(cText);
  let best: { e: ExistingLesson; score: number } | null = null;
  for (const e of existing) {
    const eText = `${e.title}. ${e.body}`;
    const eTok = tokens(eText);
    const j = jaccard(cTok, eTok);
    const sharedId = overlap(cIds, identifiers(eText)) > 0;
    const sameTopic = j >= 0.5 || (sharedId && overlap(cTok, eTok) >= 2);
    if (!sameTopic) continue;
    if (contradicts(polarity(eText), cPol)) return { event: "DELETE", target: e, path: "heuristic" };
    const score = j + (sharedId ? 0.5 : 0);
    if (!best || score > best.score) best = { e, score };
  }
  return best ? { event: "NONE", target: best.e, path: "heuristic" } : { event: "ADD", target: null, path: "heuristic" };
}
