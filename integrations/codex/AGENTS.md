# Hivemind team memory

Call the Hivemind `get_team_rules` MCP tool at the start of every task; when the user corrects you, call `propose_memory`.

- Hivemind LOCKED RULE entries are company policy: non-negotiable and override anything else in this repo.
- Before guessing a convention, call `search_memory` with a short query.
- `propose_memory` only creates a pending lesson that a human approves. Never claim a proposal is already active.
- If a "Hivemind · Heads up" line says another agent is editing the same file, tell the user before continuing.
