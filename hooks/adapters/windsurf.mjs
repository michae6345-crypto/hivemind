#!/usr/bin/env node
// Windsurf (Cascade) hook adapter (.windsurf/hooks.json). Docs: https://docs.windsurf.com/windsurf/cascade/hooks
// Cascade hooks can't inject context and there's no session-start event, so the briefing comes from the
// always-on rules file + the get_team_rules MCP tool. What the hooks can do:
//   pre_user_prompt → /api/hooks/prompt → prints nothing (exit 0 = never blocks the prompt)
//   post_write_code → /api/hooks/tool   → plain-text warnings on stdout (shown to the user when show_output: true)
// Usage: node hooks/adapters/windsurf.mjs [event]   (event defaults to payload.agent_action_name)
import { context, edits, prompt, run } from "./lib.mjs";

const eventOf = (p) => process.argv[2] || p.agent_action_name || "";
const ctx = (p) => context("windsurf", { cwd: process.env.HIVEMIND_PROJECT_DIR || process.cwd(), session: p.trajectory_id });

run(
  async (p) => {
    const c = ctx(p);
    const info = p.tool_info ?? {};
    switch (eventOf(p)) {
      case "pre_user_prompt":
        await prompt(c, info.user_prompt ?? info.prompt);
        return "";
      case "post_write_code":
        return (await edits(c, [info.file_path])).context; // the user is the only audience: every line
      default:
        return "";
    }
  },
  () => "",
);
