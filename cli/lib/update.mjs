// Self-update for a `hivemind` that runs from a git checkout (npm i -g ./cli links to it), so nobody has to `git pull`.
//   every launch:  if the last check is > 15 min old, spawn a DETACHED `git fetch origin main` (lock file, never waits)
//   next launch:   if that fetch found new commits on origin/main, fast-forward the checkout, then print one quiet line
// Safety: only on branch main, only fast-forward (never merges, rebases, stashes or commits), and never when an
// incoming commit touches a file you have uncommitted edits in (your demo/playground edits stay exactly as they are).
// Anything unexpected → skip silently and append to ~/.hivemind/update.log. HIVEMIND_NO_UPDATE=1 turns all of it off.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// node:child_process only when git actually runs (~5ms otherwise spent on every launch, status line included).
const require = createRequire(import.meta.url);
const spawn = (...a) => require("node:child_process").spawn(...a);
const spawnSync = (...a) => require("node:child_process").spawnSync(...a);

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url))); // <checkout>/cli/lib → <checkout>
const DIR = join(homedir(), ".hivemind");
const STATE = join(DIR, "state.json");
const LOCK = join(DIR, "update.lock");
const LOG = join(DIR, "update.log");
const EVERY_MS = 15 * 60 * 1000;
const LOCK_STALE_MS = 2 * 60 * 1000;

const git = (args, opts = {}) => spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8", windowsHide: true, timeout: 60000, ...opts });
const out = (args) => {
  const r = git(args);
  return r.status === 0 ? r.stdout.trim() : null;
};

function log(msg) {
  try {
    mkdirSync(DIR, { recursive: true });
    appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* best effort */
  }
}
function readState() {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
}
/** Merge into state.update without clobbering the rest (recent repos, default). */
function saveUpdate(patch) {
  try {
    mkdirSync(DIR, { recursive: true });
    const s = readState();
    s.update = { ...(s.update ?? {}), ...patch };
    writeFileSync(STATE, JSON.stringify(s, null, 2) + "\n");
  } catch {
    /* best effort */
  }
}

export const isCheckout = () => existsSync(join(ROOT, ".git"));
export const disabled = () => process.env.HIVEMIND_NO_UPDATE === "1" || !!process.env.CI || !isCheckout();
export const checkoutRoot = ROOT;
export const headSha = () => out(["rev-parse", "--short", "HEAD"]) ?? "?";

/** Fetch origin/main and record how far behind/ahead this checkout is. Used by the background child and `hivemind update`. */
export function fetchAndMeasure() {
  const f = git(["fetch", "origin", "main", "--quiet"]);
  if (f.status !== 0) {
    log(`fetch failed (offline?): ${(f.stderr || "").trim().split("\n")[0]}`);
    saveUpdate({ fetchedAt: new Date().toISOString(), behind: 0, error: "fetch failed" });
    return null;
  }
  const behind = Number(out(["rev-list", "--count", "HEAD..origin/main"]) ?? 0);
  const ahead = Number(out(["rev-list", "--count", "origin/main..HEAD"]) ?? 0);
  saveUpdate({ fetchedAt: new Date().toISOString(), behind, ahead, error: null });
  return { behind, ahead };
}

