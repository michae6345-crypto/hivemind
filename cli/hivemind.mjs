#!/usr/bin/env node
// hivemind — persistent memory across your team's AI agents. Entry point (also installed as `hm`).
// Startup is the product here, so this file only loads what the command needs:
//   --version                    → package.json, nothing else
//   statusline (warm)            → lib/fastline.mjs serves the cached line: no CLI, no git, no network
//   (no command) / open / claude / c
//                                → the instant path: no API calls, only lib/open.mjs (+ root/locate) is loaded, the pane
//                                  is spawned and the pane (hivemind watch) fetches its own data. `claude` also runs
//                                  Claude Code in this pane.
//   everything else              → the full CLI (lib/main.mjs)
import module from "node:module";

// V8 bytecode cache for every module below (Node ≥22.1; a no-op elsewhere). Roughly halves module load on a warm start.
try {
  module.enableCompileCache?.();
} catch {
  /* read-only tmp: run uncached */
}

const argv = process.argv.slice(2);
const first = argv[0] ?? "";

// Keep a checkout-linked install current without `git pull` (lib/update.mjs). Never blocks: a background fetch, and a
// fast-forward only when that fetch already found new commits. Silent where output must stay clean.
if (first !== "update") {
  const quiet = first === "statusline" || argv.includes("--json") || argv.includes("--auto");
  (await import("./lib/update.mjs")).autoUpdate({ quiet });
}

const LAUNCH = { open: {}, claude: { claude: true }, c: { claude: true } };
const noCommand = !first || (first.startsWith("--") && !["--help", "--version"].includes(first));
const wantsOpen =
  !argv.includes("--help") &&
  (Object.hasOwn(LAUNCH, first) || (noCommand && (argv.includes("--open") || process.stdout.isTTY || !!process.env.WT_SESSION)));

if (["--version", "-v", "version"].includes(first)) {
  const { readFileSync } = await import("node:fs");
  console.log(`hivemind ${JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version}`);
} else if (first === "statusline" && argv.length === 1 && (await statusline())) {
  // served from the cache
} else if (wantsOpen) {
  const flags = { ...(LAUNCH[first] ?? {}) };
  const BOOL = new Set(["claude", "auto", "dry-run", "open"]);
  const rest = Object.hasOwn(LAUNCH, first) ? argv.slice(1) : argv;
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) continue;
    const [k, v] = rest[i].slice(2).split(/=(.*)/s);
    if (v !== undefined) flags[k] = v;
    else if (!BOOL.has(k) && rest[i + 1] && !rest[i + 1].startsWith("--")) flags[k] = rest[++i];
    else flags[k] = true;
  }
  const [{ NOT_IN_REPO, WHO_ARE_YOU, explicitUser, repoIdFor, resolveUser }, { USE_HINT, locateRepo }, { cmdOpen }] = await Promise.all([
    import("./lib/root.mjs"),
    import("./lib/locate.mjs"),
    import("./lib/open.mjs"),
  ]);
  const fail = (msg) => {
    console.error(`✗ ${msg}`);
    process.exit(1);
  };
  // The pane must watch THIS repo as THIS user: find the repo above cwd (never ~), resolve the user, pass both explicitly.
  // Outside a repo (home folder, `!hivemind` in Claude Code), fall back to the default / recent / found repo.
  const found = await locateRepo({ dir: typeof flags.dir === "string" ? flags.dir : undefined });
  if (!found) fail(`${NOT_IN_REPO}
  ${USE_HINT}`);
  if (found.note) console.log(found.note);
  const user = resolveUser(flags, found.saved, found.root);
  if (!user) fail(WHO_ARE_YOU);
  const cfg = { root: found.root, flags: { ...flags, user }, repo: repoIdFor(flags, found.saved, found.root), dryRun: !!flags["dry-run"] };
  // Remember before launching: with --claude this process lives as long as the Claude session.
  if (!cfg.dryRun) (await import("./lib/state.mjs")).remember({ path: found.root, repo: cfg.repo, user: explicitUser(flags) });
  await cmdOpen(cfg, fail);
} else {
  await import("./lib/main.mjs");
}

/** Warm status line: print the cached line and stop. Cold: hand the stdin we read to the full path (watch/statusline). */
async function statusline() {
  const fast = await import("./lib/fastline.mjs");
  const input = await fast.readHookInput();
  if (fast.serve(input)) return true;
  globalThis.hivemindHookInput = input; // stdin is consumed; watch/statusline.mjs reads it from here
  process.env.HIVEMIND_FASTLINE = fast.pointerPath(input); // …and writes the pointer the next run will use
  return false;
}
