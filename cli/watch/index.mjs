// Entry for `hivemind watch` (dispatched from cli/hivemind.mjs): run(argv, ctx), ctx = { url, repo, token, actor, root }.
import { cmdWatch } from "./app.mjs";

const BOOL = new Set(["once", "notify", "no-motion", "help"]);
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
  if (flags["no-motion"]) process.env.HIVEMIND_REDUCED_MOTION = "1";
  return cmdWatch({ ...ctx, flags });
}
