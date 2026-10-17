# Hivemind in claude.ai (custom connector)

claude.ai has no hooks, so Hivemind reaches it through the MCP server at `/api/mcp`:

- **`get_team_rules`**: the server instructions and the tool description tell Claude to call it first. It returns the
  same context pack Claude Code gets at session start, plus the rules for one file.
- **`search_memory`** and **`propose_memory`**. Proposals are always `pending` until a human approves them.
- Prompt **`hivemind_briefing`** and resource **`hivemind://context-pack`**. claude.ai documents support for MCP prompts and resources.

Activity is attributed as `claude-ai`: from `?agent=claude-ai`, or else from Anthropic's egress range `160.79.104.0/21`.

## 1. The URL must be public

claude.ai connects to connectors **from Anthropic's cloud**, so `localhost` won't work. That's documented. Use either:
- the Vercel deployment: `https://<app>.vercel.app/api/mcp`
- a tunnel to your dev server, e.g. `cloudflared tunnel --url http://localhost:3000`, which gives
  `https://<random>.trycloudflare.com`. Some networks block trycloudflare; see "Tunnels" below.

## 2. Add the connector

Anthropic's help center gives this path. The menu layout varies by plan and org.

- **Pro / Max (individual):** **Customize → Connectors → "+ Add" → "Add custom connector"**.
  Older UIs show **Settings → Connectors → Add custom connector**.
- **Team / Enterprise:** an Owner adds it under **Organization settings → Connectors → Add → Custom → Web**.
  Members then click **Connect**.

Fill in the dialog:

| Field | Value |
|---|---|
| Name | `Hivemind` |
| MCP server URL | `https://<host>/api/mcp?token=<CONNECTOR_TOKEN>&user=<your id>&repo=export-service&agent=claude-ai` |
| Authentication | **No sign-in** |
| Request headers *(only if your org has this beta)* | `Authorization: Bearer <HIVEMIND_TOKEN>`. Then leave `token=` out of the URL. |

- `user` is your Hivemind person id (`michael`, `adrian`, or a demo persona like `noor`).
- `repo` is the scope the pack is built for (`export-service` = `repo/export-service`).
- Auth settings can't be edited after adding. To change the token, remove the connector and add it again.

## 3. Use it

In a new chat, open the **+ / tools** menu and make sure **Hivemind** is enabled. Then try:

> I'm about to change `src/export.ts` in export-service. What rules apply?

Claude should call `get_team_rules` with `file: "src/export.ts"`. The answer should include
🔒 *Never mix data from different lab customers* and the file-specific rules. `hivemind_briefing` loads the
whole pack into the chat as a prompt.

## Security: the token in the URL

Anthropic's connector docs say not to accept credentials in the URL, and the MCP auth spec forbids query-string
tokens. We accept them anyway as a **hackathon trade-off**, because the headers beta isn't available to every org. What this means:

- **Where it leaks:** the URL is stored in the connector config, and it shows up in server/proxy request logs
  (Vercel, the tunnel) and in anything that logs full URLs.
- **What a leaked URL can do:** read the team's memory (`get_team_rules`, `search_memory`) and file **pending**
  proposals. It can't approve, lock, edit or create active memories. That needs the UI's role-checked routes.
- **Mitigations:**
  - Set **`HIVEMIND_CONNECTOR_TOKEN`** on the server. URL tokens are then checked against it instead of
    `HIVEMIND_TOKEN`, so the hook token never goes into a URL. Rotate it after the demo.
  - Prefer the Request-headers field when your org has it.
  - The demo company (Meridian Data) is fictional.
- **Production fix:** OAuth 2.1. claude.ai supports CIMD/DCR and mcp-handler ships `withMcpAuth` and
  `protectedResourceHandler`, but it needs an authorization server. That's out of scope for the hackathon.

## Tunnels

`cloudflared tunnel --url http://localhost:3000` needs no account. Cloudflare says quick tunnels don't support SSE.
Our server answers each POST with a short `text/event-stream` body that closes right away, not a long-lived stream.
If `api.trycloudflare.com` is blocked on your network (the connection gets reset, as happened on the hackathon wifi),
use an SSH tunnel instead: `ssh -R 80:localhost:3000 nokey@localhost.run`. It prints an `https://….lhr.life` URL.
Or deploy to Vercel.
