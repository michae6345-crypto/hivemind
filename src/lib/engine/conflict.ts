import "server-only";
import { z } from "zod";
import { llmJson, logStep, type EnginePath } from "./llm";
import { CONFLICT_SYSTEM } from "./prompts";
import { overlap, polarity, tokens } from "./extract";

// Step ④: does a candidate lesson contradict a 🔒 locked memory in its scope chain? Locked always wins.

export type LockedRule = { id: string; title: string; body: string };
export type ConflictResult = { conflict: LockedRule | null; reason: string; path: EnginePath };

const ConflictSchema = z.object({ contradicted_ids: z.array(z.number()), reason: z.string() });

export async function checkConflict(candidate: { title: string; body: string }, locked: LockedRule[]): Promise<ConflictResult> {
  if (!locked.length) return { conflict: null, reason: "", path: "heuristic" };
  const user = `<LOCKED RULES>\n${locked.map((l, i) => `id=${i}: ${l.title} — ${l.body.slice(0, 300)}`).join("\n")}\n</LOCKED RULES>\n\n<NEW LESSON>\n${candidate.title} — ${candidate.body}\n</NEW LESSON>`;
  const [out, h] = await Promise.all([llmJson("conflict", ConflictSchema, CONFLICT_SYSTEM, user, 400), Promise.resolve(heuristicConflict(candidate, locked))]);
  if (out) {
    // Locked always wins: the deterministic guard can block even when the model says "no conflict".
    const hit = out.contradicted_ids.map((i) => locked[i]).find(Boolean) ?? h;
    const via = hit && !out.contradicted_ids.length ? " (heuristic guard)" : "";
    logStep("conflict", "llm", hit ? `contradicts 🔒 "${hit.title}"${via}` : "no conflict");
    return { conflict: hit, reason: via ? "Opposite polarity on the same topic as a locked rule" : out.reason, path: "llm" };
  }
  logStep("conflict", "heuristic", h ? `contradicts 🔒 "${h.title}"` : "no conflict");
  return { conflict: h, reason: h ? "Opposite polarity on the same topic as a locked rule" : "", path: "heuristic" };
}

/**
 * Heuristic: same topic (≥2 shared significant stems) + opposite polarity, e.g. locked "Never mix … Lab A / Lab B"
 * vs candidate "Mixing Lab A and Lab B data is fine in tests" (prohibit vs permit), or locked "always X" vs "don't X".
 */
export function heuristicConflict(candidate: { title: string; body: string }, locked: LockedRule[]): LockedRule | null {
  const cText = `${candidate.title}. ${candidate.body}`;
  const cTok = tokens(cText);
  const cPol = polarity(cText);
  for (const l of locked) {
    const lText = `${l.title}. ${l.body}`;
    if (overlap(cTok, tokens(lText)) < 2) continue;
    if (contradicts(polarity(lText), cPol)) return l;
  }
  return null;
}

/** Opposite polarity between two statements about the same topic. */
export function contradicts(a: ReturnType<typeof polarity>, b: ReturnType<typeof polarity>): boolean {
  // Deliberately conservative: "never log PII" vs "always redact PII before logging" must NOT conflict.
  return (a.prohibit && b.permit) || (a.permit && b.prohibit) || (a.require && !a.prohibit && (b.prohibit || b.permit) && !b.require);
}
