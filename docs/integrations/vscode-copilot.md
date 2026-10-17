# Hivemind in VS Code (GitHub Copilot agent mode)

Copilot agent mode talks to Hivemind through MCP. The demo config points at production; VS Code connects from your
machine, so `http://localhost:3000/api/mcp` works too.
The demo repo already has the config: `demo/export-service/.vscode/mcp.json`.

```json
{
  "inputs": [
    { "type": "promptString", "id": "hivemind-token", "description": "Hivemind token (HIVEMIND_TOKEN from the hivemind .env.local)", "password": true },
    { "type": "promptString", "id": "hivemind-user", "description": "Your Hivemind user id (e.g. adrian, michael)" }
  ],
  "servers": {
    "hivemind": {
      "type": "http",
      "url": "https://hivemind-q17i.onrender.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${input:hivemind-token}",
        "x-hm-user": "${input:hivemind-user}",
        "x-hm-repo": "repo/export-service",
        "x-hm-agent": "copilot"
      }
    }
  }
}
```

The format is from the VS Code MCP configuration reference: top-level `servers`, `type: "http"`, `headers`, and
`inputs` with `${input:id}`. VS Code asks for the inputs the first time the server starts and stores them
securely, so no secret is committed. `x-hm-agent: copilot` makes edits and packs show up as "Copilot" in Hivemind's live feed.

## Steps

1. Nothing to run: the config uses production. For a local server, run `pnpm dev` and change `url` to `http://localhost:3000/api/mcp`.
2. In VS Code: **File → Open Folder… → `demo/export-service`**. For your own repo, copy `.vscode/mcp.json` and change `x-hm-repo`.
3. Start the server: open `.vscode/mcp.json` and click the **Start** code lens above `"hivemind"`, or run
   **MCP: List Servers → hivemind → Start Server**. Enter the token and your user id when asked.
4. Open Chat (**Ctrl+Alt+I**), switch the mode dropdown to **Agent**, and open the **tools** picker. You should see
   `get_team_rules`, `search_memory` and `propose_memory` under *hivemind*.
5. Ask: *"Add a CSV export option to src/export.ts."* The server instructions and the tool description tell the agent to call
   `get_team_rules` first. Approve the tool call; the agent gets the 🔒 lab-isolation rule and the export-specific
   lessons before it edits anything.

## Prompts, resources, MCP Apps

- **Prompt:** type `/` in chat and pick `hivemind_briefing` (listed as `/mcp.hivemind.hivemind_briefing`). It loads the whole pack.
- **Resource:** **Add Context… → MCP Resources → Hivemind context pack**.
- **MCP Apps** (inline HTML cards) are experimental in VS Code and need `chat.mcp.apps.enabled`.

## Tip: make "call it first" stick

Copilot follows repo instructions. Add one line to the repo's `.github/copilot-instructions.md`:

```
Before any coding task, call the hivemind `get_team_rules` tool (pass the file you'll edit) and follow its rules.
```

## Troubleshooting

- **Server fails to start / 401:** wrong token. Run **MCP: List Servers → hivemind → Show Output**. To re-enter the
  token: **MCP: Reset Cached Inputs** (or remove the stored input), then restart the server.
- **Tools don't show up:** the chat must be in **Agent** mode, and the server must show as *Running*.
