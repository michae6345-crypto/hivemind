import "server-only";
import { z } from "zod";
import { llmJson, logStep, type EnginePath } from "./llm";
import { CORRECTION_SYSTEM, REVIEW_SYSTEM } from "./prompts";

// Step ①–② of the pipeline: cheap filter, then extract candidate lessons (+ ratings of served pack items).
// Also hosts the small text helpers (tokens/polarity) that merge.ts and conflict.ts use for their heuristics.

export type Candidate = {
  title: string;
  body: string;
  kind: "lesson" | "fact";
  scope: "repo" | "team";
  confidence: number;
  /** Safety-net candidate: may only reinforce an existing lesson, never create one. */
  reinforceOnly?: boolean;
};
export type ServedItem = { id: string; title: string; body: string };
export type ItemRating = { memoryId: string; rating: "helpful" | "harmful" };
export type Extraction = { isCorrection: boolean; candidates: Candidate[]; ratings: ItemRating[]; path: EnginePath };

// ---------- text helpers ----------
const STOP = new Set(
  "a an the and or but if then so to of in on at for from by with as is are was were be been it its this that these those we you i our your their they them do does did not no never always must should can will would just also into before after when while than only all any every each use using".split(
    " ",
  ),
);

/** Crude stemmer: good enough to match mixing/mixed/mix, exports/export. */
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "") || w;

/** Significant lowercase stems, keeping code identifiers whole (assertSingleCustomer → assertsinglecustomer). */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

