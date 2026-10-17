// The full CLI (everything except the instant `hivemind open` path, see ../hivemind.mjs).
// hivemind — connect every coding agent in a repo to Hivemind team memory.
//   hivemind init   [--agents a,b] [--repo repo/<name>] [--user <id>] [--url <api>] [--dir <path>] [--hivemind-dir <path>]
//                   [--no-sync] [--no-vscode] [--copilot-cli] [--dry-run]
//   hivemind sync   [--agents a,b] [--repo …] [--url …] [--dir …] [--user <id>]
//   hivemind status [--repo …] [--url …] [--dir …]
//   hivemind teach "<rule>" [--scope repo/x|team/x]
//   hivemind rules  [--file path]
//   hivemind check  <file…> | --staged [--fix] [--deep]
// Every command takes --agent <kind> (else HIVEMIND_AGENT, else "cli") for x-hm-agent attribution.
// Precedence: flag > env (HIVEMIND_API_URL, HIVEMIND_TOKEN, HIVEMIND_USER, HIVEMIND_REPO) > .hivemind.json > defaults
// (URL: production; token: <hivemind>/.env.local).
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS, SKILL_FILE, byId, mcpWired } from "./agents.mjs";
import { cmdCheck } from "./check.mjs";
import { cmdOpen } from "./open.mjs";
import { USE_HINT, locateRepo } from "./locate.mjs";
import { NOT_IN_REPO, WHO_ARE_YOU, explicitUser, findRepoRoot, nativePath, resolveUser } from "./root.mjs";
import { liveRecent, readState, remember, setDefault } from "./state.mjs";
import { brand, handleChip, label, rich, scopeChip } from "./style.mjs";
import { card, chip, dot, padEnd, printHeader, rows, spin } from "./ui.mjs";
import { rulesFrontmatter } from "./templates.mjs";
import { END, START, api, banner, c, callerAgent, mcpCall, mergeJson, onPath, post, read, readEnvFile, rel, sym, table, plain, upsertBlock, write } from "./util.mjs";

const HM_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); // <hivemind>/cli/lib → <hivemind>
const CONFIG = ".hivemind.json";
const DEFAULT_URL = "https://hivemind-q17i.onrender.com";
const GENERIC = { id: "other", label: "Any MCP agent", rules: { file: "AGENTS.md" }, mcpFile: null };
const agentOf = (id) => byId[id] ?? (id === "other" ? GENERIC : null);

