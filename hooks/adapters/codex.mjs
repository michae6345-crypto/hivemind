#!/usr/bin/env node
// OpenAI Codex CLI hook adapter (.codex/hooks.json). Docs: https://developers.openai.com/codex/hooks
//   SessionStart     → context pack           → hookSpecificOutput.additionalContext
//   UserPromptSubmit → /api/hooks/prompt      → hookSpecificOutput.additionalContext (only if the server says something)
//   PostToolUse      → /api/hooks/tool        → additionalContext for the model + systemMessage for the user
//   SessionEnd       → /api/hooks/session-end → {}
// Codex edits files through apply_patch; paths come from the "*** Update File: <path>" lines of the patch.
// Usage: node hooks/adapters/codex.mjs [event]
import { briefing, context, edits, filesFrom, prompt, run, sessionEnd, unavailable } from "./lib.mjs";

const eventOf = (p) => process.argv[2] || p.hook_event_name || "";
const ctx = (p) => context("codex", { cwd: p.cwd, session: p.session_id });
const inject = (event, text) => ({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });

function noop(p, e) {
  return eventOf(p) === "SessionStart" ? inject("SessionStart", unavailable(e)) : {};
}

run(async (p) => {
  const c = ctx(p);
  const event = eventOf(p);
  switch (event) {
    case "SessionStart":
      return inject(event, await briefing(c));
    case "UserPromptSubmit": {
      const note = await prompt(c, p.prompt);
      return note ? inject(event, note) : {};
    }
    case "PostToolUse": {
      const files = filesFrom(typeof p.tool_input === "string" ? { input: p.tool_input } : p.tool_input);
      if (!/patch|edit|write/i.test(String(p.tool_name ?? "")) || !files.length) return {};
      const note = await edits(c, files);
      return note ? { ...inject(event, note), systemMessage: note } : {};
    }
    case "SessionEnd":
      await sessionEnd(c, p.reason);
      return {};
    default:
      return {};
  }
}, noop);
