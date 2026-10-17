#!/usr/bin/env node
// hivemind — persistent memory across your team's AI agents. Entry point.
// `hivemind` with no command (in a terminal, or anywhere inside Windows Terminal, e.g. Claude Code's `!hivemind`),
// `hivemind open` and `hivemind --open` take the instant path: no API calls, only lib/open.mjs is loaded, the pane is
// spawned and the pane (hivemind watch) fetches its own data. Every other command loads the full CLI (lib/main.mjs).
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const argv = process.argv.slice(2);
const first = argv[0] ?? "";
const noCommand = !first || (first.startsWith("--") && !["--help", "--version"].includes(first));
const wantsOpen =
  first === "open" || (noCommand && (argv.includes("--open") || (!argv.includes("--help") && (process.stdout.isTTY || !!process.env.WT_SESSION))));

if (wantsOpen) {
  const flags = {};
  const BOOL = new Set(["claude", "auto", "dry-run", "open"]);
  const rest = first === "open" ? argv.slice(1) : argv;
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) continue;
    const [k, v] = rest[i].slice(2).split(/=(.*)/s);
    if (v !== undefined) flags[k] = v;
    else if (!BOOL.has(k) && rest[i + 1] && !rest[i + 1].startsWith("--")) flags[k] = rest[++i];
    else flags[k] = true;
  }
  const root = resolve(typeof flags.dir === "string" ? flags.dir : process.cwd());
  let saved = {};
  try {
    saved = existsSync(`${root}/.hivemind.json`) ? JSON.parse(readFileSync(`${root}/.hivemind.json`, "utf8")) : {};
  } catch {
    /* ignore a broken .hivemind.json */
  }
  const raw = String(flags.repo || process.env.HIVEMIND_REPO || saved.repo || basename(root));
  const cfg = { root, flags, repo: raw.includes("/") ? raw : `repo/${raw}`, dryRun: !!flags["dry-run"] };
  const { cmdOpen } = await import("./lib/open.mjs");
  await cmdOpen(cfg, (msg) => {
    console.error(`✗ ${msg}`);
    process.exit(1);
  });
} else {
  await import("./lib/main.mjs");
}
