#!/usr/bin/env node
// hivemind — persistent memory across your team's AI agents. Entry point.
// `hivemind` with no command (in a terminal, or anywhere inside Windows Terminal, e.g. Claude Code's `!hivemind`),
// `hivemind open` and `hivemind --open` take the instant path: no API calls, only lib/open.mjs is loaded, the pane is
// spawned and the pane (hivemind watch) fetches its own data. Every other command loads the full CLI (lib/main.mjs).

const argv = process.argv.slice(2);

// Keep a checkout-linked install current without `git pull` (lib/update.mjs). Never blocks: a background fetch, and a
// fast-forward only when that fetch already found new commits. Silent where output must stay clean.
if (argv[0] !== "update") {
  const quiet = argv[0] === "statusline" || argv.includes("--json") || argv.includes("--auto");
  (await import("./lib/update.mjs")).autoUpdate({ quiet });
}
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
  const { NOT_IN_REPO, WHO_ARE_YOU, explicitUser, repoIdFor, resolveUser } = await import("./lib/root.mjs");
  const fail = (msg) => {
    console.error(`✗ ${msg}`);
    process.exit(1);
  };
  // The pane must watch THIS repo as THIS user: find the repo above cwd (never ~), resolve the user, pass both explicitly.
  // Outside a repo (home folder, `!hivemind` in Claude Code), fall back to the default / recent / found repo.
  const { USE_HINT, locateRepo } = await import("./lib/locate.mjs");
  const found = await locateRepo({ dir: typeof flags.dir === "string" ? flags.dir : undefined });
  if (!found) fail(`${NOT_IN_REPO}
  ${USE_HINT}`);
  if (found.note) console.log(found.note);
  const user = resolveUser(flags, found.saved, found.root);
  if (!user) fail(WHO_ARE_YOU);
  const cfg = { root: found.root, flags: { ...flags, user }, repo: repoIdFor(flags, found.saved, found.root), dryRun: !!flags["dry-run"] };
  const { cmdOpen } = await import("./lib/open.mjs");
  await cmdOpen(cfg, fail);
  if (!cfg.dryRun) (await import("./lib/state.mjs")).remember({ path: found.root, repo: cfg.repo, user: explicitUser(flags) });
} else {
  await import("./lib/main.mjs");
}
