// Here (owner: J): the file that last changed and its violations as code frames (the terminal editor highlight). STUB.
import { codeFrame } from "../frame.mjs";

export default {
  id: "here",
  title: "Here",
  count: (state) => Object.values(state.flags).flat().length || null,
  keys: () => [],
  render(state, ctx) {
    const { theme: th, width: w } = ctx;
    const file = state.lastFile;
    if (!file) return ["", "  " + th.t.muted("No changes yet."), "  " + th.t.faint("Edit a file (or let an agent) and team-rule hits pop up here.")];
    const vs = state.flags[file] ?? [];
    const f = state.files[file];
    const out = ["", th.clip(`  ${th.t.blueText(file)}${th.sep()}${th.t.faint(f?.checking ? "checking" : "checked")}`, w), ""];
    if (!vs.length) return [...out, "  " + th.t.ok("No team rules broken here.")];
    const lines = (f?.text ?? "").split(/\r?\n/);
    for (const v of vs) out.push(...codeFrame(file, lines, v, state.rules.find((r) => r.id === v.ruleId), w - 2).map((l) => "  " + l), "");
    return out;
  },
};
