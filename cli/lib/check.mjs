// `hivemind check <file…> | --staged [--fix]`: team-rule violations as rustc/miette-style code frames.
// POST /api/vscode/check (regex + Haiku pass, same engine as the VS Code squiggles). Lines from the API are 0-based.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { brand, handleChip, label, useColor } from "./style.mjs";
import { api, c, plain, post } from "./util.mjs";
import { recordFlag } from "./why.mjs";

// Code-frame headers are clickable `path#Lnn` links: agent K's watch/git.mjs linkFile() (GitHub blob permalink at HEAD,
// else the branch, else file://; OSC 8 when colour is on), so `check` and `watch` link the same way. Without watch/,
// a local file:// OSC 8 link with the same label.
let git = null;
try {
  git = await import("../watch/git.mjs");
} catch {
  /* watch/ not installed, or git.mjs not landed yet */
}
const linkable = process.env.FORCE_HYPERLINK === "1" || (useColor && !!process.stdout.isTTY && !process.env.NO_HYPERLINKS);
const osc8 = (url, text) => (linkable ? `\x1b]8;;${url}\x07${text}\x1b]8;;\x07` : text);

/** `demo/violations.ts#L13` (or `#L11-L13`), clickable. Lines are 1-based. */
function fileLink(abs, root, file, line, endLine) {
  const label = `${file}#L${line}${endLine > line ? `-L${endLine}` : ""}`;
  try {
    if (git?.linkFile) return git.linkFile(abs, line, endLine > line ? endLine : undefined, { root, label });
  } catch {
    /* not a git repo, no remote, … → local link below */
  }
  return osc8(`${pathToFileURL(abs).href}#L${line}`, c.link(label));
}

const CODE_EXT = /\.(m?[jt]sx?|cjs|cts|py|go|rb|java|kt|rs|sql|cs|php|swift|scala|sh)$/i;
const CONTEXT = 2;
const MAX_COLS = 110; // long lines are clipped so frames stay readable in a normal terminal
const clipLine = (s) => (s.length > MAX_COLS ? s.slice(0, MAX_COLS - 1) + "…" : s);
/** Same edit = same fix (the regex and LLM passes can both propose "add assertSingleCustomer(rows)"). */
// Inserts match on text alone: the two passes often put the same assert one line apart.
const fixKey = (f) => (f.kind === "insertBefore" ? `ins:${f.text.trim()}` : `rep:${f.line}:${f.endLine ?? ""}:${f.text.trim()}`);

// ---------- helpers ----------
const tone = (locked) => (locked ? c.rose : c.lesson); // rose = locked rule, blue = team lesson
const expand = (s) => s.replace(/\t/g, "  ");
const toPosix = (p) => p.replace(/\\/g, "/");

/** "@maya" from the rule's ownerId, else from the display name ("Maya Chen, Head of Security"). */
function handle(v, rule) {
  if (rule?.handle) return rule.handle;
  if (v.owner.startsWith("@")) return v.owner; // the API sends handles now; older servers sent "Maya Chen, Head of Security"
  const id = rule?.ownerId || v.owner.split(/[ ,]/)[0].toLowerCase();
  return `@${id.startsWith("agent") ? "agent" : id}`;
}
const ownerTitle = (v, rule) => (v.owner.includes(",") ? v.owner.split(",").slice(1).join(",").trim() : (rule?.ownerRole ?? ""));

/** Underline columns for line `i`: the API's exact columns (single-line hits), else our own heuristic. Tab-expanded. */
export function colsFor(v, i, line, rule) {
  if (v.startCol == null || v.startLine !== v.endLine) return span(line, rule);
  const at = (n) => expand(line.slice(0, n)).length;
  return [at(v.startCol), at(v.endCol ?? line.length)];
}

