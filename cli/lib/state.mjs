// ~/.hivemind/state.json: the repos you've used, so `hivemind` works from anywhere (home folder, Claude Code's `!`).
// { default?: "<path>", recent: [{ path, repo, user, lastUsed }] }, newest first, at most 10.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const STATE_DIR = join(homedir(), ".hivemind");
export const STATE_FILE = join(STATE_DIR, "state.json");
const MAX = 10;

export function readState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return { default: typeof s.default === "string" ? s.default : undefined, recent: Array.isArray(s.recent) ? s.recent : [] };
  } catch {
    return { recent: [] };
  }
}

function writeState(s) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
  } catch {
    /* read-only home: remembering is best effort */
  }
}

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** Record a successful run in a repo (moves it to the front). */
export function remember({ path, repo, user }) {
  if (!path) return;
  const s = readState();
  const prev = s.recent.find((r) => same(r.path, path));
  const entry = { path, repo: repo || prev?.repo, user: user || prev?.user || undefined, lastUsed: new Date().toISOString() };
  s.recent = [entry, ...s.recent.filter((r) => !same(r.path, path))].slice(0, MAX);
  writeState(s);
}

export function setDefault(path) {
  const s = readState();
  s.default = path || undefined;
  writeState(s);
}

/** Recent repos that still exist on disk, newest first. */
export function liveRecent() {
  return readState().recent.filter((r) => r.path && (existsSync(join(r.path, ".hivemind.json")) || existsSync(join(r.path, ".git"))));
}
