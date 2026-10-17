#!/usr/bin/env node
// Gemini CLI hook adapter (.gemini/settings.json "hooks"). Docs: https://geminicli.com/docs/hooks/
//   SessionStart → context pack           → hookSpecificOutput.additionalContext
//   BeforeAgent  → /api/hooks/prompt      → hookSpecificOutput.additionalContext (only if the server says something)
//   AfterTool    → /api/hooks/tool        → additionalContext for the model + systemMessage for the user
//   SessionEnd   → /api/hooks/session-end → {}
// Edit tools: write_file, replace (matcher in the template). Usage: node hooks/adapters/gemini.mjs [event]
import { briefing, context, edits, filesFrom, prompt, run, sessionEnd, unavailable } from "./lib.mjs";

const EDIT_TOOLS = /^(write_file|replace|edit|write_new_file)$/;
const eventOf = (p) => process.argv[2] || p.hook_event_name || "";
const ctx = (p) => context("gemini-cli", { cwd: p.cwd || process.env.GEMINI_PROJECT_DIR, session: p.session_id });
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
    case "BeforeAgent": {
      const note = await prompt(c, p.prompt);
      return note ? inject(event, note) : {};
    }
    case "AfterTool": {
      if (!EDIT_TOOLS.test(String(p.tool_name ?? ""))) return {};
      const note = await edits(c, filesFrom(p.tool_input));
      return note ? { ...inject(event, note), systemMessage: note } : {};
    }
    case "SessionEnd":
      await sessionEnd(c, p.reason);
      return {};
    default:
      return {};
  }
}, noop);
