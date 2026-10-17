// Per-agent wiring. Formats verified against each vendor's docs on 2026-10-16 (see cli/README.md for links).
// Every writer merges keys or leaves the existing file alone; nothing is overwritten.
import { join } from "node:path";
import { hasTemplates, wireFromTemplates } from "./templates.mjs";
import { examplePath, mergeJson, read, write } from "./util.mjs";

const mcpUrl = (ctx) => `${ctx.url}/api/mcp`;
const has = (root, p) => (read(join(root, p)) ?? "").includes("hivemind");

/** Add `servers[name] = value` if missing. Shared by every mcpServers-style config. */
const addKey = (obj, key, name, value) => {
  obj[key] ??= {};
  if (obj[key][name]) return false;
  obj[key][name] = value;
  return true;
};

// ---------- Claude Code: same shape as demo/export-service/.claude/settings.json + .mcp.json ----------
function claudeHooks(ctx) {
  const headers = { Authorization: "Bearer $HIVEMIND_TOKEN", "x-hm-user": "$HIVEMIND_USER", "x-hm-repo": "$HIVEMIND_REPO" };
  const http = (path, timeout) => ({
    type: "http",
    url: `${ctx.url}${path}`, // http hook URLs don't expand env vars, so this is the --url value
    headers,
    allowedEnvVars: ["HIVEMIND_TOKEN", "HIVEMIND_USER", "HIVEMIND_REPO"],
    timeout,
    onFailure: "continue",
  });
  return {
    SessionStart: [
      { matcher: "startup|clear|compact", hooks: [{ type: "command", command: `node "${ctx.sessionStartScript}"`, timeout: 15 }] },
    ],
    UserPromptSubmit: [{ hooks: [http("/api/hooks/prompt", 10)] }],
    PostToolUse: [{ matcher: "Edit|Write|MultiEdit", hooks: [http("/api/hooks/tool", 5)] }],
    SessionEnd: [{ hooks: [http("/api/hooks/session-end", 5)] }],
  };
}
const isOurs = (group) => JSON.stringify(group).match(/\/api\/hooks\/|session-start\.mjs|hivemind/);

function wireClaude(ctx) {
  const mcp = {
    type: "http",
    url: `\${HIVEMIND_API_URL:-${ctx.url}}/api/mcp`,
    headers: {
      Authorization: "Bearer ${HIVEMIND_TOKEN}",
      "x-hm-user": "${HIVEMIND_USER:-sam}",
      "x-hm-repo": `\${HIVEMIND_REPO:-${ctx.repo}}`,
    },
  };
  const hooks = claudeHooks(ctx);
  const settings = () => ({ enabledMcpjsonServers: ["hivemind"], hooks });
  return [
    mergeJson(join(ctx.root, ".mcp.json"), () => ({ mcpServers: { hivemind: mcp } }), (o) => addKey(o, "mcpServers", "hivemind", mcp), ctx.dryRun),
    mergeJson(
      join(ctx.root, ".claude", "settings.json"),
      settings,
      (o) => {
        let changed = false;
        if (!Array.isArray(o.enabledMcpjsonServers)) o.enabledMcpjsonServers = [];
        if (!o.enabledMcpjsonServers.includes("hivemind")) {
          o.enabledMcpjsonServers.push("hivemind");
          changed = true;
        }
        o.hooks ??= {};
        for (const [event, groups] of Object.entries(hooks)) {
          o.hooks[event] ??= [];
          if (o.hooks[event].some(isOurs)) continue;
          o.hooks[event].push(...groups);
          changed = true;
        }
        return changed;
      },
      ctx.dryRun,
    ),
  ];
}

// ---------- Cursor: .cursor/mcp.json (${env:VAR} in headers is documented) ----------
function wireCursor(ctx) {
  const server = {
    url: mcpUrl(ctx),
    headers: {
      Authorization: "Bearer ${env:HIVEMIND_TOKEN}",
      "x-hm-user": "${env:HIVEMIND_USER}",
      "x-hm-repo": ctx.repo,
      "x-hm-agent": "cursor",
    },
  };
  const p = join(ctx.root, ".cursor", "mcp.json");
  return [mergeJson(p, () => ({ mcpServers: { hivemind: server } }), (o) => addKey(o, "mcpServers", "hivemind", server), ctx.dryRun)];
}

// ---------- Gemini CLI: .gemini/settings.json (httpUrl = streamable HTTP; $VAR expansion in settings strings) ----------
function wireGemini(ctx) {
  const server = {
    httpUrl: mcpUrl(ctx),
    headers: {
      Authorization: "Bearer $HIVEMIND_TOKEN",
      "x-hm-user": "$HIVEMIND_USER",
      "x-hm-repo": ctx.repo,
      "x-hm-agent": "gemini-cli",
    },
  };
  const p = join(ctx.root, ".gemini", "settings.json");
  return [mergeJson(p, () => ({ mcpServers: { hivemind: server } }), (o) => addKey(o, "mcpServers", "hivemind", server), ctx.dryRun)];
}

