// GitHub permalinks for files and line ranges, rendered as clickable OSC 8 hyperlinks.
//   permalink("src/export.ts", 23, 25, { root })  → "https://github.com/<owner>/<repo>/blob/<sha>/demo/export-service/src/export.ts#L23-L25"
//   linkFile("src/export.ts", 23, { root })        → blue `demo/export-service/src/export.ts#L23`, clickable (plain text under NO_COLOR / a pipe)
// The ref is HEAD's sha when the file is committed, clean and HEAD is pushed (the link never drifts), else the
// remote branch name (upstream, or origin's default): the lines are only exact on your disk, but the link opens. No GitHub remote → a file:// URL. No git → null.
// Lines are 1-based. Everything is cached per repo for 5s; git is called synchronously but only with short commands.
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { COLOR, P, fg } from "./theme.mjs";

const TTL = 5000;
const repos = new Map(); // dir → { at, info }
const dirty = new Map(); // abs path → { at, dirty }

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();

/** "git@github.com:o/r.git" | "https://github.com/o/r(.git)" → "https://github.com/o/r" (null for other hosts). */
export function githubUrl(remote) {
  const m = String(remote ?? "").trim().match(/github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

/** { top, web, sha, branch } for the git repo containing `dir` (null outside git). */
export function repoInfo(dir = process.cwd()) {
  const hit = repos.get(dir);
  if (hit && Date.now() - hit.at < TTL) return hit.info;
  let info = null;
  try {
    const top = git(dir, "rev-parse", "--show-toplevel");
    let remote = "";
    try {
      remote = git(dir, "remote", "get-url", "origin");
    } catch {
      /* no origin */
    }
    const tryGit = (...args) => {
      try {
        return git(dir, ...args);
      } catch {
        return "";
      }
    };
    // The branch GitHub has: the upstream ("origin/main" → "main"), else origin's default, else the local name.
    const upstream = tryGit("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}").replace(/^[^/]+\//, "");
    const originHead = tryGit("symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
    const branch = upstream || originHead || tryGit("symbolic-ref", "--short", "HEAD");
    // HEAD's sha only if a remote branch already contains it (an unpushed sha 404s on GitHub).
    const head = tryGit("rev-parse", "HEAD");
    const pushed = head && tryGit("branch", "-r", "--contains", head) !== "";
    info = { top: resolve(top), web: githubUrl(remote), sha: pushed ? head : "", branch };
  } catch {
    info = null;
  }
  repos.set(dir, { at: Date.now(), info });
  return info;
}

function isDirty(info, abs) {
  const hit = dirty.get(abs);
  if (hit && Date.now() - hit.at < TTL) return hit.dirty;
  let d = true;
  try {
    // Untracked or modified (staged or not) → the committed blob doesn't have these lines.
    d = git(info.top, "status", "--porcelain", "--", relative(info.top, abs)) !== "";
  } catch {
    /* treat as dirty */
  }
  dirty.set(abs, { at: Date.now(), dirty: d });
  return d;
}

const anchor = (line, endLine) => (line ? `#L${line}${endLine && endLine !== line ? `-L${endLine}` : ""}` : "");

/**
 * Where `file` (relative to `root`, or absolute) lives: { url, path, label, line, endLine, ref }.
 * path = repo-relative ("demo/export-service/src/export.ts"); label = `${path}#L23`.
 */
export function permalinkInfo(file, line, endLine, { root = process.cwd() } = {}) {
  const abs = isAbsolute(file) ? file : resolve(root, file);
  const info = repoInfo(dirname(abs)) ?? repoInfo(root);
  const path = (info ? relative(info.top, abs) : relative(root, abs)).replace(/\\/g, "/");
  const label = `${path}${anchor(line, endLine)}`;
  if (!info) return { url: pathToFileURL(abs).href, path, label, line, endLine, ref: null };
  const ref = info.sha && !isDirty(info, abs) ? info.sha : info.branch || info.sha;
  const url = info.web && ref ? `${info.web}/blob/${ref}/${path.split("/").map(encodeURIComponent).join("/")}${anchor(line, endLine)}` : pathToFileURL(abs).href;
  return { url, path, label, line, endLine, ref };
}

/** The URL alone (null if the file can't be located). */
export const permalink = (file, line, endLine, opts) => permalinkInfo(file, line, endLine, opts)?.url ?? null;

/** OSC 8 hyperlink when colour is on (a TTY that isn't NO_COLOR); plain `text` otherwise. */
export const link = (url, text) => (COLOR && url ? `\x1b]8;;${url}\x07${text}\x1b]8;;\x07` : String(text));

/** Clickable blue `path#Lnn` (chrome text #91A7FF). */
export function linkFile(file, line, endLine, opts) {
  const p = permalinkInfo(file, line, endLine, opts);
  return link(p.url, fg(P.blueText)(opts?.label ?? p.label));
}