/** The LLM's one-line explanation, i.e. whatever follows the standard "…Locked by X, Role." / "…From X's lesson." wording. */
export function explanation(v) {
  const m = v.message.match(/(?:Locked by [^.]+\.|From [^.]+'s lesson\.)\s*(.*)$/);
  return plain(m?.[1]?.trim() || "");
}

/** [start, end) columns to underline on `line`: a rule symbol (console.log(…) through its paren), a declared name, or the code. */
function span(line, rule) {
  const text = expand(line);
  for (const sym of rule?.symbols ?? []) {
    const at = text.indexOf(sym);
    if (at < 0) continue;
    let end = at + sym.length;
    if (text[end] === "(") {
      let depth = 0;
      for (let i = end; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")" && --depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    return [at, end];
  }
  const decl = text.match(/\b(?:function\s+|(?:const|let|var)\s+|def\s+|class\s+)([A-Za-z_$][\w$]*)/);
  if (decl) {
    const at = decl.index + decl[0].length - decl[1].length;
    return [at, at + decl[1].length];
  }
  const start = text.search(/\S/);
  return start < 0 ? [0, 1] : [start, text.trimEnd().length];
}

// ---------- rendering ----------
function frame(file, lines, v, rule, loc) {
  const col = tone(v.locked);
  const first = Math.max(0, v.startLine - CONTEXT);
  const last = Math.min(lines.length - 1, v.endLine + CONTEXT);
  const fixLines = v.fix ? fixPreviewLines(lines, v.fix) : [];
  const width = String(Math.max(last + 1, ...fixLines.map((f) => f.n))).length;
  const gut = (n = "") => c.gray(`${String(n).padStart(width)} │`);
  const bar = c.gray(`${" ".repeat(width)} │`);
  const [sc] = colsFor(v, v.startLine, lines[v.startLine] ?? "", rule);

  const badge = label(v.locked ? "locked" : "lesson"); // "LOCKED RULE" / "TEAM LESSON", same as hivemind watch
  const out = [
    `${badge}  ${c.bold(plain(v.ruleTitle))}`,
    `${" ".repeat(width)} ${c.gray("╭─[")}${fileLink(loc.abs, loc.root, file, v.startLine + 1, v.endLine + 1)}${c.gray(`:${sc + 1}]`)}`,
    bar,
  ];
  const why = explanation(v) || (v.locked ? "breaks a locked rule" : "doesn't follow a team lesson");
  const multi = v.endLine > v.startLine;
  for (let i = first; i <= last; i++) {
    const text = clipLine(expand(lines[i] ?? ""));
    const hit = i >= v.startLine && i <= v.endLine;
    const num = hit ? col(String(i + 1).padStart(width)) + c.gray(" │") : gut(i + 1);
    if (multi) {
      // rustc-style bracket in the margin instead of underlining every line of a multi-line range
      const mark = !hit ? "  " : col(i === v.startLine ? "╭ " : "│ ");
      out.push(`${num} ${mark}${hit ? text : c.dim(text)}`);
      if (i === v.endLine) out.push(`${bar} ${col(`╰${"─".repeat(3)}~~~~`)} ${col(why)}`);
    } else {
      out.push(`${num} ${hit ? text : c.dim(text)}`);
      if (hit) {
        const [s, e] = colsFor(v, i, lines[i], rule);
        const end = Math.min(e, MAX_COLS);
        out.push(`${bar} ${" ".repeat(Math.min(s, MAX_COLS - 1))}${col("~".repeat(Math.max(1, end - s)))} ${col(why)}`);
      }
    }
  }
  out.push(bar);
  const title = ownerTitle(v, rule);
  out.push(`${" ".repeat(width)} ${c.gray("├─")} ${c.gray(v.locked ? "owner " : "taught")} ${handleChip(handle(v, rule))}${title ? c.gray(` · ${title}`) : ""}`);
  if (v.fix) {
    out.push(`${" ".repeat(width)} ${c.gray("╰─")} ${c.gray("fix   ")} ${c.green(v.fix.title.replace(/^Fix:\s*/i, ""))}`);
    for (const f of fixLines) out.push(`${c.gray(String(f.n).padStart(width) + " │")} ${f.sign === "+" ? c.green(`+ ${f.text}`) : c.red(`- ${f.text}`)}`);
  } else {
    out.push(`${" ".repeat(width)} ${c.gray("╰─")} ${c.gray("fix    no automatic fix; follow the rule above")}`);
  }
  return out.join("\n");
}

/** Diff-style preview of a quick fix (1-based line numbers). */
function fixPreviewLines(lines, fix) {
  const add = fix.text.split("\n").map((t, i) => ({ sign: "+", n: fix.line + 1 + i, text: expand(t) }));
  if (fix.kind === "insertBefore") return add;
  const end = fix.endLine ?? fix.line;
  const del = lines.slice(fix.line, end + 1).map((t, i) => ({ sign: "-", n: fix.line + 1 + i, text: expand(t) }));
  return [...del, ...add];
}

// ---------- fixes ----------
/** Apply quick fixes bottom-up so earlier line numbers stay valid; overlapping fixes after the first are skipped. */
export function applyFixes(text, fixes) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  // Later lines first; on the same line, replace before insert (insertBefore N doesn't touch line N's content).
  const order = [...fixes].sort((a, b) => b.line - a.line || (a.kind === "replaceLines" ? -1 : 1));
  const touched = [];
  let applied = 0;
  for (const f of order) {
    const end = f.kind === "replaceLines" ? (f.endLine ?? f.line) : f.line - 1;
    if (f.kind === "replaceLines" && touched.some(([s, e]) => f.line <= e && end >= s)) continue;
    const add = f.text.split(/\r?\n/);
    if (f.kind === "insertBefore") lines.splice(f.line, 0, ...add);
    else lines.splice(f.line, end - f.line + 1, ...add);
    if (f.kind === "replaceLines") touched.push([f.line, end]);
    applied++;
  }
  return { text: lines.join(eol), applied };
}

// ---------- inputs ----------
function stagedFiles(root) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const top = git("rev-parse", "--show-toplevel");
  return git("diff", "--cached", "--name-only", "--diff-filter=ACM")
    .split("\n")
    .filter(Boolean)
    .map((p) => ({ abs: resolve(top, p), staged: () => execFileSync("git", ["show", `:${p}`], { cwd: top, encoding: "utf8" }) }))
    .filter((f) => !relative(root, f.abs).startsWith(".."))
    .filter((f) => CODE_EXT.test(f.abs));
}

/**
 * Default: deterministic (regex) hits only, so the same file prints the same frames every run.
 * --deep also waits for the Haiku pass (the API answers pending:true first, then serves the full result from its cache).
 */
async function checkOne(cfg, file, text) {
  const ask = () => post(cfg, "/api/vscode/check", { repo: cfg.repo, file, text, fast: !cfg.flags.deep }, { timeout: 30000 });
  const [first, rules] = await Promise.all([
    ask(),
    api(cfg, `/api/vscode/rules?${new URLSearchParams({ repo: cfg.repo, file })}`).then((r) => r.data.rules ?? []).catch(() => []),
  ]);
  let res = first;
  for (let i = 0; cfg.flags.deep && res.pending && i < 4; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await ask();
  }
  const all = res.violations ?? [];
  return { violations: cfg.flags.deep ? all : all.filter((v) => v.source !== "llm"), rules: new Map(rules.map((r) => [r.id, r])) };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summary(totLocked, totLessons, fixable, nFiles, { fixHint }) {
  const dot = c.gray(" · ");
  if (!totLocked && !totLessons) return `${brand()}${dot}${c.green("no team-rule violations")} in ${plural(nFiles, "file")}`;
  const parts = [];
  if (totLocked) parts.push(c.rose(c.bold(`${plural(totLocked, "locked rule")} broken`)));
  if (totLessons) parts.push(c.lesson(plural(totLessons, "lesson")));
  if (fixHint && fixable) parts.push(c.gray(`run with ${c.cyan("--fix")} to apply ${plural(fixable, "quick fix", "quick fixes")}`));
  return [brand(), ...parts].join(dot);
}

// ---------- command ----------
export async function cmdCheck(cfg, positional, fail) {
  let targets;
  if (cfg.flags.staged) {
    try {
      targets = stagedFiles(cfg.root).map((f) => ({ abs: f.abs, read: f.staged }));
    } catch (e) {
      fail(`--staged needs a git repo: ${e.message.split("\n")[0]}`);
    }
    if (!targets.length) {
      console.log(`${brand()}${c.gray(" · ")}no staged code files to check`);
      return;
    }
  } else {
    if (!positional.length) fail("usage: hivemind check <file…> | --staged [--fix]");
    targets = positional.map((p) => {
      const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
      if (!existsSync(abs)) fail(`no such file: ${p}`);
      return { abs, read: () => readFileSync(abs, "utf8") };
    });
  }

  let locked = 0, lessons = 0, fixable = 0;
  const pendingFixes = [];
  for (const t of targets) {
    const file = toPosix(relative(cfg.root, t.abs)) || toPosix(t.abs);
    const text = t.read();
    const { violations, rules } = await checkOne(cfg, file, text).catch((e) => fail(`check failed for ${file}: ${e.message}`));
    const lines = text.split(/\r?\n/);
    for (const v of violations) {
      console.log(`\n${frame(file, lines, v, rules.get(v.ruleId), { abs: t.abs, root: cfg.root })}`);
      if (v.locked) locked++;
      else lessons++;
    }
    // Remember the most serious flag for `hivemind why --last`.
    const top = violations.find((v) => v.locked) ?? violations[0];
    if (top) recordFlag({ repo: cfg.repo, user: cfg.actor, file, line: top.startLine + 1, slug: top.ruleSlug, title: top.ruleTitle });
    const fixes = [...new Map(violations.filter((v) => v.fix).map((v) => [fixKey(v.fix), v.fix])).values()];
    fixable += fixes.length;
    if (fixes.length) pendingFixes.push({ file, abs: t.abs, text, fixes });
  }
  console.log(`\n${summary(locked, lessons, fixable, targets.length, { fixHint: !cfg.flags.fix })}`);

  if (cfg.flags.fix && pendingFixes.length) {
    let stillLocked = 0;
    for (const p of pendingFixes) {
      const onDisk = readFileSync(p.abs, "utf8");
      if (onDisk !== p.text) {
        console.log(`${c.yellow("!")} ${p.file}: working tree differs from the staged copy; skipped (fix it, then re-stage)`);
        continue;
      }
      const { text, applied } = applyFixes(p.text, p.fixes);
      if (!cfg.dryRun) writeFileSync(p.abs, text);
      console.log(`${c.green("✓")} applied ${plural(applied, "quick fix", "quick fixes")} to ${c.cyan(p.file)}${cfg.dryRun ? c.gray(" (dry run)") : ""}`);
      if (cfg.dryRun) continue;
      const after = await checkOne(cfg, p.file, text).catch(() => null);
      if (after) {
        const l = after.violations.filter((v) => v.locked).length;
        stillLocked += l;
        if (!after.violations.length) console.log(`  ${c.gray("re-check:")} ${c.green("✓ clean")}`);
        for (const v of after.violations) {
          const what = explanation(v) || v.ruleTitle;
          const who = handle(v, after.rules.get(v.ruleId));
          const icon = label(v.locked ? "locked" : "lesson");
          console.log(`  ${c.gray("re-check:")} ${icon} ${tone(v.locked)(`${p.file}:${v.startLine + 1}`)} ${what} ${c.gray(`— needs a human fix; ask ${handleChip(who)}`)}`);
        }
      }
    }
    if (cfg.flags.staged) console.log(c.gray(`  re-stage with ${c.cyan("git add")} to commit the fixes`));
    if (!cfg.dryRun) process.exitCode = stillLocked ? 1 : 0;
    return;
  }
  process.exitCode = locked ? 1 : 0; // locked-rule violations fail the run (pre-commit friendly); lessons only warn
}

