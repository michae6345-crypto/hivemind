// Entry for `hivemind watch` (dispatched from cli/hivemind.mjs): run(argv, ctx), ctx = { url, repo, token, actor, root }.
import { cmdWatch } from "./app.mjs";
import { setReduced } from "./theme.mjs";

const BOOL = new Set(["once", "snapshot", "notify", "no-motion", "no-mouse", "invert-scroll", "help"]);

export const HELP = `⬢ Hivemind · watch: the terminal app (run it in a split pane next to your agent)

Usage
  hivemind watch [--user <id>] [--role security|lead|engineer] [--dir <repo>] [--notify] [--no-motion]
                 [--no-mouse] [--invert-scroll]
  hivemind watch --snapshot [--view here|rules|queue|feed] [--file <path>] [--wait <ms>] [--cols 100] [--rows 36]

  --user       who you are (people id; default HIVEMIND_USER). Your role comes from Hivemind unless --role is given.
  --notify     OS notifications for: an edit breaks a locked rule, a collision, your lesson was approved
  --no-motion  no eases or animations (also HIVEMIND_REDUCED_MOTION=1; NO_COLOR implies it)
  --no-mouse   keyboard only: no clicks or wheel (also HIVEMIND_NO_MOUSE=1)
  --invert-scroll  flip the wheel (also HIVEMIND_INVERT_SCROLL=1 or "invertScroll": true in ~/.hivemind/state.json;
               i toggles it live and remembers it). By default the wheel follows your OS natural/inverted setting.
  --snapshot   render one frame to stdout and exit (no alt screen, no raw keys); --once is the same
  --press      snapshot: keys to type first, e.g. --view feed --press w
  --file       snapshot: check this file first and show it in Here
  --wait       snapshot: watch --dir for <ms> first, then render (lets a file write + check settle)
  --record     append every frame (ANSI) to a file

Keys
  tab / ← → / 1-4  switch Here · Rules · Queue · Feed     j/k  move     enter  open     esc  back
  a / r            approve / reject the focused lesson (Queue; your role decides)
  t                teach (inline input; enter sends)    ?  rules for the file that last changed    q  quit
  w / e            why: the selected rule's full history     p  switch persona     i  invert scroll     h  help

Mouse (on unless --no-mouse)
  click a tab to switch · click a row to select it, click it again (or double-click) to open it · click a key hint
  in the footer to press it · click outside the teach box to close it · wheel / touchpad scrolls the list
  Shift + drag selects text to copy while the mouse is on (Windows Terminal, VS Code). The terminal is always put
  back on exit (q, Ctrl+C, a crash).`;
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
  if (flags["no-motion"]) {
    process.env.HIVEMIND_REDUCED_MOTION = "1";
    setReduced(true);
  }
  return cmdWatch({ ...ctx, flags });
}
