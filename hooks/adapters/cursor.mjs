#!/usr/bin/env node
// Cursor hook adapter (.cursor/hooks.json, version 1). Docs: https://cursor.com/docs/hooks
//   sessionStart       → context pack           → {"additional_context": "<pack>"}
//   beforeSubmitPrompt → /api/hooks/prompt      → {"continue": true}   (never blocks the prompt)
//   afterFileEdit      → /api/hooks/tool        → {"additional_context": "<warnings>"} (ignored if unsupported)
//   postToolUse        → /api/hooks/tool        → {"additional_context": "<warnings>"} (only when tool_input has a path)
//   sessionEnd         → /api/hooks/session-end → {}   (not `stop`: that fires after every agent turn)
// Usage: node hooks/adapters/cursor.mjs [event]   (event defaults to payload.hook_event_name)
import { briefing, context, edits, filesFrom, prompt, run, sessionEnd, unavailable } from "./lib.mjs";

const eventOf = (p) => process.argv[2] || p.hook_event_name || "";
const ctx = (p) =>
  context("cursor", { cwd: p.workspace_roots?.[0] || p.cwd, session: p.conversation_id || p.session_id });

function noop(p, e) {
  switch (eventOf(p)) {
    case "sessionStart":
      return { additional_context: unavailable(e) };
    case "beforeSubmitPrompt":
      return { continue: true };
    default:
      return {};
  }
}

run(async (p) => {
  const c = ctx(p);
  switch (eventOf(p)) {
    case "sessionStart":
      return { additional_context: await briefing(c) };
    case "beforeSubmitPrompt":
      await prompt(c, p.prompt);
      return { continue: true };
    case "afterFileEdit": {
      const { context: note } = await edits(c, [p.file_path]);
      return note ? { additional_context: note } : {};
    }
    case "postToolUse": {
      if (!/edit|write|replace|create|patch/i.test(String(p.tool_name ?? ""))) return {};
      const { context: note } = await edits(c, filesFrom(p.tool_input));
      return note ? { additional_context: note } : {};
    }
    case "sessionEnd":
      await sessionEnd(c, p.reason || p.status || "other");
      return {};
    default:
      return {};
  }
}, noop);
