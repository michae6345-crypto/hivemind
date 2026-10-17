// `hivemind why [<rule slug | title words> | <file>:<line> | --last]`: one rule's history in ~12 lines, in watch's style.
// Who set or taught it (and the quote), who approved it, the evidence (PRs/incidents, linked), which agents get it,
// how often it was reinforced, and what it blocked. Read-only, existing routes only:
//   GET /api/memories (rule + evidence, blocked proposals) · GET /api/scopes (people) · GET /api/activity/live (feed)
//   GET /api/context-pack?log=0 (is it in today's pack) · POST /api/vscode/check (file:line)
// --last = the newest of: this user's latest blocked proposal (server) and the latest `hivemind check` flag (local).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { brand, handleChip, label, scopeChip, useColor } from "./style.mjs";
import { api, c, plain, post } from "./util.mjs";

const STATE = join(tmpdir(), "hivemind", "last-flag.json");
const AGENT = { "claude-code": "Claude Code", cursor: "Cursor", "gemini-cli": "Gemini CLI", copilot: "Copilot", codex: "Codex", windsurf: "Windsurf", "claude-ai": "Claude.ai" };

/** Called by `hivemind check`: remember the most serious flag so `why --last` can explain it. */
export function recordFlag({ repo, user, file, line, slug, title }) {
  try {
    mkdirSync(join(tmpdir(), "hivemind"), { recursive: true });
    writeFileSync(STATE, JSON.stringify({ repo, user, file, line, slug, title, at: new Date().toISOString() }));
  } catch {
    /* best effort */
  }
}

// ---------- formatting ----------
const linkable = process.env.FORCE_HYPERLINK === "1" || (useColor && !!process.stdout.isTTY && !process.env.NO_HYPERLINKS);
const link = (url, text) => (url && linkable ? `\x1b]8;;${url}\x07${text}\x1b]8;;\x07` : text);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
};
function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}
const clip = (s, n) => {
  const t = plain(String(s ?? "")).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
/** Evidence ref → a clickable label: owner/repo#123 → GitHub PR; explicit url wins. */
function refLink(e) {
  const ref = UUIDISH.test(e.ref ?? "") ? "" : (e.ref ?? "");
  const pr = ref.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
  const url = e.url || (pr ? `https://github.com/${pr[1]}/pull/${pr[2]}` : null);
  return ref ? link(url, c.link(ref)) : "";
}
const KIND = { correction: "corrected an agent", review_comment: "review comment", manual: "set it", agent: "agent proposal", fix: "applied the quick fix" };
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
/** People are @handles; agents and the bare CLI read as "an agent". */
const person = (id) => (!id || id === "cli" || id.startsWith("agent") ? c.gray("an agent") : handleChip(`@${id}`));

// ---------- finding the rule ----------
async function findByWords(cfg, words) {
  const q = words.join(" ").trim();
  const chain = new URLSearchParams({ scope: cfg.repo, chain: "1", status: "active,pending" });
  const [scoped, global] = await Promise.all([
    api(cfg, `/api/memories?${chain}&q=${encodeURIComponent(q)}`).then((r) => r.data.memories ?? []).catch(() => []),
    api(cfg, `/api/memories?q=${encodeURIComponent(q)}&status=active,pending`).then((r) => r.data.memories ?? []).catch(() => []),
  ]);
  const all = [...scoped, ...global.filter((m) => !scoped.some((s) => s.id === m.id))].filter((m) => m.kind !== "owner");
  const lq = q.toLowerCase();
  return all.find((m) => m.slug === lq || m.id === q) ?? all.find((m) => m.title.toLowerCase().includes(lq)) ?? all[0] ?? null;
}

/** "Contradicts @greg's locked rule \"Never mix …\"" / "Contradicts 🔒 [[sec-lab-isolation]] (…)" → slug or title words. */
function ruleRefFrom(reason = "") {
  return reason.match(/\[\[([^\]]+)\]\]/)?.[1] ?? reason.match(/"([^"]+)"/)?.[1] ?? null;
}

