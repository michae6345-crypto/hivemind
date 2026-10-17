#!/usr/bin/env node
// Startup benchmark for the hivemind CLI. Headless: no terminal windows (open/claude run with --dry-run).
//   node scripts/bench-cli.mjs [--runs 5] [--only version,statusline] [--base <ref>] [--json out.json]
// Each command runs in a temp copy of demo/export-service with a throwaway HOME and TMP, so ~/.hivemind state, the
// statusline cache and Node's compile cache never touch yours.
//   cold = a fresh HOME + TMP for every run (no state, no caches, no compile cache)
//   warm = one shared HOME + TMP, one discarded priming run, then N timed runs
// Network: every run talks to scripts/mock-api.mjs on 127.0.0.1 (80ms latency, like prod), never to a real server.
// --base <ref> also benchmarks the CLI at that git ref (e.g. origin/main), interleaved run by run with this checkout so
// machine load hits both equally. The "node -e 0" row is the floor: Node's own startup on this machine.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i === -1 ? d : process.argv[i + 1];
};
const RUNS = Number(arg("runs", 5));
const ONLY = arg("only", "")?.split(",").filter(Boolean);
const BASE = arg("base");

// The local mock API (a separate process: spawnSync below blocks this event loop).
const mock = spawn(process.execPath, [join(ROOT, "scripts", "mock-api.mjs"), "--latency", arg("latency", "80")], { stdio: ["ignore", "pipe", "inherit"] });
const API = await new Promise((ok, no) => {
  mock.stdout.on("data", (d) => {
    const m = String(d).match(/listening (http:\/\/127\.0\.0\.1:\d+)/);
    if (m) ok(m[1]);
  });
  mock.on("exit", () => no(new Error("mock-api exited")));
});
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(API)) throw new Error(`refusing to benchmark against ${API}`);

const work = mkdtempSync(join(tmpdir(), "hm-bench-"));
const repo = join(work, "export-service");
cpSync(join(ROOT, "demo", "export-service"), repo, { recursive: true });
spawnSync("git", ["init", "-q"], { cwd: repo });

const clis = [{ name: "now", entry: join(ROOT, "cli", "hivemind.mjs") }];
if (BASE) {
  // A copy of <ref>'s cli/ next to an .env.local copy, so it resolves the token the same way.
  const base = join(work, "base");
  const files = spawnSync("git", ["-C", ROOT, "ls-tree", "-r", "--name-only", BASE, "cli"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
  if (!files.length) throw new Error(`no cli/ at ${BASE}`);
  for (const f of files) {
    mkdirSync(dirname(join(base, f)), { recursive: true });
    writeFileSync(join(base, f), spawnSync("git", ["-C", ROOT, "show", `${BASE}:${f}`], { maxBuffer: 1 << 26 }).stdout);
  }
  try {
    cpSync(join(ROOT, ".env.local"), join(base, ".env.local"));
  } catch {
    /* no dev token: both runs read HIVEMIND_TOKEN from env */
  }
  clis.unshift({ name: BASE, entry: join(base, "cli", "hivemind.mjs") });
}

const hookInput = JSON.stringify({ session_id: "bench", cwd: repo, workspace: { current_dir: repo, project_dir: repo } });
const COMMANDS = [
  { id: "node -e 0", node: ["-e", "0"] },
  { id: "--version", args: ["--version"] },
  { id: "status", args: ["status"] },
  { id: "open --dry-run", args: ["open", "--dry-run"] },
  { id: "claude --dry-run", args: ["claude", "--dry-run"] },
  { id: "watch --snapshot", args: ["watch", "--snapshot", "--cols", "100", "--rows", "30"] },
  { id: "statusline", args: ["statusline"], input: hookInput },
].filter((c) => !ONLY?.length || c.node || ONLY.some((o) => c.id.replace(/^--/, "").startsWith(o)));

function freshEnv() {
  const home = mkdtempSync(join(work, "home-"));
  const tmp = join(home, "tmp");
  mkdirSync(tmp, { recursive: true });
  // No HIVEMIND_USER: resolving the user from git config is part of a real launch.
  const env = { ...process.env, HOME: home, USERPROFILE: home, TMP: tmp, TEMP: tmp, TMPDIR: tmp, HIVEMIND_NO_UPDATE: "1", NO_COLOR: "1", HIVEMIND_API_URL: API };
  for (const k of ["WT_SESSION", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "TMUX", "NODE_COMPILE_CACHE", "HIVEMIND_USER", "HIVEMIND_FASTLINE"]) delete env[k];
  // The temp HOME has no ~/.gitconfig: give the repo its own email (like a real clone of a teammate's machine).
  spawnSync("git", ["config", "user.email", "kevin@meridian.dev"], { cwd: repo });
  return env;
}

function once(cmd, cli, env) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, cmd.node ?? [cli.entry, ...cmd.args], { cwd: repo, env, input: cmd.input ?? "", encoding: "utf8", timeout: 30000 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, ok: r.status === 0, out: (r.stdout + r.stderr).trim().split("\n")[0]?.slice(0, 80) };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const results = [];
for (const cmd of COMMANDS) {
  const targets = cmd.node ? [clis[clis.length - 1]] : clis;
  const cold = new Map(targets.map((c) => [c.name, []]));
  const warm = new Map(targets.map((c) => [c.name, []]));
  const warmEnv = new Map(targets.map((c) => [c.name, freshEnv()]));
  const sample = new Map();
  for (const c of targets) sample.set(c.name, once(cmd, c, warmEnv.get(c.name))); // prime the warm env
  for (let i = 0; i < RUNS; i++) {
    for (const c of targets) {
      cold.get(c.name).push(once(cmd, c, freshEnv()));
      warm.get(c.name).push(once(cmd, c, warmEnv.get(c.name)));
    }
  }
  for (const c of targets) {
    const all = [...cold.get(c.name), ...warm.get(c.name)];
    const row = {
      cmd: cmd.id,
      cli: cmd.node ? "-" : c.name,
      cold: median(cold.get(c.name).map((r) => r.ms)),
      warm: median(warm.get(c.name).map((r) => r.ms)),
      ok: all.every((r) => r.ok),
      sample: sample.get(c.name).out,
    };
    results.push(row);
    const f = (ms) => `${ms.toFixed(0).padStart(5)} ms`;
    console.log(`${row.cmd.padEnd(17)} ${row.cli.padEnd(11)} cold ${f(row.cold)}   warm ${f(row.warm)}   ${row.ok ? "" : "FAILED "}${row.sample ?? ""}`);
  }
}
const out = arg("json");
if (out) writeFileSync(out, JSON.stringify({ node: process.version, runs: RUNS, results }, null, 2));
const served = await fetch(`${API}/__count`).then((r) => r.text());
console.log(`(all API calls went to the local mock at ${API}: ${served} requests)`);
mock.kill();
rmSync(work, { recursive: true, force: true });
