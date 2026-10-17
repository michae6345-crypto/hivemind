// Entry for `hivemind watch` (dispatched from cli/hivemind.mjs): run(argv, ctx), ctx = { url, repo, token, actor, root }.
import { cmdWatch } from "./app.mjs";

const BOOL = new Set(["once", "snapshot", "notify", "no-motion", "help"]);

export const HELP = `⬢ Hivemind · watch: the terminal app (run it in a split pane next to your agent)

Usage
  hivemind watch [--user <id>] [--role security|lead|engineer] [--dir <repo>] [--notify] [--no-motion]
  hivemind watch --snapshot [--view here|rules|queue|feed] [--file <path>] [--wait <ms>] [--cols 100] [--rows 36]

  --user       who you are (people id; default HIVEMIND_USER). Your role comes from Hivemind unless --role is given.
  --notify     OS notifications for: an edit breaks a locked rule, a collision, your lesson was approved
  --no-motion  no eases or animations (also HIVEMIND_REDUCED_MOTION=1; NO_COLOR implies it)
  --snapshot   render one frame to stdout and exit (no alt screen, no raw keys); --once is the same
  --file       snapshot: check this file first and show it in Here
  --wait       snapshot: watch --dir for <ms> first, then render (lets a file write + check settle)
  --record     append every frame (ANSI) to a file

Keys
  tab / ← → / 1-4  switch Here · Rules · Queue · Feed     j/k  move     enter  open     esc  back
  a / r            approve / reject the focused lesson (Queue; your role decides)
  t                teach (inline input; enter sends)    ?  rules for the file that last changed    q  quit`;
export function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split(/=(.*)/s);
    if (v !== undefined) flags[k] = v;
    else if (!BOOL.has(k) && argv[i + 1] && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
    else flags[k] = true;
  }
  return flags;
}

export async function run(argv, ctx) {
  const flags = { ...(ctx.flags ?? {}), ...parseFlags(argv) };
  if (flags.help) return console.log(HELP);
  if (flags["no-motion"]) process.env.HIVEMIND_REDUCED_MOTION = "1";
  return cmdWatch({ ...ctx, flags });
}
