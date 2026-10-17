import { err, json } from "@/lib/auth";
import { haikuJson, llmEnabled } from "../llm";
import { DATA_FN, DATA_PARAM, auth, loadRules, lru, parseSig, sha256 } from "../shared";
import type { CompleteRequest, CompleteResponse, VsRule } from "../types";

// POST /api/vscode/complete { repo, file, prefix, suffix } → CompleteResponse (ghost text that follows the team's lessons).
// Fast path: opening an export/write function over rows → `assertSingleCustomer(rows);`. Otherwise Haiku, hard 2s cap.
const PREFIX_LINES = 60;
const SUFFIX_LINES = 20;
// Warm Haiku calls measured 1.1–1.6s end to end (cold up to ~4s); 1.4s dropped about half, so cap at 2s (env override).
const LLM_TIMEOUT_MS = Number(process.env.HM_COMPLETE_TIMEOUT_MS) || 2000;
const cache = lru<Omit<CompleteResponse, "cached" | "ms">>(300);

const lessonOf = (r: VsRule | undefined): CompleteResponse["lesson"] =>
  r ? { id: r.id, slug: r.slug, title: r.title, author: r.ownerId, authorName: r.ownerFirst, locked: r.locked } : null;

function fastPath(prefix: string, suffix: string, rules: VsRule[]): { text: string; rule: VsRule } | null {
  const asc = rules.filter((r) => r.symbols.includes("assertSingleCustomer"));
  if (!asc.length || /\bassertSingleCustomer\s*\(/.test(suffix.split("\n").slice(0, 5).join("\n"))) return null;
  const lines = prefix.split("\n").map((s) => s.replace(/\r$/, ""));
  const cur = lines[lines.length - 1];
  // Cursor right after `{`, or on a fresh (blank, maybe indented) line below it.
  const fresh = !cur.trim();
  let braceIdx = lines.length - 1;
  if (fresh) while (braceIdx > 0 && !lines[braceIdx].trim()) braceIdx--;
  if (!lines[braceIdx].trimEnd().endsWith("{")) return null;

  for (let i = braceIdx; i >= Math.max(0, braceIdx - 4); i--) {
    const sig = parseSig(lines, i);
    if (!sig || sig.braceLine !== braceIdx) continue;
    const arg = sig.params.find((p) => DATA_PARAM.test(p));
    if (!arg || !DATA_FN.test(sig.name)) return null;
    const indent = sig.indent + (sig.indent.includes("\t") ? "\t" : "  ");
    const call = `assertSingleCustomer(${arg});`;
    const text = fresh ? " ".repeat(Math.max(0, indent.length - cur.length)) + call : `\n${indent}${call}`;
    return { text, rule: asc.find((r) => !r.locked) ?? asc[0] }; // credit the teammate's lesson over the policy it enforces
  }
  return null;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["completion", "ruleId"],
  properties: { completion: { type: "string" }, ruleId: { anyOf: [{ type: "string" }, { type: "null" }] } },
};

const SYSTEM = `You are an inline code completion engine (ghost text) for a team that has written down its coding rules.
Return the code to insert at <CURSOR>: at most 6 lines, no markdown fences, no explanation, and do not repeat text already before the cursor.
Prefer a completion that follows the team's rules when one is relevant; set ruleId to the id of the rule it follows, else null.
If nothing useful fits, return an empty completion.`;

function clean(completion: string, cur: string): string {
  let t = completion.replace(/^```[\w-]*\n?/, "").replace(/\n?```\s*$/, "");
  const typed = cur.trim();
  if (typed && t.trimStart().startsWith(typed)) t = t.trimStart().slice(typed.length);
  return t.split("\n").slice(0, 6).join("\n").replace(/\s+$/, "");
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const a = auth(req);
  if (a instanceof Response) return a;
  const body = (await req.json().catch(() => null)) as Partial<CompleteRequest> | null;
  if (!body || typeof body.prefix !== "string") return err("expected { repo, file, prefix, suffix }");
  const prefix = body.prefix;
  const suffix = typeof body.suffix === "string" ? body.suffix : "";
  const file = String(body.file ?? "").replace(/\\/g, "/");
  const done = (r: Omit<CompleteResponse, "ms">) => json({ ...r, ms: Date.now() - t0 } satisfies CompleteResponse);
  try {
    const ctx = await loadRules(String(body.repo ?? ""), a.user, file);
    const rules = ctx.all.filter((r) => r.kind !== "owner");

    const fast = fastPath(prefix, suffix, rules);
    if (fast) return done({ text: fast.text, lesson: lessonOf(fast.rule), cached: false, source: "regex" });
    if (!rules.length || !llmEnabled()) return done({ text: "", lesson: null, cached: false, source: "none" });

    const head = prefix.split("\n").slice(-PREFIX_LINES).join("\n");
    const tail = suffix.split("\n").slice(0, SUFFIX_LINES).join("\n");
    const key = sha256(ctx.repo, file, head, tail, ctx.sig);
    const hit = cache.get(key);
    if (hit) return done({ ...hit, cached: true });

    const top = rules.slice(0, 12);
    const ruleList = top.map((r) => `- id=${r.id} ${r.locked ? "🔒 " : ""}"${r.title}": ${r.summary}`).join("\n");
    const out = await haikuJson<{ completion: string; ruleId: string | null }>(
      SYSTEM,
      `Team rules:\n${ruleList}\n\nFile: ${file}\n<code>\n${head}<CURSOR>${tail}\n</code>`,
      SCHEMA,
      { timeoutMs: LLM_TIMEOUT_MS, maxTokens: 200 },
    );
    if (!out || typeof out.completion !== "string") return done({ text: "", lesson: null, cached: false, source: "none" });

    const text = clean(out.completion, prefix.split("\n").pop() ?? "");
    const rule = top.find((r) => r.id === out.ruleId || r.slug === out.ruleId);
    const res = { text, lesson: text ? lessonOf(rule) : null, source: text ? ("llm" as const) : ("none" as const) };
    cache.set(key, res);
    return done({ ...res, cached: false });
  } catch (e) {
    return err(e instanceof Error ? e.message : "complete failed", 500);
  }
}
