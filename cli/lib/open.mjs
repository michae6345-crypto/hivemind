// `hivemind open [--claude] [--user <id>] [--size 0.45] [--dry-run] [--auto]`: open `hivemind watch` next to this terminal.
//   Windows Terminal (WT_SESSION set) → split THIS window: `wt -w 0 split-pane -V --size 0.45 -d <cwd> --title Hivemind …`
//   Windows, other terminal          → a new Windows Terminal window (or `start powershell` without wt)
//   macOS                            → iTerm2 vertical split, else a new Terminal.app window (osascript)
//   Linux                            → tmux split-window -h when inside tmux
// --claude also runs `claude` in the left pane (this terminal), unless we're already inside Claude Code.
// --auto is the SessionStart-hook mode: silent, no-op unless HIVEMIND_AUTOOPEN=1, once per Claude Code session.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nativePath } from "./root.mjs";
import { brand } from "./style.mjs";
import { c, onPath } from "./util.mjs";

// Instant path: nothing here may call the API or spawn helper processes before the pane opens.

const CLI = fileURLToPath(new URL("../hivemind.mjs", import.meta.url));
/** wt.exe is an app-execution alias (a 0-byte reparse point existsSync can't see), so ask `where`. */
let wtCache;
function hasWt() {
  if (wtCache !== undefined) return wtCache;
  if (process.env.WT_SESSION) return (wtCache = true); // we're in Windows Terminal, so wt is there
  try {
    // App-execution aliases are invisible to stat but show up in a directory listing.
    wtCache = readdirSync(join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WindowsApps")).includes("wt.exe") || onPath("wt");
  } catch {
    wtCache = onPath("wt");
  }
  return wtCache;
}
/** Plain `node` when its folder is on PATH (no quoting of "Program Files" inside the wt command line). */
const nodeBin = () => ((process.env.PATH ?? "").split(delimiter).some((d) => d && d.toLowerCase() === dirname(process.execPath).toLowerCase()) ? "node" : process.execPath);
const insideClaude = () => !!process.env.CLAUDECODE || !!process.env.CLAUDE_CODE_ENTRYPOINT;

/** argv for the watch pane. `node <cli>` works whether or not `hivemind` is installed globally (no .cmd shim issues). */
// The pane gets this shell's repo and user explicitly: Windows Terminal starts new panes from its own environment, so
// an `$env:HIVEMIND_USER` set only in this shell wouldn't reach it otherwise. Same folder via -d and --dir.
function watchArgv(cfg, user) {
  return [
    nodeBin(),
    CLI.replace(/\\/g, "/"),
    "watch",
    "--dir",
    nativePath(cfg.root),
    "--repo",
    cfg.repo,
    ...(user ? ["--user", user] : []),
    ...(cfg.flags.url || process.env.HIVEMIND_API_URL ? ["--url", String(cfg.flags.url || process.env.HIVEMIND_API_URL)] : []),
  ];
}

/**
 * `wt -w 0` means "the most recently used window", which is not always the one you're typing in (other windows may have
 * had focus since). Bring this pane's own window to the front first: GetConsoleWindow() inside Windows Terminal is a
 * pseudo-window owned by the real one. Best effort; ~0.3s.
 */
function focusOwnWindow() {
  const ps = [
    "$s='[DllImport(\"kernel32.dll\")]public static extern IntPtr GetConsoleWindow();",
    "[DllImport(\"user32.dll\")]public static extern IntPtr GetAncestor(IntPtr h,uint f);",
    "[DllImport(\"user32.dll\")]public static extern bool SetForegroundWindow(IntPtr h);",
    "[DllImport(\"user32.dll\")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);';",
    "Add-Type -MemberDefinition $s -Name W -Namespace HM;",
    "$h=[HM.W]::GetAncestor([HM.W]::GetConsoleWindow(),3);",
    "if($h -ne [IntPtr]::Zero){[HM.W]::keybd_event(0x12,0,0,[UIntPtr]::Zero);[HM.W]::keybd_event(0x12,0,2,[UIntPtr]::Zero);[void][HM.W]::SetForegroundWindow($h)}",
  ].join("");
  // No windowsHide: the child must share this console so GetConsoleWindow() resolves to our pane.
  spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "ignore", timeout: 4000 });
}

