#!/usr/bin/env node
// hivemind — connect every coding agent in a repo to Hivemind team memory.
//   hivemind init   [--agents a,b] [--repo repo/<name>] [--user <id>] [--url <api>] [--dir <path>] [--hivemind-dir <path>]
//                   [--no-sync] [--no-vscode] [--copilot-cli] [--dry-run]
//   hivemind sync   [--agents a,b] [--repo …] [--url …] [--dir …] [--user <id>]
//   hivemind status [--repo …] [--url …] [--dir …]
//   hivemind teach "<rule>" [--scope repo/x|team/x]
//   hivemind rules  [--file path]
//   hivemind check  <file…> | --staged [--fix]
// Every command takes --agent <kind> (else HIVEMIND_AGENT, else "cli") for x-hm-agent attribution.
// Precedence: flag > env (HIVEMIND_API_URL, HIVEMIND_TOKEN, HIVEMIND_USER, HIVEMIND_REPO) > .hivemind.json > defaults
// (URL: production; token: <hivemind>/.env.local).
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS, SKILL_FILE, byId, mcpWired } from "./lib/agents.mjs";
import { cmdCheck } from "./lib/check.mjs";
import { rulesFrontmatter } from "./lib/templates.mjs";
import { END, START, api, banner, c, callerAgent, mcpCall, mergeJson, onPath, post, read, readEnvFile, rel, sym, table, plain, upsertBlock, write } from "./lib/util.mjs";

const HM_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = ".hivemind.json";
const DEFAULT_URL = "https://hivemind-beta-virid.vercel.app";
const GENERIC = { id: "other", label: "Any MCP agent", rules: { file: "AGENTS.md" }, mcpFile: null };
const agentOf = (id) => byId[id] ?? (id === "other" ? GENERIC : null);

// ---------- args ----------
const BOOLEAN = new Set(["dry-run", "no-sync", "no-vscode", "copilot-cli", "personal", "help", "json", "staged", "fix"]);
function parseArgs(argv) {
  const [cmd = "help", ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const [k, v] = a.slice(2).split(/=(.*)/s);
    if (v !== undefined) flags[k] = v;
    else if (!BOOLEAN.has(k) && rest[i + 1] && !rest[i + 1].startsWith("--")) flags[k] = rest[++i];
    else flags[k] = true;
  }
  return { cmd, flags, positional };
}

function resolveConfig(flags) {
  const dev = readEnvFile(join(HM_ROOT, ".env.local")); // dev fallback, below everything else
  const root = resolve(typeof flags.dir === "string" ? flags.dir : process.cwd());
  let saved = {};
  try {
    saved = JSON.parse(read(join(root, CONFIG)) ?? "{}");
  } catch {
    /* ignore a broken .hivemind.json */
  }
  const rawRepo = flags.repo || process.env.HIVEMIND_REPO || saved.repo || basename(root);
  const repo = String(rawRepo).includes("/") ? String(rawRepo) : `repo/${rawRepo}`;
  // .env.local only supplies the token; its localhost URL must not leak into generated configs.
  const url = String(flags.url || process.env.HIVEMIND_API_URL || saved.url || DEFAULT_URL).replace(/\/+$/, "");
  const actor = (typeof flags.user === "string" && flags.user) || process.env.HIVEMIND_USER || "cli";
  return { root, saved, repo, url, actor, token: process.env.HIVEMIND_TOKEN || dev.HIVEMIND_TOKEN, flags, dryRun: !!flags["dry-run"] };
}

/** Which agents does this repo use? Repo markers first, then CLIs on PATH (init only). */
function detect(root, { usePath }) {
  const found = [];
  for (const a of AGENTS) {
    const marker = a.detect.find((p) => existsSync(join(root, p)));
    if (marker) found.push({ id: a.id, via: marker });
    else if (usePath) {
      const bin = a.bins.find(onPath);
      if (bin) found.push({ id: a.id, via: `${bin} on PATH` });
    }
  }
  return found;
}

