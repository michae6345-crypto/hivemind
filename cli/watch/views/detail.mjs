// Rule detail (owner: I): provenance timeline for state.detail (a rule or memory id), over the current tab; esc closes. STUB.
import { provenance, quote } from "../data.mjs";

export default {
  id: "detail",
  title: "Rule",
  keys: () => [["esc", "back"]],
  render(state, ctx) {
    const { theme: th, width: w } = ctx;
    const m = state.memories.find((x) => x.id === state.detail);
    const r = state.rules.find((x) => x.id === state.detail);
    const locked = m?.locked ?? r?.locked;
    return [
      "",
      th.clip(`  ${th.t.faint("‹ back")}`, w),
      "",
      th.clip(`  ${th.label(locked ? "locked" : "lesson")}`, w),
      th.clip(`  ${th.bold(th.t.text(th.plain(m?.title ?? r?.title ?? state.detail)))}`, w),
      th.clip(`  ${th.t.muted(m ? provenance(m, ctx.now) : (r?.learnedFrom ?? ""))}`, w),
      "",
      th.clip(`  ${th.t.faint("│")} ${th.ital(th.t.muted(m ? quote(m) : (r?.summary ?? "")))}`, w),
    ];
  },
};
