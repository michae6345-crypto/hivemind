import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// One structured-output Haiku call for the editor routes. Never throws: null = no key / timeout / refusal / bad JSON.
// Haiku 5.5 rejects non-default sampling params (no temperature) and assistant prefill; thinking off + low effort for speed.
export const HAIKU = "claude-haiku-5-5";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export const llmEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export async function haikuJson<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  opts: { timeoutMs: number; maxTokens: number },
): Promise<T | null> {
  if (!llmEnabled()) return null;
  try {
    const res = await anthropic().messages.create(
      {
        model: HAIKU,
        max_tokens: opts.maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: { type: "json_schema", schema } },
      },
      { timeout: opts.timeoutMs, maxRetries: 0 },
    );
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}
