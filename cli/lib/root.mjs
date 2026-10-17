// Where am I, and who am I? Shared by `hivemind`/`open` (fast path), `watch` and `statusline`.
// Root: walk up from cwd to the nearest folder with .hivemind.json or a .git, never the home directory or a drive root
// (unless it has its own .hivemind.json). User: --user → HIVEMIND_USER → .hivemind.json "user" → git user.email local
// part. Never a made-up default.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, win32 } from "node:path";

/** Git Bash / MSYS paths (/c/Users/…) → C:\Users\… on Windows; everything else resolved as-is. */
export function nativePath(p) {
  const s = String(p ?? "");
  if (process.platform === "win32") {
    const m = s.match(/^\/([a-zA-Z])(\/.*)?$/);
    if (m) return win32.normalize(`${m[1].toUpperCase()}:${(m[2] ?? "/").replace(/\//g, "\\")}`);
    return win32.resolve(s || ".");
  }
  return resolve(s || ".");
}

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

/** { root, saved } for the repo containing `start`, or null when there is no Hivemind/git repo above it. */
export function findRepoRoot(start = process.cwd()) {
  const home = nativePath(homedir()).toLowerCase();
  let dir = nativePath(start);
  for (;;) {
    const cfgPath = resolve(dir, ".hivemind.json");
    if (existsSync(cfgPath)) return { root: dir, saved: readJson(cfgPath) ?? {} };
    const atHome = dir.toLowerCase() === home;
    const parent = dirname(dir);
    if (!atHome && parent !== dir && existsSync(resolve(dir, ".git"))) return { root: dir, saved: {} };
    if (atHome || parent === dir) return null; // never treat ~ or a drive root as a repo
    dir = parent;
  }
}

export const repoIdFor = (flags, saved, root) => {
  const raw = String(flags.repo || process.env.HIVEMIND_REPO || saved?.repo || basename(root));
  return raw.includes("/") ? raw : `repo/${raw}`;
};

/** People id for this shell, or null. Git fallback: "kevin@meridian.dev" → "kevin". */
export function resolveUser(flags = {}, saved = {}, root = process.cwd()) {
  const pick = (v) => (typeof v === "string" && v.trim() ? v.trim().replace(/^@/, "").toLowerCase() : null);
  const direct = pick(flags.user) ?? pick(process.env.HIVEMIND_USER) ?? pick(saved?.user) ?? pick(rememberedUser(root));
  if (direct) return direct;
  const email = gitEmailFromFiles(root) ?? gitEmailFromGit(root);
  return pick((email ?? "").split("@")[0].replace(/[^\w.-]/g, ""));
}

function gitEmailFromGit(root) {
  try {
    const r = spawnSync("git", ["config", "user.email"], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 3000 });
    return r.status === 0 ? r.stdout.trim() : null;
  } catch {
    return null;
  }
}

/**
 * user.email straight from the repo's and your git config files (no `git` spawn: that costs ~100ms on Windows, on every
 * launch and every status line refresh). undefined = can't tell from the files alone (includes, env overrides, no email
 * anywhere) → the caller asks git.
 */
function gitEmailFromFiles(root) {
  if (process.env.GIT_DIR || process.env.GIT_CONFIG_GLOBAL || process.env.GIT_CONFIG_SYSTEM || process.env.GIT_CONFIG_COUNT) return undefined;
  const read = (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return null;
    }
  };
  // The repo's .git may sit above root (a .hivemind.json in a subfolder). It is a folder, or (worktrees, submodules) a
  // file "gitdir: <path>" whose commondir holds the shared config.
  let top = nativePath(root);
  while (!existsSync(join(top, ".git")) && dirname(top) !== top) top = dirname(top);
  let gitDir = join(top, ".git");
  const pointer = read(gitDir);
  if (pointer !== null) {
    const m = pointer.match(/^gitdir:\s*(.+?)\s*$/m);
    if (!m) return undefined;
    gitDir = resolve(top, m[1]);
    const common = read(join(gitDir, "commondir"));
    if (common) gitDir = resolve(gitDir, common.trim());
  }
  const home = homedir();
  const xdg = process.env.XDG_CONFIG_HOME || join(home, ".config");
  // git's precedence: local, then global (~/.gitconfig, then XDG). System config rarely holds an email; git covers it.
  for (const p of [join(gitDir, "config"), join(home, ".gitconfig"), join(xdg, "git", "config")]) {
    const text = read(p);
    if (text === null) continue;
    if (/^\s*\[\s*include/im.test(text)) return undefined; // [include]/[includeIf] can override: let git decide
    let inUser = false;
    let email;
    for (const line of text.split(/\r?\n/)) {
      const sec = line.match(/^\s*\[\s*([^\]\s"]+)(\s+"[^"]*")?\s*\]/);
      if (sec) inUser = sec[1].toLowerCase() === "user" && !sec[2];
      const kv = inUser && line.match(/^\s*email\s*=\s*"?([^"#;]*?)"?\s*(?:[#;].*)?$/i);
      if (kv) email = kv[1].trim(); // last one wins, like git
    }
    if (email) return email;
  }
  return undefined;
}

/** The user you last ran this repo as (~/.hivemind/state.json), e.g. after `HIVEMIND_USER=kevin hivemind` there once. */
function rememberedUser(root) {
  try {
    const s = JSON.parse(readFileSync(join(homedir(), ".hivemind", "state.json"), "utf8"));
    return (s.recent ?? []).find((r) => String(r.path).toLowerCase() === String(root).toLowerCase())?.user ?? null;
  } catch {
    return null;
  }
}

/** Only users someone actually chose (--user / HIVEMIND_USER) are worth remembering; git-email guesses are not. */
export const explicitUser = (flags = {}) =>
  (typeof flags.user === "string" && flags.user.trim()) || (process.env.HIVEMIND_USER ?? "").trim() || undefined;

export const NOT_IN_REPO = "Not in a Hivemind repo — cd into one or run hivemind init";
export const WHO_ARE_YOU = "Who are you? Pass --user <id> or set HIVEMIND_USER (e.g. kevin, emily, ben, greg)";
