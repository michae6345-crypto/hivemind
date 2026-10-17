// Which repo should this run use? `hivemind` must work from anywhere, including your home folder and Claude Code's `!`.
//   1. the repo above cwd (or --dir)                 → use it, and remember it
//   2. the default from `hivemind use <path>`        → use it, one note line
//   3. recent repos: exactly one, or not a TTY       → most recent, one note line
//                    several and a TTY            → numbered picker (↑/↓ or a number, Enter)
//   4. quick search (~1.5s) for .hivemind.json in likely folders → use the first, say where
//   5. nothing                                       → null (caller prints NOT_IN_REPO + `hivemind use <path>`)
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { findRepoRoot, nativePath } from "./root.mjs";
import { liveRecent, readState, remember } from "./state.mjs";
import { brand, t } from "./style.mjs";

const SKIP = new Set(["node_modules", ".git", ".next", "AppData", ".paseo", "dist", "build", ".cache", "$Recycle.Bin", "Library", ".Trash"]);
const BUDGET_MS = 1500;

/** BFS for folders holding .hivemind.json under `root`, up to `depth` levels, until `deadline`. */
function scan(root, depth, deadline, found) {
  let level = [root];
  for (let d = 0; d <= depth && level.length; d++) {
    const next = [];
    for (const dir of level) {
      if (Date.now() > deadline) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      if (entries.some((e) => e.isFile() && e.name === ".hivemind.json") && !found.some((f) => f.toLowerCase() === dir.toLowerCase())) found.push(dir);
      for (const e of entries) if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith("$")) next.push(join(dir, e.name));
    }
    level = next;
  }
}

export function searchRepos(cwd = process.cwd()) {
  const home = homedir();
  const deadline = Date.now() + BUDGET_MS;
  const found = [];
  for (const sub of ["coding-projects", "projects", "code", "src", "Documents"]) {
    const p = join(home, sub);
    if (existsSync(p)) scan(p, 5, deadline, found);
  }
  scan(nativePath(cwd), 4, deadline, found);
  return found;
}

const short = (p) => {
  const home = homedir();
  return p.toLowerCase().startsWith(home.toLowerCase()) ? `~${p.slice(home.length)}` : p;
};
function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}
const repoOf = (r) => r.repo || `repo/${basename(r.path)}`;

/** Numbered picker on the terminal. Resolves to an entry or null (Esc / q / ctrl-c). */
function pick(entries) {
  return new Promise((resolveP) => {
    const { stdin, stdout } = process;
    let sel = 0;
    const draw = (first) => {
      if (!first) stdout.write(`\x1b[${entries.length + 2}A`);
      stdout.write(`\x1b[2K${brand()} ${t.muted("· not in a repo here — pick one")}\n`);
      entries.forEach((r, i) => {
        const on = i === sel;
        const line = `${on ? t.lesson("›") : " "} ${t.faint(String(i + 1))}  ${(on ? t.bold : (s) => s)(t.repo(`#${repoOf(r)}`))}  ${t.muted(short(r.path))}  ${t.faint(ago(r.lastUsed))}`;
        stdout.write(`\x1b[2K  ${line}\n`);
      });
      stdout.write(`\x1b[2K  ${t.faint("↑/↓ or 1-9 · enter open · esc cancel")}\n`);
    };
    draw(true);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (v) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onKey);
      resolveP(v);
    };
    const onKey = (k) => {
      if (k === "\x1b[A" || k === "k") sel = (sel + entries.length - 1) % entries.length;
      else if (k === "\x1b[B" || k === "j") sel = (sel + 1) % entries.length;
      else if (/^[1-9]$/.test(k) && Number(k) <= entries.length) return done(entries[Number(k) - 1]);
      else if (k === "\r" || k === "\n") return done(entries[sel]);
      else if (k === "\x1b" || k === "q" || k === "\x03") return done(null);
      draw(false);
    };
    stdin.on("data", onKey);
  });
}

/**
 * { root, saved, note } for this run, or null. `note` is the one line to print when we fell back to a repo elsewhere
 * (callers that must stay silent, like statusline, just ignore it). `interactive` allows the picker.
 */
export async function locateRepo({ dir, interactive = process.stdin.isTTY && process.stdout.isTTY } = {}) {
  const here = findRepoRoot(dir ? nativePath(dir) : process.cwd());
  if (here) return { ...here, note: null };
  if (dir) return null; // an explicit --dir that isn't a repo is an error, not a cue to go elsewhere

  const used = (r, how) => {
    const found = findRepoRoot(r.path);
    if (!found) return null;
    const note = `${brand()} ${t.muted("·")} not in a repo here ${t.muted("—")} ${how} ${t.repo(`#${repoOf({ ...r, path: found.root, repo: found.saved?.repo ?? r.repo })}`)} ${t.muted(`(${found.root})`)}`;
    return { ...found, note };
  };

  const state = readState();
  const recent = liveRecent();
  if (state.default && findRepoRoot(state.default)) return used({ path: state.default, repo: recent.find((r) => r.path === state.default)?.repo }, "using");
  if (recent.length === 1 || (recent.length > 1 && !interactive)) return used(recent[0], "using");
  if (recent.length > 1) {
    const choice = await pick(recent.slice(0, 9));
    return choice ? used(choice, "using") : null;
  }

  const hits = searchRepos();
  if (!hits.length) return null;
  for (const h of hits.slice(0, 10).reverse()) {
    const f = findRepoRoot(h);
    if (f) remember({ path: f.root, repo: f.saved?.repo });
  }
  return used({ path: hits[0] }, `found ${hits.length > 1 ? `${hits.length} repos, using` : "and using"}`);
}

export const USE_HINT = "or point Hivemind at one: hivemind use <path>";