function pickAgents(cfg, { usePath }) {
  const list = cfg.flags.agents;
  if (typeof list === "string") {
    const ids = list.split(",").map((s) => s.trim()).filter(Boolean);
    const bad = ids.filter((id) => !agentOf(id));
    if (bad.length) fail(`unknown agent(s): ${bad.join(", ")}. Known: ${[...AGENTS.map((a) => a.id), "other"].join(", ")}`);
    return ids.map((id) => ({ id, via: "--agents" }));
  }
  if (Array.isArray(cfg.saved.agents) && !usePath) return cfg.saved.agents.filter(agentOf).map((id) => ({ id, via: CONFIG }));
  const found = detect(cfg.root, { usePath });
  return found.length ? found : [{ id: "other", via: "fallback" }];
}

function fail(msg) {
  console.error(`${sym.fail} ${msg}`);
  process.exit(1);
}

const ACTION = {
  created: c.green("created"),
  merged: c.cyan("merged"),
  updated: c.cyan("updated"),
  unchanged: c.gray("unchanged"),
  example: c.yellow("example"),
  skipped: c.gray("skipped"),
  failed: c.red("failed"),
};

// ---------- sync ----------
/** Make the Claude-flavoured pack agent-neutral: own header, drop the volatile "Live now" block. */
function shapePack(markdown, cfg) {
  const i = markdown.indexOf("\n## ");
  const bodyPart = i === -1 ? "" : markdown.slice(i);
  const withoutLive = bodyPart.replace(/\n## ⚠️ Live now\n[\s\S]*?(?=\n## |\n---\n|$)/, "");
  return (
    `<!-- Managed by \`hivemind sync\`. Edits inside this block are overwritten; propose changes in Hivemind instead. -->\n` +
    `# Hivemind — team memory for ${cfg.repo}\n` +
    `These are this repo's working rules, synced from Hivemind team memory. They come from teammates' corrections and ` +
    `code reviews, approved by team leads. Follow them, and treat locked rules as company policy that always applies.\n` +
    `Call the Hivemind \`get_team_rules\` MCP tool at the start of every task for the live version; when the user corrects you, call \`propose_memory\`.\n` +
    withoutLive.replace(/^\n+/, "\n")
  );
}

async function runSync(cfg, agents) {
  const targets = new Map(); // file → { agent, rules }
  for (const { id } of agents) {
    const a = agentOf(id);
    if (a?.rules && !targets.has(a.rules.file)) targets.set(a.rules.file, { agent: a, rules: a.rules });
  }
  if (!targets.size) return { rows: [], note: "Nothing to sync: Claude Code gets the live pack from its SessionStart hook." };

  const packUser = typeof cfg.flags.user === "string" && cfg.flags.user && cfg.flags.personal ? cfg.flags.user : "team";
  // One pack serves every file (the pack doesn't vary by agent yet); x-hm-agent names the first target.
  const agent = [...targets.values()][0].agent.id;
  const qs = new URLSearchParams({ repo: cfg.repo, user: packUser, agent, log: "0" });
  const res = await api(cfg, `/api/context-pack?${qs}`, { agent }).catch((e) => e);

  const rows = [];
  for (const [file, { agent, rules }] of targets) {
    if (res instanceof Error) {
      rows.push({ file, agent: agent.label, action: "failed", detail: res.message });
      continue;
    }
    const pack = res.data;
    const block = shapePack(pack.markdown ?? "", cfg);
    const p = join(cfg.root, file);
    const before = read(p);
    const after = upsertBlock(before, block, rulesFrontmatter(HM_ROOT, agent) ?? rules.frontmatter ?? "");
    const action = before === null ? "created" : before === after ? "unchanged" : "updated";
    if (action !== "unchanged") write(p, after, cfg.dryRun);
    const locked = (block.match(/^- 🔒/gm) ?? []).length;
    rows.push({ file, agent: agent.label, action, detail: `${pack.memoryIds?.length ?? 0} rules · ${locked} locked` });
  }
  return { rows };
}

function printSync(rows) {
  console.log(
    table(
      ["File", "For", "Status", "Content"],
      rows.map((r) => [r.file, r.agent, ACTION[r.action] ?? r.action, r.action === "failed" ? c.red(r.detail) : c.gray(r.detail)]),
    ),
  );
}

async function cmdSync(cfg) {
  console.log(banner("sync"), c.gray(`${cfg.repo} ← ${cfg.url}${cfg.dryRun ? "  (dry run)" : ""}`));
  const agents = pickAgents(cfg, { usePath: false });
  const { rows, note } = await runSync(cfg, agents);
  if (note) return console.log(`${sym.dot} ${note}`);
  printSync(rows);
  if (cfg.flags.personal) console.log(`${sym.warn} --personal: these files include ${cfg.flags.user}'s personal lessons. Don't commit them.`);
  if (rows.every((r) => r.action === "failed")) {
    console.log(`${sym.fail} Couldn't reach Hivemind at ${cfg.url}. Is the server up? Is HIVEMIND_TOKEN set?`);
    process.exit(1);
  }
}

// ---------- init ----------
async function cmdInit(cfg) {
  console.log(banner("init"), c.gray(`${cfg.root}${cfg.dryRun ? "  (dry run)" : ""}`));
  const agents = pickAgents(cfg, { usePath: true });
  const sessionStartScript = join(HM_ROOT, "hooks", "session-start.mjs").replace(/\\/g, "/");
  // Hook commands point at <hivemind>/hooks/…; --hivemind-dir overrides (e.g. "../.." for a repo inside the checkout).
  const hivemindDir = String(typeof cfg.flags["hivemind-dir"] === "string" ? cfg.flags["hivemind-dir"] : HM_ROOT).replace(/\\/g, "/");
  const ctx = { ...cfg, hmRoot: HM_ROOT, hivemindDir, hivemindDirFlag: typeof cfg.flags["hivemind-dir"] === "string", sessionStartScript, skipVscode: !!cfg.flags["no-vscode"], copilotCli: !!cfg.flags["copilot-cli"] };

  const rows = [];
  const notes = [];
  for (const { id, via } of agents) {
    const a = agentOf(id);
    const all = a.wire ? a.wire(ctx) : [];
    for (const r of all) if (r.note) notes.push(`${a.label}: ${r.note}`);
    const isRules = (r) => a.rules && rel(cfg.root, r.file) === a.rules.file;
    const results = all.filter((r) => !isRules(r));
    const cfgCell = results.length
      ? results.map((r) => `${ACTION[r.action]} ${rel(cfg.root, r.file)}`).join("\n")
      : c.gray(`MCP: ${cfg.url}/api/mcp`);
    rows.push({ id, label: a.label, via, cfgCell, rulesAction: all.find(isRules)?.action, rules: a.rules?.file ?? (id === "claude-code" ? c.gray("SessionStart hook") : "—") });
  }
  if (ids(agents).some((x) => x !== "claude-code" && x !== "other") && !existsSync(join(HM_ROOT, "hooks", "adapters")))
    notes.push(`hook adapters not found under ${HM_ROOT}/hooks/adapters; MCP + rules files still work.`);
  if (ids(agents).includes("codex")) notes.push("Codex: project .codex/ is read only in trusted projects; approve the new hooks once in /hooks.");
  if (ids(agents).includes("claude-code") && !existsSync(sessionStartScript))
    notes.push(`Claude Code: ${sessionStartScript} not found; point the SessionStart hook at your hivemind checkout.`);

  // Remember choices so `sync` / `status` need no flags.
  const savedAgents = [...new Set([...(Array.isArray(cfg.saved.agents) ? cfg.saved.agents : []), ...ids(agents)])];
  const conf = mergeJson(
    join(cfg.root, CONFIG),
    () => ({ repo: cfg.repo, url: cfg.url, agents: savedAgents }),
    (o) => {
      const before = JSON.stringify(o);
      o.repo ??= cfg.repo;
      o.url ??= cfg.url;
      o.agents = [...new Set([...(o.agents ?? []), ...savedAgents])];
      return JSON.stringify(o) !== before;
    },
    cfg.dryRun,
  );

  let syncRows = [];
  if (!cfg.flags["no-sync"]) syncRows = (await runSync(cfg, agents)).rows;
  const syncBy = Object.fromEntries(syncRows.map((r) => [r.file, r.action]));

  // Rows have multi-line config cells → expand to one line per file.
  const out = [];
  for (const r of rows) {
    const lines = r.cfgCell.split("\n");
    // A file init just created/merged reads better as that than as the follow-up sync "updated".
    const fresh = r.rulesAction === "created" || r.rulesAction === "merged";
    const action = fresh && syncBy[r.rules] !== "failed" ? r.rulesAction : (syncBy[r.rules] ?? r.rulesAction);
    const rulesCell = action ? `${ACTION[action]} ${r.rules}` : r.rules;
    lines.forEach((l, i) => out.push(i === 0 ? [`${sym.ok} ${c.bold(r.label)}`, c.gray(r.via), l, rulesCell] : ["", "", l, ""]));
  }
  console.log(table(["Agent", "Detected via", "MCP / hooks config", "Rules file"], out));
  console.log(`${sym.dot} ${ACTION[conf.action]} ${CONFIG} ${c.gray(`(repo ${cfg.repo}, ${cfg.url})`)}`);

  const failed = syncRows.filter((r) => r.action === "failed");
  if (failed.length) notes.push(`sync failed (${failed[0].detail}); run \`hivemind sync\` once the server is reachable.`);
  for (const n of notes) console.log(`${sym.warn} ${n}`);

  console.log(`\n${c.bold("Next")}`);
  const user = cfg.flags.user && typeof cfg.flags.user === "string" ? cfg.flags.user : "<you>";
  if (!cfg.token) console.log(`  ${sym.arrow} set ${c.cyan("HIVEMIND_TOKEN")} (ask your Hivemind admin)`);
  if (!process.env.HIVEMIND_USER || cfg.flags.user)
    console.log(`  ${sym.arrow} ${c.cyan(process.platform === "win32" ? `setx HIVEMIND_USER ${user}` : `export HIVEMIND_USER=${user}`)}`);
  console.log(`  ${sym.arrow} commit the files above, then run ${c.cyan("hivemind sync")} whenever rules change (or in CI)`);
  console.log(`  ${sym.arrow} ${c.cyan("hivemind status")} to check the connection`);
}
const ids = (agents) => agents.map((a) => a.id);

// ---------- status ----------
async function cmdStatus(cfg) {
  console.log(banner("status"), c.gray(cfg.root));
  const tokenNote = cfg.token ? c.green("set") : c.red("missing");
  let reachable = false;
  try {
    const qs = new URLSearchParams({ repo: cfg.repo, user: "team", log: "0" });
    const { data: pack, ms } = await api(cfg, `/api/context-pack?${qs}`);
    reachable = true;
    const scopes = await api(cfg, "/api/scopes").then((r) => r.data.scopes ?? []).catch(() => []);
    const known = scopes.some((s) => s.id === cfg.repo);
    const chain = new URLSearchParams({ scope: known ? cfg.repo : "org", chain: "1" });
    const [active, pending] = await Promise.all(
      ["active", "pending"].map((s) => api(cfg, `/api/memories?${chain}&status=${s}`).then((r) => r.data.memories ?? []).catch(() => null)),
    );
    const locked = (pack.markdown.match(/^- 🔒/gm) ?? []).length;
    console.log(
      table(
        ["Hivemind", ""],
        [
          ["API", `${sym.ok} ${cfg.url} ${c.gray(`${ms} ms`)}`],
          ["Token", tokenNote],
          ["Repo scope", known ? cfg.repo : `${cfg.repo} ${c.gray("(not in Hivemind yet; showing org memory)")}`],
          ["Rules in pack", `${pack.memoryIds.length} ${c.gray(`(${locked} locked, ~${pack.tokens} tokens)`)}`],
          ["Active memories", active ? String(active.length) : c.gray("n/a")],
          ["Pending lessons", pending ? (pending.length ? c.yellow(`${pending.length} awaiting review`) : "0") : c.gray("n/a")],
        ],
      ),
    );
  } catch (e) {
    console.log(table(["Hivemind", ""], [["API", `${sym.fail} ${cfg.url} ${c.red(e.message)}`], ["Token", tokenNote]]));
  }

  const chosen = new Set(Array.isArray(cfg.saved.agents) ? cfg.saved.agents : detect(cfg.root, { usePath: false }).map((a) => a.id));
  const rows = [];
  for (const a of [...AGENTS, GENERIC]) {
    const rulesPath = a.rules ? join(cfg.root, a.rules.file) : null;
    const rulesText = rulesPath ? read(rulesPath) : null;
    const mcp = a.mcpFile ? mcpWired(cfg.root, a) : null;
    if (!chosen.has(a.id) && (a === GENERIC || (!mcp && !(rulesText ?? "").includes(START)))) continue;
    let rules = c.gray("—");
    if (a.id === "claude-code") {
      const skill = read(join(cfg.root, ...SKILL_FILE.split("/"))) !== null;
      rules = `${c.gray("live via SessionStart")}${skill ? ` · ${sym.ok} /hivemind skill` : ""}`;
    } else if (rulesText?.includes(START) && rulesText.includes(END)) {
      const age = Math.round((Date.now() - statSync(rulesPath).mtimeMs) / 60000);
      rules = `${sym.ok} ${a.rules.file} ${c.gray(age < 1 ? "just now" : age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`)}`;
    } else if (a.rules) rules = `${sym.fail} ${a.rules.file} ${c.gray("(run sync)")}`;
    const userLevel = a.mcpFile?.includes(".hivemind.example");
    const mcpCell =
      mcp === null ? c.gray("—") : !mcp ? `${sym.fail} ${c.gray("not wired")}` : userLevel ? `${sym.warn} user-level ${c.gray("(see example)")}` : `${sym.ok} ${a.mcpFile}`;
    const hooksText = a.hooksFile ? (read(join(cfg.root, a.hooksFile)) ?? "") : null;
    const hooked = hooksText !== null && /\/api\/hooks\/|hooks\/adapters\//.test(hooksText);
    const hooksCell = hooksText === null ? c.gray("—") : hooked ? `${sym.ok} ${a.hooksFile}` : `${sym.fail} ${c.gray("not wired")}`;
    rows.push([c.bold(a.label), mcpCell, hooksCell, rules]);
  }
  if (rows.length) console.log(table(["Agent", "MCP", "Hooks", "Rules"], rows));
  else console.log(`${sym.warn} No agents wired here yet. Run ${c.cyan("hivemind init")}.`);
  if (!reachable) process.exit(1);
}

// ---------- teach ----------
/** Nearest owner up the scope chain ("repo/export-service" → jordan). */
function ownerOf(scopeId, scopes) {
  const byScope = new Map(scopes.map((s) => [s.id, s]));
  for (let s = byScope.get(scopeId); s; s = byScope.get(s.parentId)) if (s.owner) return s.owner;
  return null;
}

async function cmdTeach(cfg, positional) {
  const rule = positional.join(" ").trim();
  if (!rule) fail('usage: hivemind teach "<rule>" [--scope repo/<name>|team/<name>]');
  const scope = typeof cfg.flags.scope === "string" ? cfg.flags.scope : null;
  // A correction goes through the learning engine (extract → merge → locked-rule conflict check). The engine scopes corrections
  // itself, so an explicit team/org scope is sent as a proposal for that scope instead.
  const explicit = scope && !scope.startsWith("repo/");
  const event = explicit
    ? { type: "agent_proposal", actor: cfg.actor, repo: cfg.repo, payload: { title: rule.slice(0, 80), body: rule, scope, via: callerAgent() } }
    : { type: "correction", actor: cfg.actor, repo: scope ?? cfg.repo, sessionId: `cli-${Date.now()}`, payload: { text: rule, via: callerAgent() } };
  if (!cfg.flags.json) console.log(banner("teach"), c.gray(`${scope ?? event.repo} · @${cfg.actor} · ${callerAgent()}`));
  const [res, scopes] = await Promise.all([
    post(cfg, "/api/events", event).catch((e) => fail(e.message)),
    api(cfg, "/api/scopes").then((r) => r.data.scopes ?? []).catch(() => []),
  ]);
  if (cfg.flags.json) return console.log(JSON.stringify(res, null, 2));
  const actionOf = new Map((res.actions ?? []).map((a) => [a.memoryId, a]));
  if (!res.lessons?.length) {
    console.log(`${sym.dot} Nothing new to learn: Hivemind didn't find a reusable rule in that, or already knows it.`);
    return;
  }
  for (const m of res.lessons) {
    const act = actionOf.get(m.id);
    const owner = ownerOf(m.scopeId, scopes);
    const meta = c.gray(`"${plain(m.title)}" · #${m.scopeId} · ${m.status}`);
    if (m.status === "blocked") {
      console.log(`${c.bold(c.rose("Blocked by a locked rule"))}${act?.note || m.blockedReason ? c.rose(` — ${plain(act?.note || m.blockedReason)}`) : ""}`);
    } else if (act?.action === "reinforced" || act?.action === "updated" || m.status === "active") {
      console.log(`${sym.ok} Already known — your correction was added as evidence${m.status === "pending" && owner ? ` (still waiting on @${owner})` : ""}`);
    } else {
      console.log(`${c.bold(c.lesson("Lesson proposed"))} — waiting on ${c.bold(`@${owner ?? "a lead"}`)}`);
    }
    console.log(`   ${meta}`);
  }
}

