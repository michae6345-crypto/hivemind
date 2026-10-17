// The status line's warm path. Claude Code runs `hivemind statusline` every few seconds and cancels a slow run, so a
// repeat run must not load the CLI. cli/hivemind.mjs calls serve() before anything else:
//   stdin (session_id, project dir) + env → a pointer file in tmp → watch/statusline.mjs's own cache file → print it.
// Fresh (< 10s) → print. Stale → print it anyway and start the same detached `statusline --refresh` the full path would.
// No pointer or no cache yet → false: the full path runs once (watch/statusline.mjs) and writes the pointer for next time.
// Only fs (+ child_process for a stale refresh): no crypto, repo lookup, git, theme or network. Every builtin counts here:
// node:crypto alone is ~5-8ms, node:child_process ~5ms.
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TTL_MS = 10_000; // same as watch/statusline.mjs
const LOCK_MS = 15_000;

const require = createRequire(import.meta.url);

/** FNV-1a, 2×32 bits: a stable file-name key without loading node:crypto. */
function fnv(s) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    a = Math.imul(a ^ ch, 0x01000193) >>> 0;
    b = Math.imul(b ^ ch, 0x01000193 + 2) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

/** Claude Code's status line JSON from stdin ({} when there is none within `ms`). */
export function readHookInput(ms = 150) {
  if (process.stdin.isTTY) return Promise.resolve({});
  return new Promise((done) => {
    let buf = "";
    const finish = () => {
      clearTimeout(timer);
      process.stdin.pause(); // never keep the process alive waiting on an open pipe
      try {
        done(JSON.parse(buf || "{}"));
      } catch {
        done({});
      }
    };
    const timer = setTimeout(finish, ms);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
  });
}

/** One pointer per (session, project dir, identity env, colour mode): exactly what changes the line. */
export function pointerPath(input) {
  const e = process.env;
  const root = input.workspace?.project_dir || input.workspace?.current_dir || input.cwd || process.cwd();
  const key = [input.session_id ?? "", root, e.HIVEMIND_USER, e.HIVEMIND_REPO, e.HIVEMIND_API_URL, e.NO_COLOR, e.FORCE_COLOR].join("|");
  return join(tmpdir(), `hivemind-fastline-${fnv(key)}.json`);
}

/** Print the cached line if there is one. Returns true when served. */
export function serve(input) {
  const ptr = readJson(pointerPath(input));
  const cached = ptr?.file ? readJson(ptr.file) : null;
  if (!cached?.line) return false;
  if (Date.now() - cached.at >= TTL_MS) {
    if (!Array.isArray(ptr.args)) return false;
    const lock = ptr.file + ".lock";
    try {
      if (!(existsSync(lock) && Date.now() - statSync(lock).mtimeMs < LOCK_MS)) {
        writeFileSync(lock, String(process.pid));
        require("node:child_process").spawn(process.execPath, ptr.args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
      }
    } catch {
      /* a refresh is best effort; the stale line still prints */
    }
  }
  process.stdout.write(cached.line + "\n");
  return true;
}
