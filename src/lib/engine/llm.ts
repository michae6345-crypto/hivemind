import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

// Thin wrapper around the Claude API for the learning engine. Every engine step calls `llmJson` and falls back to a
// deterministic heuristic when it returns null (no key, timeout, refusal, bad JSON) — so the pipeline always runs.
// Haiku 5.5 rejects non-default sampling params (temperature → 400), so determinism comes from structured outputs,
// thinking disabled and low effort instead of temperature 0.

export const ENGINE_MODEL = process.env.HIVEMIND_ENGINE_MODEL || "claude-haiku-5-5";
const TIMEOUT_MS = Number(process.env.HIVEMIND_LLM_TIMEOUT_MS || 4000);

let client: Anthropic | null = null;
export const hasLLM = () => !!process.env.ANTHROPIC_API_KEY && process.env.HIVEMIND_ENGINE_MODE !== "heuristic";

function getClient() {
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  return client;
}

export type EnginePath = "llm" | "heuristic";

export function logStep(step: string, path: EnginePath, detail = "") {
  console.log(`[engine] ${step} via ${path}${detail ? ` — ${detail}` : ""}`);
}

/** Structured JSON call. Returns parsed output, or null if the caller should use its heuristic fallback. */
export async function llmJson<S extends z.ZodType>(
  step: string,
  schema: S,
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<z.infer<S> | null> {
  if (!hasLLM()) return null;
  const t0 = Date.now();
  try {
    const res = await getClient().messages.parse({
      model: ENGINE_MODEL,
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal" || res.parsed_output == null) {
      console.warn(`[engine] ${step}: llm returned no usable output (${res.stop_reason}) → heuristic`);
      return null;
    }
    console.log(`[engine] ${step}: llm ok in ${Date.now() - t0}ms`);
    return res.parsed_output as z.infer<S>;
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message;
    console.warn(`[engine] ${step}: llm failed after ${Date.now() - t0}ms (${msg}) → heuristic`);
    return null;
  }
}