/** Code identifiers: camelCase, snake_case, dotted (console.log), or call syntax foo(). */
export function identifiers(text: string): Set<string> {
  const ids = text.match(/\b[a-z]+[A-Z]\w*\b|\b\w+_\w+\b|\b[a-z_]\w+\.[a-z_]\w+\b|\b\w+(?=\()/g) ?? [];
  return new Set(ids.map((s) => s.toLowerCase()));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
export function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/** -1 = prohibits ("never", "don't"), +1 = permits/requires ("is fine", "always", "must"), 0 = neutral. */
export function polarity(text: string): { prohibit: boolean; permit: boolean; require: boolean } {
  const t = text.toLowerCase();
  return {
    prohibit: /\b(never|don'?t|do not|must not|mustn'?t|shouldn'?t|should not|avoid|no longer|forbidden|not allowed|stop)\b/.test(t),
    permit: /\b(is|are|it'?s) (fine|ok|okay|acceptable|allowed)\b|\b(can|may) (skip|mix|ignore|bypass|log)|\bno need to\b|\bnot (necessary|required)\b/.test(t),
    require: /\b(always|must|every|required|make sure|need to|has to|have to)\b/.test(t),
  };
}

// ---------- ① filter (no LLM) ----------
const NOISE = /^(ok(ay)?|lgtm|thanks?( you)?|ty|nice|great|cool|yes|yep|sure|continue|go on|proceed|looks good)[.! ]*$/i;
export function passesFilter(text: string, actor = ""): boolean {
  const t = text.trim();
  if (t.length < 12 || NOISE.test(t)) return false;
  if (/\[bot\]$|^dependabot|^renovate|^github-actions/i.test(actor)) return false;
  if (t.startsWith("<") && t.includes("command-name")) return false; // slash-command echo from Claude Code
  return true;
}

// ---------- ② extract ----------
const ExtractSchema = z.object({
  is_correction: z.boolean(),
  lessons: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      classification: z.enum(["rule", "fact", "one_off", "noise"]),
      scope: z.enum(["repo", "team"]),
      confidence: z.number(),
    }),
  ),
  ratings: z.array(z.object({ idx: z.number(), rating: z.enum(["helpful", "harmful"]) })),
});

export async function extractLessons(opts: {
  mode: "correction" | "review_comment";
  text: string;
  repo: string;
  context?: string;
  file?: string;
  served?: ServedItem[];
  existingTitles?: string[];
}): Promise<Extraction> {
  const served = opts.served ?? [];
  const user = [
    `REPO: ${opts.repo}`,
    opts.file ? `FILE: ${opts.file}` : "",
    opts.context ? `WHAT THE AGENT DID (context):\n${opts.context.slice(0, 1500)}` : "",
    served.length
      ? `SERVED TEAM MEMORIES (idx: title — body):\n${served.map((s, i) => `${i}: ${s.title} — ${s.body.slice(0, 200)}`).join("\n")}`
      : "SERVED TEAM MEMORIES: none",
    opts.existingTitles?.length ? `EXISTING RULES:\n${opts.existingTitles.map((t) => `- ${t}`).join("\n")}` : "",
    `${opts.mode === "review_comment" ? "REVIEW COMMENT" : "ENGINEER MESSAGE"}:\n${opts.text.slice(0, 3000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await llmJson(
    `extract:${opts.mode}`,
    ExtractSchema,
    opts.mode === "review_comment" ? REVIEW_SYSTEM : CORRECTION_SYSTEM,
    user,
  );
  if (out) {
    const candidates = out.lessons
      .filter((l) => (l.classification === "rule" || l.classification === "fact") && l.confidence >= 0.75 && l.title.trim())
      .slice(0, 3)
      .map((l) => ({
        title: l.title.trim().replace(/\.$/, ""),
        body: l.body.trim() || l.title.trim(),
        kind: l.classification === "fact" ? ("fact" as const) : ("lesson" as const),
        scope: l.scope,
        confidence: l.confidence,
      }));
    const ratings = out.ratings
      .filter((r) => Number.isInteger(r.idx) && served[r.idx])
      .slice(0, 3)
      .map((r) => ({ memoryId: served[r.idx].id, rating: r.rating }));
    logStep("extract", "llm", `${candidates.length} candidate(s), ${ratings.length} rating(s)`);
    return { isCorrection: out.is_correction || candidates.length > 0, candidates, ratings, path: "llm" };
  }
  const h = heuristicExtract(opts.text, opts.mode);
  logStep("extract", "heuristic", `${h.candidates.length} candidate(s)`);
  return h;
}

// ---------- heuristic fallback ----------
const CORRECTION_CUE =
  /^(no|nope|wrong|stop|wait|actually|don'?t|do not|never|instead)\b|\b(that'?s (wrong|not right)|instead of|rather than|we (always|never|don'?t)|should(n'?t)? have|you forgot|not like that)\b/i;
const RULE_CUE =
  /\b(must|never|always|every|don'?t|do not|should(n'?t)?|avoid|prefer|instead of|rather than|required?|make sure|(is|are|it'?s) (fine|ok|okay|acceptable|allowed))\b|\buse \S+ (not|instead of|over) \S+/i;
const ONE_OFF_CUE =
  /\b(rename|this (var|variable|line|file|function|method|test|one|time|pr|branch)|that (line|file|var)|here\b|line \d+|typo|for now|just (this|here)|right now|in this case|above|below)\b/i;

const REQUEST_CUE = /\?\s*$|^(can|could|would|will) you\b|^(please|let'?s|now|next|then)\b/i;

function cleanSentence(s: string): string {
  let t = s
    .trim()
    .replace(/^(no+|nope|wrong|wait|actually|hmm|ok(ay)?|so|also|btw|fyi|nit)\b[\s,:;.!—–-]*/i, "")
    .replace(/^(no+|nope)\b[\s,:;.!—–-]*/i, "")
    .replace(/[\s.!]+$/, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

export function heuristicExtract(text: string, mode: "correction" | "review_comment"): Extraction {
  const isCorrection = mode === "review_comment" || CORRECTION_CUE.test(text.trim()) || RULE_CUE.test(text);
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
  const candidates: Candidate[] = [];
  for (const s of sentences) {
    if (!RULE_CUE.test(s) || ONE_OFF_CUE.test(s) || REQUEST_CUE.test(s)) continue;
    const title = cleanSentence(s);
    if (title.length < 10 || title.length > 200) continue;
    const teamish = /\b(we|our team|everywhere|all (services|repos|code)|across)\b/i.test(s) && identifiers(s).size === 0;
    candidates.push({ title, body: title + ".", kind: "lesson", scope: teamish ? "team" : "repo", confidence: 0.8 });
    if (candidates.length >= 3) break;
  }
  return { isCorrection, candidates, ratings: [], path: "heuristic" };
}