async function findLast(cfg) {
  const local = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;
  const mine = local && (!local.repo || local.repo === cfg.repo) ? local : null;
  const blocked = await api(cfg, "/api/memories?status=blocked").then((r) => r.data.memories ?? []).catch(() => []);
  const server =
    blocked
      .filter((m) => !cfg.actor || m.author === cfg.actor)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .find((m) => ruleRefFrom(m.blockedReason)) ?? null;
  const serverAt = server ? server.updatedAt : "";
  if (mine && (!server || mine.at > serverAt)) return { ref: mine.slug || mine.title, why: `flagged in ${mine.file}:${mine.line} ${ago(mine.at)}` };
  if (server) return { ref: ruleRefFrom(server.blockedReason), why: `blocked "${clip(server.title, 48)}" ${ago(server.updatedAt)}` };
  return null;
}

async function findAtLine(cfg, file, line) {
  const abs = resolve(cfg.root, file);
  if (!existsSync(abs)) return null;
  const rel = relative(cfg.root, abs).replace(/\\/g, "/");
  const res = await post(cfg, "/api/vscode/check", { repo: cfg.repo, file: rel, text: readFileSync(abs, "utf8") }, { timeout: 30000 });
  const hits = (res.violations ?? []).filter((v) => v.source !== "llm" && line - 1 >= v.startLine && line - 1 <= v.endLine);
  const v = hits.find((h) => h.locked) ?? hits[0];
  return v ? { ref: v.ruleSlug, why: `${rel}:${line}` } : null;
}