// ---------- GitHub Copilot (VS Code): .vscode/mcp.json, `servers` + `inputs` (${env:} isn't documented there) ----------
function wireCopilot(ctx) {
  const server = {
    type: "http",
    url: mcpUrl(ctx),
    headers: {
      Authorization: "Bearer ${input:hivemind-token}",
      "x-hm-user": "${input:hivemind-user}",
      "x-hm-repo": ctx.repo,
      "x-hm-agent": "copilot",
    },
  };
  const inputs = [
    { type: "promptString", id: "hivemind-token", description: "Hivemind token (HIVEMIND_TOKEN)", password: true },
    { type: "promptString", id: "hivemind-user", description: "Your Hivemind user id (e.g. sam)" },
  ];
  const p = join(ctx.root, ".vscode", "mcp.json");
  if (ctx.skipVscode) return [{ action: "skipped", file: p, note: ".vscode/ owned elsewhere (--no-vscode)" }];
  return [
    mergeJson(
      p,
      () => ({ servers: { hivemind: server }, inputs }),
      (o) => {
        if (!addKey(o, "servers", "hivemind", server)) return false;
        o.inputs ??= [];
        for (const i of inputs) if (!o.inputs.some((x) => x.id === i.id)) o.inputs.push(i);
        return true;
      },
      ctx.dryRun,
    ),
  ];
}

// ---------- Codex CLI: project .codex/config.toml (loaded for trusted projects) ----------
function wireCodex(ctx) {
  const p = join(ctx.root, ".codex", "config.toml");
  const block =
    `[mcp_servers.hivemind]\n` +
    `url = "${mcpUrl(ctx)}"\n` +
    `bearer_token_env_var = "HIVEMIND_TOKEN"\n` +
    `http_headers = { "x-hm-repo" = "${ctx.repo}", "x-hm-agent" = "codex" }\n` +
    `env_http_headers = { "x-hm-user" = "HIVEMIND_USER" }\n`;
  const raw = read(p);
  if (raw === null) {
    write(p, `# Hivemind team memory (written by \`hivemind init\`)\n${block}`, ctx.dryRun);
    return [{ action: "created", file: p }];
  }
  if (/^\s*\[mcp_servers\.hivemind\]/m.test(raw)) return [{ action: "unchanged", file: p }];
  write(p, `${raw.replace(/\s*$/, "")}\n\n${block}`, ctx.dryRun); // a new [table] at EOF can't disturb earlier tables
  return [{ action: "merged", file: p }];
}

// ---------- Windsurf: no project-level MCP file; user-level config only → example + note ----------
function wireWindsurf(ctx) {
  const p = examplePath(join(ctx.root, ".windsurf", "mcp_config.json"));
  const server = {
    serverUrl: mcpUrl(ctx),
    headers: {
      Authorization: "Bearer ${env:HIVEMIND_TOKEN}",
      "x-hm-user": "${env:HIVEMIND_USER}",
      "x-hm-repo": ctx.repo,
      "x-hm-agent": "windsurf",
    },
  };
  if (read(p) !== null) return [{ action: "unchanged", file: p }];
  write(p, JSON.stringify({ mcpServers: { hivemind: server } }, null, 2) + "\n", ctx.dryRun);
  return [{ action: "example", file: p, note: "Windsurf MCP is user-level: merge into ~/.codeium/windsurf/mcp_config.json" }];
}

/**
 * Registry. `detect` = repo markers; `bins` = CLIs on PATH. `rules` = file `hivemind sync` keeps fresh (null = hooks do it).
 * `mcpFile` lets `status` check wiring without re-deriving paths.
 */
export const AGENTS = [
  {
    id: "claude-code",
    label: "Claude Code",
    detect: [".claude", "CLAUDE.md", ".mcp.json"],
    bins: ["claude"],
    wire: wireClaude,
    mcpFile: ".mcp.json",
    hooksFile: ".claude/settings.json",
    rules: null, // SessionStart hook injects the live pack every session
  },
  {
    id: "cursor",
    label: "Cursor",
    detect: [".cursor", ".cursorrules"],
    bins: ["cursor"],
    wire: wireCursor,
    mcpFile: ".cursor/mcp.json",
    hooksFile: ".cursor/hooks.json",
    rules: {
      file: ".cursor/rules/hivemind.mdc",
      frontmatter: "---\ndescription: Hivemind team memory (synced by `hivemind sync`)\nalwaysApply: true\n---\n\n",
    },
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    detect: [".gemini", "GEMINI.md"],
    bins: ["gemini"],
    wire: wireGemini,
    mcpFile: ".gemini/settings.json",
    hooksFile: ".gemini/settings.json",
    rules: { file: "GEMINI.md" },
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    detect: [".github/copilot-instructions.md", ".vscode"],
    bins: ["code"],
    wire: wireCopilot,
    mcpFile: ".vscode/mcp.json",
    hooksFile: ".github/hooks/hivemind.json",
    rules: { file: ".github/copilot-instructions.md" },
  },
  {
    id: "codex",
    label: "Codex CLI",
    detect: [".codex", "AGENTS.md"],
    bins: ["codex"],
    wire: wireCodex,
    mcpFile: ".codex/config.toml",
    hooksFile: ".codex/hooks.json",
    rules: { file: "AGENTS.md" },
  },
  {
    id: "windsurf",
    label: "Windsurf",
    detect: [".windsurf", ".windsurfrules"],
    bins: ["windsurf"],
    wire: wireWindsurf,
    mcpFile: ".windsurf/mcp_config.hivemind.example.json",
    hooksFile: ".windsurf/hooks.json",
    rules: { file: ".windsurf/rules/hivemind.md", frontmatter: "---\ntrigger: always_on\n---\n\n" },
  },
];
export const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

// Prefer agent F's integrations/<tool>/ templates (MCP + hooks + rules stanza); built-in writers above are the
// fallback when the CLI runs without a hivemind checkout next to it.
for (const a of AGENTS) {
  const builtin = a.wire;
  a.wire = (ctx) => (hasTemplates(ctx.hmRoot, a.id) ? wireFromTemplates(ctx, a) : builtin(ctx));
}

/** Is this agent's MCP wired in `root`? */
export const mcpWired = (root, agent) => has(root, agent.mcpFile);
