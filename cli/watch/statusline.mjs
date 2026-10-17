// `hivemind statusline` for Claude Code's statusLine setting (owner: H). run(argv, ctx) prints one line.
// STUB: "⬢ Hivemind · 10 rules · 2 waiting" from GET /api/vscode/rules. H adds caching, the watch state file, "1 locked · 1 lesson".
import { HEX, P, fg, sep, t } from "./theme.mjs";
import { makeApi } from "./data.mjs";

export async function run(_argv, ctx) {
  if (!process.stdin.isTTY) for await (const _ of process.stdin); // Claude Code pipes session JSON; drain it
  try {
    const r = await makeApi(ctx, () => ({ role: "engineer" })).rules("");
    const waiting = r.pending?.count ?? 0;
    process.stdout.write(`${fg(P.lesson)(HEX)} ${t.text("Hivemind")}${sep()}${t.muted(`${r.rules.length} rules`)}${waiting ? sep() + t.lessonText(`${waiting} waiting`) : ""}\n`);
  } catch {
    process.stdout.write(`${t.faint(HEX)} ${t.faint("Hivemind · offline")}\n`);
  }
}
