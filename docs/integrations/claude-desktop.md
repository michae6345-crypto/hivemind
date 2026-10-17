# Hivemind in Claude Desktop

Claude Desktop has no hooks either, so it gets Hivemind through the MCP server: `get_team_rules` (call first),
`search_memory`, `propose_memory`, the `hivemind_briefing` prompt and the `hivemind://context-pack` resource.
There are two ways to connect.

## Option A — custom connector (same as claude.ai)

Claude Desktop uses the same **Connectors** flow as claude.ai: **Settings → Connectors → Add custom connector**
(Team/Enterprise: an Owner adds it under Organization settings). Connectors added this way sync with your claude.ai account.

- The URL must be **public** (the Render deploy or a tunnel). Like claude.ai, the connection is made from Anthropic's cloud,
  not from your machine.
- Use the same values as [claude-ai.md](claude-ai.md):
  `https://hivemind-q17i.onrender.com/api/mcp?token=<CONNECTOR_TOKEN>&user=<you>&repo=export-service&agent=claude-ai`,
  Authentication **No sign-in**. Read the security notes there about the token in the URL.

## Option B — local server via `claude_desktop_config.json` (works with `localhost`)

Anthropic's documented `claude_desktop_config.json` examples use **stdio** servers (`command` + `args`). To reach our
HTTP server on localhost, run the `mcp-remote` bridge as the stdio command. That's from the mcp-remote README, not
from Anthropic's docs.

1. Open the config: **Settings → Developer → Edit Config**.
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add:

```json
{
  "mcpServers": {
    "hivemind": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "http://localhost:3000/api/mcp",
        "--header", "Authorization:${HM_AUTH}",
        "--header", "x-hm-user:${HM_USER}",
        "--header", "x-hm-repo:repo/export-service",
        "--header", "x-hm-agent:claude-ai"
      ],
      "env": { "HM_AUTH": "Bearer <HIVEMIND_TOKEN>", "HM_USER": "michael" }
    }
  }
}
```

   The `Authorization:${HM_AUTH}` form, with no space after the colon and the value in `env`, is the workaround the
   mcp-remote README gives for Windows/Desktop mangling spaces inside `args`.
3. Fully quit Claude Desktop (tray icon → Quit) and reopen it. In a chat, the tools menu should list **hivemind**
   with three tools.

## Try it

> Before we start on export-service, load the team rules and tell me which ones are 🔒.

Claude calls `get_team_rules` and lists *Never mix data from different lab customers* and *Never log expert personal info*.
You can also attach the **hivemind_briefing** prompt from the **+** menu.

## Troubleshooting

- **401:** wrong token. Header tokens must equal `HIVEMIND_TOKEN`. URL tokens must equal `HIVEMIND_CONNECTOR_TOKEN`
  (or `HIVEMIND_TOKEN` if that isn't set).
- **Option A can't connect:** the URL isn't public. Run `curl -X POST https://hivemind-q17i.onrender.com/api/mcp?token=… -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` from another network.
- **Option B shows no tools:** check the MCP logs (Settings → Developer). `npx` must be on PATH, and the dev server must be running.
