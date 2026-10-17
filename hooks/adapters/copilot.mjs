#!/usr/bin/env node
// GitHub Copilot hook adapter. Handles both hook dialects:
//  • VS Code agent hooks (.github/hooks/*.json, PascalCase events, snake_case payload, hookSpecificOutput)
//    Docs: https://code.visualstudio.com/docs/copilot/customization/hooks
//  • Copilot CLI / coding agent (version 1, camelCase events + payload: sessionId, toolName, toolArgs)
//    Docs: https://docs.github.com/en/copilot/reference/hooks-configuration
//   SessionStart | sessionStart              → context pack           → additionalContext
//   UserPromptSubmit | userPromptSubmitted   → /api/hooks/prompt      → {}
//   PostToolUse | postToolUse (edit tools)   → /api/hooks/tool        → additionalContext (+ collisions as systemMessage in VS Code)
//   sessionEnd (CLI only; VS Code has none)  → /api/hooks/session-end → {}
// Usage: node hooks/adapters/copilot.mjs [event]
import { briefing, context, edits, filesFrom, prompt, run, sessionEnd, unavailable } from "./lib.mjs";

const EDIT_TOOL = /edit|write|create|replace|insert|patch/i;
const eventOf = (p) => process.argv[2] || p.hook_event_name || p.hookEventName || "";
const isCli = (event) => /^[a-z]/.test(event); // CLI events are camelCase
const ctx = (p) => context("copilot", { cwd: p.cwd, session: p.session_id || p.sessionId });

/** VS Code wants hookSpecificOutput (Claude-compatible); the CLI takes a top-level additionalContext. */
function inject(event, text, message = "") {
  if (isCli(event)) return { additionalContext: text };
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text }, ...(message ? { systemMessage: message } : {}) };
}

function args(p) {
  const a = p.tool_input ?? p.toolArgs;
  if (typeof a !== "string") return a;
  try {
    return JSON.parse(a);
  } catch {
    return { input: a };
  }
}

function noop(p, e) {
  return /^session ?start$/i.test(eventOf(p)) ? inject(eventOf(p), unavailable(e)) : {};
}

run(async (p) => {
  const c = ctx(p);
  const event = eventOf(p);
  switch (event) {
    case "SessionStart":
    case "sessionStart":
      return inject(event, await briefing(c));
    case "UserPromptSubmit":
    case "userPromptSubmitted":
      await prompt(c, p.prompt ?? p.userPrompt);
      return {};
    case "PostToolUse":
    case "postToolUse": {
      if (!EDIT_TOOL.test(String(p.tool_name ?? p.toolName ?? ""))) return {};
      const { context: note, message } = await edits(c, filesFrom(args(p)));
      return note ? inject(event, note, message) : {};
    }
    case "sessionEnd":
      await sessionEnd(c, p.reason);
      return {};
    default:
      return {};
  }
}, noop);