/** Fast-forward to origin/main if it's safe. Returns { sha, n, files, subjects } on success, else null (reason logged). */
export function fastForward({ verbose = false } = {}) {
  const skip = (logged, shown) => {
    if (logged) log(`skip: ${logged}`);
    if (verbose) console.log(`  ${shown}`);
    return null;
  };
  const branch = out(["rev-parse", "--abbrev-ref", "HEAD"]);
  // Clear `behind` on every skip, so the next launch doesn't spawn git again until the next background fetch.
  if (branch !== "main") saveUpdate({ behind: 0 });
  if (branch !== "main") return skip(`checkout is on ${branch}, not main`, `skipped: this checkout is on ${branch}, not main`);
  const behind = Number(out(["rev-list", "--count", "HEAD..origin/main"]) ?? 0);
  const ahead = Number(out(["rev-list", "--count", "origin/main..HEAD"]) ?? 0);
  saveUpdate({ behind: 0 });
  if (!behind) return skip(null, "already up to date");
  if (ahead) return skip(`diverged (${ahead} local commits not on origin/main)`, `skipped: ${ahead} local commit(s) not on origin/main`);

  // Never touch uncommitted work: refuse if an incoming commit changes a file that's dirty here.
  const incoming = (out(["diff", "--name-only", "HEAD", "origin/main"]) ?? "").split("\n").filter(Boolean);
  // Raw stdout, not out(): trimming would eat the leading space of " M path" and shift the path by one character.
  const st = git(["status", "--porcelain", "--untracked-files=all"]);
  const dirty = (st.status === 0 ? st.stdout : "")
    .split(/\r?\n/)
    .filter((l) => l.length > 3)
    .map((l) => l.slice(3).replace(/^"|"$/g, "").split(" -> ").pop());
  const clash = incoming.filter((f) => dirty.includes(f));
  if (clash.length) return skip(`local edits overlap incoming changes: ${clash.slice(0, 5).join(", ")}`, `skipped: you have local edits in ${clash.slice(0, 3).join(", ")}, which the update changes`);

  const subjects = (out(["log", "--format=%h %s", "HEAD..origin/main"]) ?? "").split("\n").filter(Boolean);
  const m = git(["merge", "--ff-only", "--quiet", "origin/main"]);
  if (m.status !== 0) return skip(`fast-forward failed: ${(m.stderr || "").trim().split("\n")[0]}`, "skipped: git couldn't fast-forward (see ~/.hivemind/update.log)");

  const sha = out(["rev-parse", "--short", "HEAD"]);
  log(`updated to ${sha} (${behind} commits)`);
  if (incoming.includes("cli/package.json")) {
    // The CLI has no deps, so this is rare; never wait for it.
    const child = spawn("pnpm", ["install"], { cwd: ROOT, env: { ...process.env, CI: "true" }, detached: true, stdio: "ignore", windowsHide: true, shell: true });
    child.on("error", (e) => log(`pnpm install failed to start: ${e.message}`));
    child.unref();
    log("cli/package.json changed: started CI=true pnpm install");
  }
  return { sha, n: behind, files: incoming, subjects };
}

/** Called first thing on every launch. Must stay cheap: a state read, at most one detached spawn. */
export function autoUpdate({ quiet = false } = {}) {
  if (disabled()) return;
  const st = readState().update ?? {};
  // 1. A background fetch found commits → fast-forward now (the only synchronous git work, and only when needed).
  if (st.behind > 0) {
    const r = fastForward();
    if (r && !quiet) {
      const hex = process.env.NO_COLOR || process.env.FORCE_COLOR === "0" || !process.stderr.isTTY ? "⬢" : "\x1b[38;5;214m⬢\x1b[39m";
      process.stderr.write(`${hex} Hivemind · updated to ${r.sha} (${r.n} new commit${r.n === 1 ? "" : "s"})\n`);
    }
  }
  // 2. Time for a check? Spawn a detached fetch and move on.
  const last = Date.parse(st.lastCheck ?? 0) || 0;
  if (Date.now() - last < EVERY_MS) return;
  try {
    if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs < LOCK_STALE_MS) return;
    mkdirSync(DIR, { recursive: true });
    writeFileSync(LOCK, String(process.pid));
  } catch {
    return;
  }
  saveUpdate({ lastCheck: new Date().toISOString() });
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--background-fetch"], { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => rmSync(LOCK, { force: true }));
  child.unref();
}

// Background child: `node update.mjs --background-fetch`
if (process.argv[2] === "--background-fetch") {
  try {
    fetchAndMeasure();
  } finally {
    rmSync(LOCK, { force: true });
  }
}
