// Queue (owner: I). Role-aware approvals: j/k move, a approve, r reject, enter opens. STUB: replace freely, keep the contract.
import { canApprove, ownerOf, provenance } from "../data.mjs";

const items = (state) => state.memories.filter((m) => m.status === "pending" || m.status === "blocked");

export default {
  id: "queue",
  title: "Queue",
  count: (state) => items(state).filter((m) => m.status === "pending").length || null,
  keys: (state) => (items(state).length ? [["j/k", "move"], ["a", "approve"], ["r", "reject"]] : []),
  render(state, ctx) {
    const { theme: th, width: w } = ctx;
    const list = items(state);
    const v = (state.view.queue ??= { index: 0 });
    v.index = Math.min(v.index, Math.max(0, list.length - 1));
    if (!list.length) return ["", "  " + th.t.muted("Nothing waiting."), "  " + th.t.faint("Every lesson has an owner's sign-off.")];
    const out = [""];
    list.forEach((m, i) => {
      const sel = i === v.index;
      const k = m.status === "blocked" ? "blocked" : canApprove(state.me, m, state.scopes) ? "you" : "waiting";
      const bar = th.fg(m.status === "blocked" ? th.P.locked : th.P.lesson)(sel ? "┃" : "│");
      const lbl = k === "waiting" ? th.label("waiting", `WAITING ON @${(ownerOf(m.scopeId, state.scopes) ?? "a lead").toUpperCase()}`) : th.label(k);
      out.push(th.clip(` ${bar} ${lbl}`, w));
      out.push(th.clip(` ${bar} ${sel ? th.bold(th.t.text(th.plain(m.title))) : th.t.text(th.plain(m.title))}`, w));
      out.push(th.clip(` ${bar} ${th.scopeChip(m.scopeId)} ${th.t.muted(provenance(m, ctx.now))}`, w));
      out.push("");
    });
    return out;
  },
  onKey(key, state, ctx) {
    const list = items(state);
    const v = (state.view.queue ??= { index: 0 });
    if (key.name === "j" || key.name === "down") return (v.index = Math.min(list.length - 1, v.index + 1)), true;
    if (key.name === "k" || key.name === "up") return (v.index = Math.max(0, v.index - 1)), true;
    const m = list[v.index];
    if (!m) return false;
    if (key.name === "a") return ctx.actions.approve(m), true;
    if (key.name === "r") return ctx.actions.reject(m), true;
    if (key.name === "return") return ctx.actions.openDetail(m.id), true;
    return false;
  },
};