// ---------- command ----------
export async function cmdWhy(cfg, positional, fail) {
  const arg = positional.join(" ").trim();
  let target;
  if (!arg || cfg.flags.last) target = await findLast(cfg);
  else if (/^.+:\d+$/.test(arg) && existsSync(resolve(cfg.root, arg.replace(/:\d+$/, "")))) {
    const [, file, line] = arg.match(/^(.+):(\d+)$/);
    target = await findAtLine(cfg, file, Number(line));
    if (!target) fail(`no team rule flags ${arg}`);
  } else target = { ref: arg, why: null };
  if (!target) {
    // Not an error: nothing has been blocked or flagged for you yet.
    console.log(`${brand()} ${c.gray("· why")}  nothing to explain yet: no recent block or flag for you here. Try ${c.cyan("hivemind why <rule words>")}.`);
    return;
  }

  const rule = await findByWords(cfg, [target.ref]);
  if (!rule) fail(`no rule matches "${target.ref}"`);

  const packQs = new URLSearchParams({ repo: cfg.repo, user: cfg.actor || "team", log: "0" });
  const [people, live, blocked, pack] = await Promise.all([
    api(cfg, "/api/scopes").then((r) => new Map((r.data.people ?? []).map((p) => [p.id, p]))).catch(() => new Map()),
    api(cfg, "/api/activity/live").then((r) => r.data).catch(() => ({ feed: [], items: [] })),
    api(cfg, "/api/memories?status=blocked").then((r) => r.data.memories ?? []).catch(() => []),
    api(cfg, `/api/context-pack?${packQs}`).then((r) => r.data).catch(() => null),
  ]);
  const who = (id) => `${handleChip(`@${id}`)}${people.get(id)?.title ? c.gray(` · ${people.get(id).title}`) : ""}`;

  const ev = [...(rule.evidence ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const first = ev[0];
  const out = [];
  out.push(`${brand()} ${c.gray("· why")}${target.why ? c.gray(` · ${target.why}`) : ""}`);
  out.push(`${label(rule.locked ? "locked" : "lesson", rule.locked ? "LOCKED RULE" : rule.kind === "directive" ? "TEAM RULE" : "TEAM LESSON")}${c.gray(" · ")}${scopeChip(rule.scopeId)}`);
  out.push(c.bold(plain(rule.title)));
  const origin = rule.locked || rule.source === "human" ? "Set by" : rule.source === "review" ? "From a review by" : "Learned from";
  out.push(`${c.gray(origin)} ${who(first?.actor ?? rule.author)} ${c.gray(`· ${day(first?.at ?? rule.createdAt)}`)}${first?.ref ? ` ${c.gray("·")} ${refLink(first)}` : ""}`);
  if (first?.quote) out.push(`  "${clip(first.quote, 96)}"`);

  // Timeline: the rest of the evidence plus approvals from the feed, newest last, at most 4 lines.
  const approvals = (live.feed ?? []).filter((f) => f.memoryId === rule.id && f.type === "approval").map((f) => ({ at: f.at, actor: f.actor, type: "approval" }));
  const steps = [...ev.slice(1), ...approvals].sort((a, b) => a.at.localeCompare(b.at)).slice(-4);
  steps.forEach((e, i) => {
    const what =
      e.type === "approval" || /^approved/i.test(e.quote ?? "")
        ? c.green("approved it")
        : `${c.gray(KIND[e.type] ?? e.type)}${e.quote && e.type !== "fix" && !/^[-+] /.test(e.quote) ? ` ${c.gray(`"${clip(e.quote, 54)}"`)}` : ""}`;
    out.push(`  ${c.faint(i === steps.length - 1 ? "╰" : "├")} ${c.faint(day(e.at).padEnd(6))} ${person(e.actor)} ${what}${refLink(e) ? ` ${refLink(e)}` : ""}`);
  });

  // Reach: in today's pack → every agent wired to this repo gets it at session start.
  const inPack = !!pack?.memoryIds?.includes(rule.id);
  const agents = [...new Set([...(live.feed ?? []), ...(live.items ?? [])].filter((f) => f.agent && f.agent !== "other" && (!f.repo || cfg.repo.endsWith(f.repo))).map((f) => AGENT[f.agent] ?? f.agent))];
  out.push(
    `${c.gray("In context")} ${inPack ? `every agent in ${scopeChip(cfg.repo)} at session start` : c.gray(`not in ${cfg.repo}'s pack (ranked out or out of scope)`)}${inPack && agents.length ? c.gray(` · seen today: ${agents.join(", ")}`) : ""}`,
  );

  // Strength and blocks.
  const blocks = blocked.filter((m) => {
    const r = m.blockedReason ?? "";
    return r.includes(`[[${rule.slug}]]`) || r.includes(`"${plain(rule.title)}"`);
  });
  const reinforced = Math.max(0, Math.round(rule.alpha - 1));
  const conf = rule.locked ? "always applies" : `confidence ${Math.round((rule.alpha / (rule.alpha + rule.beta)) * 100)}%`;
  out.push(`${c.gray("Reinforced")} ${reinforced}× ${c.gray(`· ${ev.length} evidence · ${conf}`)}${blocks.length ? ` ${c.gray("·")} ${c.rose(`blocked ${blocks.length} proposal${blocks.length === 1 ? "" : "s"}`)}` : ""}`);
  const lastBlock = blocks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (lastBlock) out.push(`  ${c.faint("╰")} ${c.gray(`latest: "${clip(lastBlock.title, 60)}" from`)} ${person(lastBlock.author)} ${c.gray(ago(lastBlock.updatedAt))}`);

  const owner = rule.locked ? (first?.actor ?? rule.author) : rule.author;
  out.push(`${c.gray(rule.locked ? "Only" : "Owner")} ${handleChip(`@${owner}`)} ${c.gray(rule.locked ? "can change this rule" : "can update it; corrections reinforce it")} ${c.gray("·")} ${link(`${cfg.url}/app`, c.link("open in Hivemind"))}`);
  console.log(out.join("\n"));
}
