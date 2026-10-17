// Agent F's per-tool templates (integrations/<tool>/) rendered into a target repo.
// JSON is deep-merged without overwriting; TOML gets the table appended once; rules files get the stanza in markers.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { END, START, examplePath, mergeJson, read, upsertBlock, write } from "./util.mjs";

const DIRS = { cursor: "cursor", "gemini-cli": "gemini", copilot: "copilot", codex: "codex", windsurf: "windsurf" };

export const templateDir = (hmRoot, agentId) => (DIRS[agentId] ? join(hmRoot, "integrations", DIRS[agentId]) : null);
export const hasTemplates = (hmRoot, agentId) => {
  const d = templateDir(hmRoot, agentId);
  try {
    return !!d && statSync(d).isDirectory();
  } catch {
    return false;
  }
};

function walk(dir, base = "") {
  const out = [];
  for (const e of readdirSync(join(dir, base), { withFileTypes: true })) {
    const relPath = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, relPath));
    else out.push(relPath);
  }
  return out;
}

const render = (text, ctx) =>
  text
    .replaceAll("{{HIVEMIND_DIR}}", ctx.hivemindDir)
    .replaceAll("{{HIVEMIND_API_URL}}", ctx.url)
    .replaceAll("{{HIVEMIND_REPO}}", ctx.repo);

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Add whatever `src` has that `dst` lacks. Existing scalars win; arrays get missing items appended. */
export function mergeMissing(dst, src) {
  let changed = false;
  for (const [k, v] of Object.entries(src)) {
    const d = dst[k];
    if (d === undefined) {
      dst[k] = v;
      changed = true;
    } else if (k === "hivemind") {
      continue; // an existing hivemind server entry is someone's deliberate config: never add keys inside it
    } else if (isObj(d) && isObj(v)) {
      changed = mergeMissing(d, v) || changed;
    } else if (Array.isArray(d) && Array.isArray(v)) {
      if (JSON.stringify(d).includes("hooks/adapters/")) continue; // this hook event is already wired
      // Items with an id (VS Code `inputs`) match by id; everything else by value.
      const dup = (item) => d.some((x) => (isObj(item) && item.id !== undefined ? x?.id === item.id : same(x, item)));
      for (const item of v)
        if (!dup(item)) {
          d.push(item);
          changed = true;
        }
    }
  }
  return changed;
}

/** `---\n…\n---\n` + body of a rules template. */
export function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return m ? { frontmatter: m[0] + "\n", body: text.slice(m[0].length).trim() } : { frontmatter: "", body: text.trim() };
}

/** Frontmatter from F's rules template for `agent`, if any (used by sync for new files). */
export function rulesFrontmatter(hmRoot, agent) {
  const d = templateDir(hmRoot, agent.id);
  const raw = d && agent.rules ? read(join(d, agent.rules.file)) : null;
  return raw ? splitFrontmatter(raw).frontmatter : null;
}

/**
 * Write every template file for `agent` into ctx.root. Returns [{ action, file, note? }].
 * Special cases: Windsurf mcp_config.json is user-level (→ example), Copilot cli/hooks.json is opt-in (--copilot-cli),
 * .vscode/ is skipped with --no-vscode.
 */
export function wireFromTemplates(ctx, agent) {
  const dir = templateDir(ctx.hmRoot, agent.id);
  const results = [];
  for (const relPath of walk(dir)) {
    const text = render(read(join(dir, relPath)), ctx);
    let dest = relPath;
    if (agent.id === "windsurf" && relPath === "mcp_config.json") {
      const p = examplePath(join(ctx.root, ".windsurf", "mcp_config.json"));
      if (read(p) !== null) results.push({ action: "unchanged", file: p });
      else {
        write(p, text, ctx.dryRun);
        results.push({ action: "example", file: p, note: "Windsurf MCP is user-level: merge the example into ~/.codeium/windsurf/mcp_config.json" });
      }
      continue;
    }
    if (agent.id === "copilot" && relPath === "cli/hooks.json") {
      if (!ctx.copilotCli) continue;
      dest = ".github/hooks/hivemind-cli.json";
    }
    const p = join(ctx.root, dest);
    if (ctx.skipVscode && dest.startsWith(".vscode/")) {
      results.push({ action: "skipped", file: p, note: ".vscode/ left alone (--no-vscode)" });
      continue;
    }

    if (agent.rules && dest === agent.rules.file) {
      // Static stanza until `sync` replaces the block with the live pack. Never clobbers an existing block.
      const before = read(p);
      if (before?.includes(START) && before.includes(END)) {
        results.push({ action: "unchanged", file: p });
        continue;
      }
      const { frontmatter, body } = splitFrontmatter(text);
      write(p, upsertBlock(before, body, frontmatter), ctx.dryRun);
      results.push({ action: before === null ? "created" : "merged", file: p });
    } else if (dest.endsWith(".json")) {
      const src = JSON.parse(text);
      results.push(mergeJson(p, () => src, (o) => mergeMissing(o, src), ctx.dryRun));
    } else if (dest.endsWith(".toml")) {
      const before = read(p);
      const table = text.match(/^\s*\[([^\]]+)\]/m)?.[1];
      if (before !== null && table && before.includes(`[${table}]`)) results.push({ action: "unchanged", file: p });
      else {
        write(p, before === null ? text : `${before.replace(/\s*$/, "")}\n\n${text}`, ctx.dryRun);
        results.push({ action: before === null ? "created" : "merged", file: p });
      }
    } else if (read(p) === null) {
      write(p, text, ctx.dryRun);
      results.push({ action: "created", file: p });
    } else results.push({ action: "unchanged", file: p });
  }
  return results;
}