// ---------- args ----------
const BOOLEAN = new Set(["no-mouse", "invert-scroll", "dry-run", "no-sync", "no-vscode", "copilot-cli", "no-statusline", "personal", "help", "json", "staged", "fix", "deep", "version", "once", "snapshot", "notify", "no-motion", "claude", "auto", "open", "last", "clear"]);
function parseArgs(argv) {
  // `hivemind --open` / `hivemind --user ben`: flags with no subcommand → cmd "" (main decides: open or help).
  const [cmd = "", ...rest] = argv[0]?.startsWith("--") && !["--help", "--version"].includes(argv[0]) ? ["", ...argv] : argv;
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
  const root = nativePath(typeof flags.dir === "string" ? flags.dir : process.cwd()); // /c/… from Git Bash → C:…
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
  // --user → HIVEMIND_USER → .hivemind.json "user" → git user.email local part. No made-up default: commands that need
  // a person (teach, watch) refuse without one; read-only calls just omit x-hm-user.
  const actor = resolveUser(flags, saved, root) ?? "";
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
/** Locked rules in a pack: the API's `locked` count, else counted from the markdown ("LOCKED RULE ·" blocks or old "- 🔒" lines). */
const lockedCount = (pack) =>
  typeof pack.locked === "number" ? pack.locked : (pack.markdown?.match(/^(?:LOCKED RULE · |- 🔒)/gm) ?? []).length;

/** Make the Claude-flavoured pack agent-neutral: own header, drop the volatile "Live now" block. */
function shapePack(markdown, cfg) {
  const i = markdown.indexOf("\n## ");
  const bodyPart = i === -1 ? "" : markdown.slice(i);
  const withoutLive = bodyPart.replace(/\n## (?:⚠️ )?Live now\n[\s\S]*?(?=\n## |\n---\n|\nHivemind · |$)/, "");
  return (
    `<!-- Managed by \`hivemind sync\`. Edits inside this block are overwritten; propose changes in Hivemind instead. -->\n` +
    `# Hivemind · Team rules for #${cfg.repo}\n` +
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
    const locked = lockedCount(pack);
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
  const ctx = { ...cfg, hmRoot: HM_ROOT, hivemindDir, hivemindDirFlag: typeof cfg.flags["hivemind-dir"] === "string", sessionStartScript, skipVscode: !!cfg.flags["no-vscode"], copilotCli: !!cfg.flags["copilot-cli"], noStatusline: !!cfg.flags["no-statusline"] };

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

  console.log(`\n${c.bold("Setup")}`);
  const user = cfg.flags.user && typeof cfg.flags.user === "string" ? cfg.flags.user : "<you>";
  if (!cfg.token) console.log(`  ${sym.arrow} set ${c.cyan("HIVEMIND_TOKEN")} (ask your Hivemind admin)`);
  if (!process.env.HIVEMIND_USER || cfg.flags.user)
    console.log(`  ${sym.arrow} ${c.cyan(process.platform === "win32" ? `setx HIVEMIND_USER ${user}` : `export HIVEMIND_USER=${user}`)}`);
  console.log(`  ${sym.arrow} commit the files above, then run ${c.cyan("hivemind sync")} whenever rules change (or in CI)`);
  console.log(`  ${sym.arrow} ${c.cyan("hivemind status")} to check the connection`);
  console.log(`
${c.bold("Next:")} run ${c.cyan("hivemind watch")} in a split pane ${c.gray("(live rules, lessons and who else is editing)")}`);
}
const ids = (agents) => agents.map((a) => a.id);

// ---------- status ----------
async function cmdStatus(cfg) {
  const host = cfg.url.replace(/^https?:\/\//, "");
  await printHeader("status", `#${cfg.repo}${cfg.actor ? ` · @${cfg.actor}` : ""}`);
  console.log("");
  const items = [];
  let reachable = false;
  try {
    const qs = new URLSearchParams({ repo: cfg.repo, user: "team", log: "0" });
    const { data: pack, ms } = await spin("checking Hivemind", api(cfg, `/api/context-pack?${qs}`));
    reachable = true;
    const scopes = await api(cfg, "/api/scopes").then((r) => r.data.scopes ?? []).catch(() => []);
    const known = scopes.some((s) => s.id === cfg.repo);
    const chain = new URLSearchParams({ scope: known ? cfg.repo : "org", chain: "1" });
    const [active, pending] = await Promise.all(
      ["active", "pending"].map((s) => api(cfg, `/api/memories?${chain}&status=${s}`).then((r) => r.data.memories ?? []).catch(() => null)),
    );
    const locked = lockedCount(pack);
    items.push(
      { dot: "ok", key: "API", value: `${host}  ${c.faint(`${ms} ms`)}` },
      { dot: cfg.token ? "ok" : "bad", key: "Token", value: cfg.token ? "set" : c.rose("missing · set HIVEMIND_TOKEN") },
      { dot: null, key: "Repo", value: `${c.repo(`#${cfg.repo}`)}${known ? "" : c.faint("  not in Hivemind yet, showing org memory")}` },
      { dot: null, key: "Rules", value: `${pack.memoryIds.length} in the pack  ${c.faint(`${locked} locked · ~${pack.tokens} tokens`)}` },
      { dot: null, key: "Memories", value: active ? `${active.length} active` : c.faint("n/a") },
      {
        dot: pending?.length ? "warn" : pending ? "ok" : null,
        key: "Pending",
        value: pending ? (pending.length ? c.lesson(`${pending.length} awaiting review`) : "none") : c.faint("n/a"),
      },
    );
  } catch (e) {
    items.push({ dot: "bad", key: "API", value: `${host}  ${c.rose(e.message)}` }, { dot: cfg.token ? "ok" : "bad", key: "Token", value: cfg.token ? "set" : c.rose("missing") });
  }
  console.log(card(rows(items), { title: "Hivemind" }));

  const chosen = new Set(Array.isArray(cfg.saved.agents) ? cfg.saved.agents : detect(cfg.root, { usePath: false }).map((a) => a.id));
  const seg = (state, name) => `${dot(state)} ${c.faint(name)}`;
  const agentRows = [];
  for (const a of [...AGENTS, GENERIC]) {
    const rulesPath = a.rules ? join(cfg.root, a.rules.file) : null;
    const rulesText = rulesPath ? read(rulesPath) : null;
    const mcp = a.mcpFile ? mcpWired(cfg.root, a) : null;
    if (!chosen.has(a.id) && (a === GENERIC || (!mcp && !(rulesText ?? "").includes(START)))) continue;
    let rules;
    if (a.id === "claude-code") {
      const skill = read(join(cfg.root, ...SKILL_FILE.split("/"))) !== null;
      rules = c.faint(`rules live at session start${skill ? " · /hivemind skill" : ""}`);
    } else if (rulesText?.includes(START) && rulesText.includes(END)) {
      const age = Math.round((Date.now() - statSync(rulesPath).mtimeMs) / 60000);
      rules = `${c.faint(a.rules.file)} ${c.faint(age < 1 ? "· just now" : age < 60 ? `· ${age}m ago` : `· ${Math.round(age / 60)}h ago`)}`;
    } else rules = a.rules ? c.lesson(`${a.rules.file} not synced · run hivemind sync`) : c.faint("—");
    const userLevel = a.mcpFile?.includes(".hivemind.example");
    const mcpState = mcp === null ? "off" : !mcp ? "bad" : userLevel ? "warn" : "ok";
    const hooksText = a.hooksFile ? (read(join(cfg.root, a.hooksFile)) ?? "") : null;
    const hooksState = hooksText === null ? "off" : /\/api\/hooks\/|hooks\/adapters\//.test(hooksText) ? "ok" : "bad";
    agentRows.push({ dot: undefined, key: c.text(a.label), value: `${seg(mcpState, "mcp")}  ${seg(hooksState, "hooks")}   ${rules}` });
  }
  console.log(agentRows.length ? card(rows(agentRows), { title: "Agents" }) : `${sym.warn} No agents wired here yet. Run ${c.cyan("hivemind init")}.`);
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
  if (!cfg.actor) fail(WHO_ARE_YOU); // a lesson needs a person behind it
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
  // --dry-run: show what would be proposed and who'd review it. Nothing is posted (reads /api/scopes only).
  if (cfg.dryRun) {
    const scopes = await api(cfg, "/api/scopes").then((r) => r.data.scopes ?? []).catch(() => []);
    const target = scope ?? event.repo;
    const owner = ownerOf(target, scopes);
    console.log(`${label("waiting", "WOULD PROPOSE")}  ${c.gray("(dry run, nothing sent)")}`);
    console.log(`   ${c.gray(`"${plain(rule)}"`)} ${scopeChip(target)} ${c.gray(event.type === "correction" ? "as a correction" : "as a proposal")}`);
    console.log(`   ${c.gray("reviewed by")} ${handleChip(`@${owner ?? "a lead"}`)} ${c.gray("· checked against locked rules first")}`);
    return;
  }
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
    const meta = `${c.gray(`"${plain(m.title)}"`)} ${scopeChip(m.scopeId)} ${c.gray(m.status)}`;
    if (m.status === "blocked") {
      console.log(`${label("blocked")}  ${c.rose("by a locked rule")}${act?.note || m.blockedReason ? c.gray(` — ${plain(act?.note || m.blockedReason)}`) : ""}`);
    } else if (act?.action === "reinforced" || act?.action === "updated" || m.status === "active") {
      console.log(`${sym.ok} Already known — your correction was added as evidence${m.status === "pending" && owner ? ` (still waiting on @${owner})` : ""}`);
    } else {
      console.log(`${label("captured", "LESSON PROPOSED")}  waiting on ${handleChip(`@${owner ?? "a lead"}`)}`);
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
  // Same look as hivemind watch: kind labels in their colour, titles bold, provenance muted, @handles/#scopes rich.
  let title = false; // the line after "LOCKED RULE · #org" is that rule's title
  for (const raw of markdown.split("\n")) {
    const line = plain(raw);
    const head = line.match(/^(LOCKED RULE|TEAM RULE|TEAM LESSON)( · .*)?$/);
    if (head) {
      console.log(`${label(head[1] === "LOCKED RULE" ? "locked" : "lesson", head[1])}${c.gray(head[2] ?? "")}`);
      title = true;
    } else if (title && line.trim()) {
      console.log(c.bold(line));
      title = false;
    } else if (line.startsWith("#")) console.log(c.bold(line));
    else if (/^(Set by|Learned from|From) /.test(line)) console.log(c.gray(rich(line)));
    else if (raw.includes("🔒")) console.log(c.rose(line)); // older packs: colour carries "locked" once the glyph is gone
    else console.log(rich(line.replace(/\*\*(.+?)\*\*/g, (_, t) => c.bold(t))));
  }
}

// ---------- main ----------
// ---------- help / version (styled like the website hero) ----------
const VERSION = JSON.parse(read(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json")) ?? "{}").version ?? "0.0.0";
const SITE = "https://hivemind-q17i.onrender.com";

// L (launch): add `claude` / `setup-shortcut` rows to the "Start" group here; styling is shared.
const HELP_GROUPS = [
  [
    "Start",
    [
      ["hivemind", "", "open watch to the right of this terminal (same as hivemind open)"],
      ["init", "--agents a,b · --url <api>", "connect every coding agent in this repo"],
      ["use", "<path> · --clear", "the repo to use when you're outside one"],
      ["watch", "", "live team memory, full screen"],
    ],
  ],
  [
    "While you work",
    [
      ["check", "<file…> · --staged · --fix", "team-rule violations as code frames"],
      ["why", "--last · <rule> · <file>:<line>", "the history behind a rule or a block"],
      ["rules", "--file <path>", "the rules that apply here"],
      ["teach", '"<rule>" · --dry-run', "propose a lesson; a lead approves it"],
    ],
  ],
  [
    "Keep in sync",
    [
      ["status", "", "API, rules, pending lessons, wired agents"],
      ["sync", "--dry-run", "refresh rules files for agents without hooks"],
      ["update", "", "pull the latest CLI now (it also updates itself)"],
    ],
  ],
];

function help() {
  const all = HELP_GROUPS.flatMap(([, items]) => items);
  const nameW = Math.max(...all.map(([n]) => n.length));
  const descW = Math.max(...all.filter(([, a]) => a).map(([, , d]) => d.length)); // align args only where there are any
  const out = ["", `  ${brand()}  ${c.faint(`v${VERSION}`)}`, `  ${c.bold("Correct one agent.")} ${c.gray("Every agent learns.")}`];
  for (const [title, items] of HELP_GROUPS) {
    out.push("", `  ${c.faint(title)}`);
    for (const [name, args, desc] of items) out.push(`  ${chip(name, nameW)}  ${args ? `${padEnd(c.gray(desc), descW)}  ${c.faint(args)}` : c.gray(desc)}`);
  }
  const sep = c.faint(" · ");
  out.push(
    "",
    `  ${c.faint("Try")}    ${["hivemind", "hivemind check --staged", "hivemind why --last"].map((x) => c.cyan(x)).join(sep)}`,
    `  ${c.faint("Flags")}  ${c.faint(["--repo", "--user", "--agent", "--url", "--dir", "--dry-run", "--json"].join("  "))}`,
    `  ${c.faint("Env")}    ${c.faint("HIVEMIND_TOKEN  HIVEMIND_USER  HIVEMIND_REPO  HIVEMIND_API_URL  HIVEMIND_NO_UPDATE=1")}`,
    `  ${c.faint("Docs")}   ${c.link(SITE)}`,
    "",
  );
  return out.join("\n");
}

const parsed = parseArgs(process.argv.slice(2));
const { flags, positional } = parsed;
// Plain `hivemind` opens the side pane, like typing `claude` opens Claude: in a terminal (TTY), inside Windows Terminal
// (also from Claude Code's `!hivemind`, where stdout is a pipe), or with --open. Otherwise (piped, CI) it prints help.
const cmd = parsed.cmd || (flags.open || process.stdout.isTTY || process.env.WT_SESSION ? "open" : "help");
if (typeof flags.agent === "string") process.env.HIVEMIND_AGENT = flags.agent;
// watch / statusline live in cli/watch (the terminal app); they parse their own flags from argv too.
// watch / statusline only ever run on a real repo: the nearest .hivemind.json or git root above cwd (or --dir), never ~
// or a drive root, so the file watcher can't end up scanning a home directory.
const watchCmd = (file) => async (cfg) => {
  const quiet = file === "statusline.mjs"; // one line, refreshed every few seconds: no notes, no picker
  const found = await locateRepo({ dir: typeof cfg.flags.dir === "string" ? cfg.flags.dir : undefined, interactive: quiet ? false : undefined });
  if (!found) {
    if (quiet) return console.log(`${brand()} ${c.gray("· not in a Hivemind repo")}`);
    fail(`${NOT_IN_REPO}
  ${USE_HINT}`);
  }
  if (found.note && !quiet) console.log(found.note);
  const scoped = resolveConfig({ ...cfg.flags, dir: found.root });
  if (!scoped.actor && !quiet) fail(WHO_ARE_YOU);
  if (!quiet) remember({ path: found.root, repo: scoped.repo, user: explicitUser(cfg.flags) });
  return (await import(`../watch/${file}`)).run(process.argv.slice(3), scoped);
};
// `hivemind use [<path>]`: set the default repo for runs outside a repo, or list the recent ones.
async function cmdUse(cfg, positional) {
  const arg = positional.join(" ").trim();
  if (cfg.flags.clear) {
    setDefault(undefined);
    return console.log(`${brand()} ${c.gray("· use")}  default cleared; outside a repo Hivemind uses your most recent one`);
  }
  if (arg) {
    const found = findRepoRoot(nativePath(arg));
    if (!found) fail(`${arg} is not a Hivemind repo (no .hivemind.json or git root there). Run hivemind init in it first.`);
    const repo = repoIdOf(found);
    setDefault(found.root);
    remember({ path: found.root, repo, user: explicitUser(cfg.flags) });
    return console.log(`${brand()} ${c.gray("· use")}  default is now ${c.repo(`#${repo}`)} ${c.gray(`(${found.root})`)}`);
  }
  const st = readState();
  const recent = liveRecent();
  console.log(`${brand()} ${c.gray("· use")}  ${recent.length ? "recent repos" : "no repos yet; run hivemind in one, or hivemind use <path>"}`);
  for (const r of recent) {
    const isDefault = st.default && st.default.toLowerCase() === r.path.toLowerCase();
    console.log(`  ${isDefault ? c.lesson("●") : c.faint("○")} ${c.repo(`#${r.repo ?? "repo/?"}`)}  ${c.gray(r.path)}${r.user ? c.gray(` · @${r.user}`) : ""}${isDefault ? c.lesson("  default") : ""}`);
  }
  if (recent.length) console.log(c.faint(`  set the default: hivemind use <path> · clear it: hivemind use --clear`));
}
const repoIdOf = (found) => {
  const raw = String(found.saved?.repo || basename(found.root));
  return raw.includes("/") ? raw : `repo/${raw}`;
};
// `hivemind update`: check origin/main now and fast-forward this checkout if it's safe (same rules as the auto-update).
async function cmdUpdate() {
  const u = await import("./update.mjs");
  if (!u.isCheckout()) return console.log(`${brand()} ${c.gray("· update")}  this install isn't a git checkout; reinstall with ${c.cyan("npm i -g ./cli")} from your hivemind clone`);
  if (process.env.HIVEMIND_NO_UPDATE === "1") console.log(c.gray("HIVEMIND_NO_UPDATE=1 is set: auto-update is off, but you asked, so checking now"));
  const m = u.fetchAndMeasure();
  if (!m) fail("couldn't fetch origin/main (offline?). Details in ~/.hivemind/update.log");
  // Already current: one line, e.g. "⬢ Hivemind · up to date (6e34b43)".
  if (!m.behind) return console.log(`${brand()} ${c.gray("·")} up to date ${c.gray(`(${u.headSha()})`)}`);
  console.log(`${brand()} ${c.gray("· update")}  ${u.checkoutRoot}`);
  const r = u.fastForward({ verbose: true });
  if (!r) return;
  console.log(`  ${c.green("✓")} updated to ${c.bold(r.sha)} ${c.gray(`(${r.n} new commit${r.n === 1 ? "" : "s"})`)}`);
  for (const line of r.subjects.slice(0, 8)) console.log(`    ${c.gray(line.slice(0, 7))} ${line.slice(8, 100)}`);
  if (r.subjects.length > 8) console.log(c.gray(`    … and ${r.subjects.length - 8} more`));
  const cliFiles = r.files.filter((f) => f.startsWith("cli/"));
  console.log(c.gray(`  ${r.files.length} file${r.files.length === 1 ? "" : "s"} changed, ${cliFiles.length} in cli/${r.files.includes("cli/package.json") ? " (cli/package.json changed: pnpm install started)" : ""}`));
}
const commands = { update: cmdUpdate, use: cmdUse, watch: watchCmd("index.mjs"), statusline: watchCmd("statusline.mjs"), open: (cfg) => cmdOpen(cfg, fail), why: async (cfg, pos) => (await import("./why.mjs")).cmdWhy(cfg, pos, fail), init: cmdInit, sync: cmdSync, status: cmdStatus, teach: cmdTeach, rules: cmdRules, check: (cfg, pos) => cmdCheck(cfg, pos, fail) };
if (cmd === "--version" || cmd === "-v" || cmd === "version" || (flags.version && cmd !== "watch")) {
  console.log(`hivemind ${VERSION}`);
  process.exit(0);
}
if (!commands[cmd] || (flags.help && cmd !== "watch" && cmd !== "statusline")) {
  if (!["help", "--help", "-h"].includes(cmd) && !commands[cmd]) console.error(`${sym.fail} unknown command: ${cmd}`);
  console.log(help());
  process.exit(commands[cmd] || ["help", "--help", "-h"].includes(cmd) ? 0 : 1);
}
// status / why from outside a repo use the same fallback as `hivemind` (default → recent → search).
const FALLBACK = new Set(["status", "why"]);
let cfg0 = resolveConfig(flags);
if (FALLBACK.has(cmd) && typeof flags.dir !== "string" && !findRepoRoot(process.cwd())) {
  const found = await locateRepo();
  if (!found) fail(`${NOT_IN_REPO}
  ${USE_HINT}`);
  if (found.note && !flags.json) console.log(found.note);
  cfg0 = resolveConfig({ ...flags, dir: found.root });
}
// Remember every successful run inside a repo, so `hivemind` from anywhere knows where to go next time.
const NO_REMEMBER = new Set(["statusline", "use", "watch", "update"]); // watch remembers itself (it never returns while running)
commands[cmd](cfg0, positional)
  .then(() => {
    if (NO_REMEMBER.has(cmd) || cfg0.dryRun) return;
    const at = findRepoRoot(cfg0.root);
    if (at) remember({ path: at.root, repo: cfg0.repo, user: explicitUser(flags) });
  })
  .catch((e) => fail(e?.stack ?? e));
