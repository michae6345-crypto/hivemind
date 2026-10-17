// Template loader for `hivemind init` (cli/): the exact files each tool needs, placeholders filled in.
//   import { templates } from "<hivemind>/integrations/templates.mjs";
//   templates({ hivemindDir: "C:/Users/me/hivemind", apiUrl: "http://localhost:3000", repo: "repo/export-service" })
//   → [{ agent: "cursor", kind: "hooks", file: ".cursor/hooks.json", scope: "project", content: "…" }, …]
// kind: "mcp" | "hooks" | "rules". scope "user" = merge into the user's own config (Windsurf MCP), not the repo.
// JSON files are meant to be merged key-by-key (hooks.<event>[] / mcpServers.hivemind / servers.hivemind).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** [agent id (AgentKind), template folder, kind, path inside the folder (= path in the target repo), scope] */
export const FILES = [
  ["cursor", "cursor", "mcp", ".cursor/mcp.json", "project"],
  ["cursor", "cursor", "hooks", ".cursor/hooks.json", "project"],
  ["cursor", "cursor", "rules", ".cursor/rules/hivemind.mdc", "project"],
  ["gemini-cli", "gemini", "mcp", ".gemini/settings.json", "project"], // also carries "hooks" + "context.fileName"
  ["gemini-cli", "gemini", "rules", "GEMINI.md", "project"],
  ["codex", "codex", "mcp", ".codex/config.toml", "project"],
  ["codex", "codex", "hooks", ".codex/hooks.json", "project"],
  ["codex", "codex", "rules", "AGENTS.md", "project"],
  ["copilot", "copilot", "mcp", ".vscode/mcp.json", "project"],
  ["copilot", "copilot", "hooks", ".github/hooks/hivemind.json", "project"],
  ["copilot", "copilot", "rules", ".github/copilot-instructions.md", "project"],
  ["windsurf", "windsurf", "hooks", ".windsurf/hooks.json", "project"],
  ["windsurf", "windsurf", "rules", ".windsurf/rules/hivemind.md", "project"],
  ["windsurf", "windsurf", "mcp", "mcp_config.json", "user"], // → ~/.codeium/windsurf/mcp_config.json
];

export function templates({ hivemindDir, apiUrl, repo }) {
  const vars = {
    HIVEMIND_DIR: String(hivemindDir).replace(/\\/g, "/").replace(/\/+$/, ""),
    HIVEMIND_API_URL: String(apiUrl).replace(/\/+$/, ""),
    HIVEMIND_REPO: repo,
  };
  return FILES.map(([agent, folder, kind, file, scope]) => ({
    agent,
    kind,
    file,
    scope,
    content: readFileSync(join(here, folder, file), "utf8").replace(/\{\{(HIVEMIND_[A-Z_]+)\}\}/g, (m, k) => vars[k] ?? m),
  }));
}
