# Hivemind core API (agent A)

All responses are contract shapes from `src/contracts` (camelCase). Errors are `{ "error": string }` with 400/403/404/409/500.
Role headers (UI role switcher): `x-hm-user: <person id>` + `x-hm-role: security|lead|engineer`.
Hooks/MCP/agents: `Authorization: Bearer $HIVEMIND_TOKEN` + `x-hm-user: agent:<session>` (always propose-only).
Memory `:id` accepts the uuid, the slug, or the UI mock id `mem-<slug>`.

```bash
B=http://localhost:3000/api

# Scopes tree + people → { scopes: Scope[], people: Person[] }
curl -s $B/scopes

# Memories → { memories: Memory[] }   (all filters optional; status may be a comma list; chain=1 adds ancestor scopes)
curl -s "$B/memories?scope=repo/export-service&chain=1&status=active&q=export"

# Create → Memory (201). Writer with rights on the scope → active; engineer outside personal/<me> or agent → pending; locked needs security
curl -s -X POST $B/memories -H "x-hm-user: jordan" -H "x-hm-role: lead" -H "content-type: application/json" \
  -d '{"scopeId":"team/data-pipelines","kind":"directive","title":"Retries use exponential backoff","body":"…"}'

# Approve → Memory (status active, alpha += 2, "Approved by" evidence, events row type approval). 403 if role can't; blocked = security only
curl -s -X POST $B/memories/export-assert-single-customer/approve -H "x-hm-user: jordan" -H "x-hm-role: lead"

# Reject → Memory (status rejected, beta += 1, events row type rejection)
curl -s -X POST $B/memories/allsettled-fanout/reject -H "x-hm-user: jordan" -H "x-hm-role: lead"

# 403 example: an engineer can't approve a team lesson → {"error":"engineer alex cannot approve memories in team/data-pipelines"}
curl -s -X POST $B/memories/export-assert-single-customer/approve -H "x-hm-user: alex" -H "x-hm-role: engineer"

# Editor autocomplete → { entities: Entity[] }   kind = person|org|team|repo|link (link id = memory slug)
curl -s "$B/entities?q=jor&kind=person"
```

Permissions (`src/lib/auth.ts` `canWrite`): security → anywhere (and may lock / touch locked); lead → own team subtree;
engineer → `personal/<self>` only; agent → never (proposals only). Locked memories can't be approved/rejected except by security.

Seed / reset the demo company: `node scripts/seed.mjs` (upserts from `src/mocks/data.ts`; idempotent; never deletes;
resets seeded memories' status/alpha/beta, so it doubles as a demo reset). Then `node scripts/seed-scenarios.mjs` adds
26 realistic lessons (incident/PR/Linear evidence), `repo/labeling-api`, and the `repo/playground` sandbox scope
(Michael's experiments; reset-demo leaves its activity and memories alone). Upsert-only; `SCENARIO_SLUGS` is importable.