// ---------- rules ----------
async function cmdRules(cfg) {
  const file = typeof cfg.flags.file === "string" ? cfg.flags.file.replace(/\\/g, "/").replace(/^\.\//, "") : undefined;
  let markdown;
  try {
    markdown = (await mcpCall(cfg, "get_team_rules", { repo: cfg.repo, ...(file ? { file } : {}) })).text;
  } catch (e) {
    if (file) fail(`couldn't get rules for ${file}: ${e.message}`);
    // Without MCP the plain pack still answers "what applies here".
    const qs = new URLSearchParams({ repo: cfg.repo, user: cfg.actor, log: "0" });
    markdown = (await api(cfg, `/api/context-pack?${qs}`).catch((e2) => fail(e2.message))).data.markdown;
  }
  if (cfg.flags.json) return process.stdout.write(markdown.trimEnd() + "\n");
  if (!process.stdout.isTTY) return process.stdout.write(plain(markdown).trimEnd() + "\n");
  for (const raw of markdown.split("\n")) {
    const line = plain(raw);
    if (line.startsWith("#")) console.log(c.bold(line));
    else if (raw.includes("🔒")) console.log(c.rose(line)); // color carries "locked" now that the glyph is gone
    else if (raw.includes("⚠️")) console.log(c.yellow(line));
    else console.log(line.replace(/\*\*(.+?)\*\*/g, (_, t) => c.bold(t)));
  }
}

// ---------- main ----------
const HELP = `${banner("team memory for every coding agent")}

${c.bold("Usage")}
  hivemind init   [--agents claude-code,cursor,gemini-cli,copilot,codex,windsurf,other]
                  [--repo repo/<name>] [--user <id>] [--url <api>] [--dir <path>]
                  [--hivemind-dir <path>] [--no-sync] [--no-vscode] [--copilot-cli] [--dry-run]
  hivemind sync   [--agents …] [--repo …] [--url …] [--dir …] [--dry-run] [--personal --user <id>]
  hivemind status [--repo …] [--url …] [--dir …]
  hivemind teach  "<rule>" [--scope repo/<name>|team/<name>]   propose a lesson (a human approves it)
  hivemind rules  [--file <path>]                              print the rules that apply (to a file)
  hivemind check  <file…> | --staged [--fix]                   team-rule violations as code frames; --fix applies quick fixes

  Any command: --agent <claude-code|cursor|…> (x-hm-agent; default HIVEMIND_AGENT or "cli"), --user <id>

${c.bold("Env")}  HIVEMIND_API_URL  HIVEMIND_TOKEN  HIVEMIND_USER  HIVEMIND_REPO`;

const { cmd, flags, positional } = parseArgs(process.argv.slice(2));
if (typeof flags.agent === "string") process.env.HIVEMIND_AGENT = flags.agent;
const commands = { init: cmdInit, sync: cmdSync, status: cmdStatus, teach: cmdTeach, rules: cmdRules, check: (cfg, pos) => cmdCheck(cfg, pos, fail) };
if (!commands[cmd] || flags.help) {
  console.log(HELP);
  process.exit(commands[cmd] || cmd === "help" || cmd === "--help" ? 0 : 1);
}
commands[cmd](resolveConfig(flags), positional).catch((e) => fail(e?.stack ?? e));