const q = (s) => (/[\s"']/.test(s) ? `"${String(s).replace(/"/g, '\\"')}"` : String(s));
const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** Pick the launcher for this OS/terminal. Returns { how, cmd, args, then? } (then = run claude here afterwards). */
export function plan(cfg, { claude, user, size, cwd }) {
  const watch = watchArgv(cfg, user);
  const wantClaude = claude && !insideClaude();
  if (process.platform === "win32") {
    const split = ["split-pane", "-V", "--size", String(size), "-d", cwd, "--title", "Hivemind", ...watch];
    if (process.env.WT_SESSION && hasWt()) {
      // Same window, Hivemind on the right; claude (if asked) takes over this pane once the split is open.
      return { how: "Windows Terminal: split this window", cmd: "wt", args: ["-w", "0", ...split], then: wantClaude ? "claude" : null };
    }
    if (hasWt()) {
      const left = wantClaude ? ["-d", cwd, "--title", "Claude Code", "cmd", "/k", "claude", ";"] : ["-d", cwd, "--title", "Hivemind", ...watch];
      return { how: "new Windows Terminal window", cmd: "wt", args: ["-w", "new", ...left, ...(wantClaude ? split : [])], then: null };
    }
    const ps = `Set-Location ${q(cwd)}; & ${watch.map(q).join(" ")}`;
    return { how: "new PowerShell window", cmd: "cmd", args: ["/c", "start", '"Hivemind"', "powershell", "-NoExit", "-Command", ps], then: wantClaude ? "claude" : null };
  }
  const line = `cd ${sh(cwd)} && ${watch.map(sh).join(" ")}`;
  if (process.platform === "darwin") {
    const as = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script =
      process.env.TERM_PROGRAM === "iTerm.app"
        ? `tell application "iTerm2" to tell current session of current window to split vertically with default profile command "/bin/zsh -lc \\"${as(line)}\\""`
        : `tell application "Terminal" to do script "${as(line)}"`;
    return { how: process.env.TERM_PROGRAM === "iTerm.app" ? "iTerm2: split this window" : "new Terminal.app window", cmd: "osascript", args: ["-e", script], then: wantClaude ? "claude" : null };
  }
  if (process.env.TMUX) {
    return { how: "tmux: split this window", cmd: "tmux", args: ["split-window", "-h", "-l", `${Math.round(size * 100)}%`, "-c", cwd, line], then: wantClaude ? "claude" : null };
  }
  return { how: null, line };
}

/** SessionStart --auto: once per Claude Code session (or terminal pane), never twice. */
function autoMarker(sessionId) {
  const dir = join(tmpdir(), "hivemind-open");
  const key = String(sessionId || process.env.WT_SESSION || process.env.TMUX_PANE || "").replace(/[^\w.-]/g, "_");
  if (!key) return null;
  mkdirSync(dir, { recursive: true });
  return join(dir, key);
}

async function readHookInput() {
  if (process.stdin.isTTY) return {};
  let raw = "";
  process.stdin.setEncoding("utf8");
  const timer = new Promise((r) => setTimeout(r, 300, ""));
  const all = (async () => {
    for await (const chunk of process.stdin) raw += chunk;
    return raw;
  })();
  try {
    return JSON.parse((await Promise.race([all, timer])) || raw || "{}");
  } catch {
    return {};
  }
}

export async function cmdOpen(cfg, fail) {
  const auto = !!cfg.flags.auto;
  if (auto && process.env.HIVEMIND_AUTOOPEN !== "1") return; // off by default; hook output must stay empty
  const user = (typeof cfg.flags.user === "string" && cfg.flags.user) || process.env.HIVEMIND_USER || "";
  const size = Math.min(0.8, Math.max(0.2, Number(cfg.flags.size) || 0.45));
  const p = plan(cfg, { claude: !!cfg.flags.claude, user, size, cwd: nativePath(cfg.root) }); // wt -d needs C:…, never /c/…

  if (auto) {
    const input = await readHookInput();
    const marker = autoMarker(input.session_id);
    if (!marker || existsSync(marker) || !p.how) return;
    writeFileSync(marker, new Date().toISOString());
    spawn(p.cmd, p.args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return; // silent: SessionStart stdout becomes model context
  }

  if (!p.how) {
    console.log(`${brand()} ${c.gray("· open")}  no supported terminal to split here. Run this in a second pane:`);
    console.log(`  ${c.cyan(p.line)}`);
    return;
  }
  const where = p.how.includes("split") ? "on the right" : `in a ${p.how}`;
  const done = `${brand()} ${c.gray("opened")} ${where} ${c.gray("·")} watching ${c.repo(`#${cfg.repo}`)} as ${c.handle(`@${user || "you"}`)}`;
  if (cfg.flags["dry-run"] || cfg.dryRun) {
    console.log(`${brand()} ${c.gray(`· open (dry run) · ${p.how}`)}`);
    console.log(`  ${c.cyan([p.cmd, ...p.args].map(q).join(" "))}`);
    if (p.then) console.log(`  ${c.cyan(p.then)} ${c.gray("(in this pane)")}`);
    return;
  }
  // Opt-in: only needed when another window took focus since you typed (scripted runs). Costs a PowerShell start.
  if (p.cmd === "wt" && p.args[1] === "0" && process.env.HIVEMIND_OPEN_FOCUS === "1") focusOwnWindow();
  const r = spawnSync(p.cmd, p.args, { stdio: "inherit", windowsHide: false });
  if (r.error || r.status) fail(`couldn't open the pane: ${r.error?.message ?? `${p.cmd} exited ${r.status}`}`);
  console.log(done + (p.then ? c.gray(" · starting claude here") : ""));
  if (p.then) {
    // This pane becomes Claude Code. shell:true so Windows finds claude.cmd.
    const child = spawn(p.then, [], { stdio: "inherit", shell: true, cwd: cfg.root });
    await new Promise((res) => child.on("exit", res));
  }
}
