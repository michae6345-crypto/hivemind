// Rules (owner: I). Every rule in the repo's chain, locked first; `?` sets state.view.rules.file. STUB.
export default {
  id: "rules",
  title: "Rules",
  count: (state) => state.rules.length || null,
  keys: () => [["j/k", "move"], ["enter", "open"]],
  render(state, ctx) {
    const { theme: th, width: w } = ctx;
    const v = (state.view.rules ??= { index: 0 });
    const out = [v.file ? th.t.muted(`  Rules for ${v.file}`) : ""];
    state.rules.forEach((r, i) => {
      const bar = r.locked ? th.t.locked("│") : r.kind === "fact" ? " " : th.t.lesson("│");
      const title = i === v.index ? th.bold(th.t.text(r.title)) : th.t.text(r.title);
      out.push(th.clip(` ${bar} ${title}`, w));
      out.push(th.clip(` ${bar} ${th.scopeChip(r.scopeId)} ${th.handleChip(r.handle)}`, w));
    });
    return out;
  },
  onKey(key, state, ctx) {
    const v = (state.view.rules ??= { index: 0 });
    if (key.name === "j" || key.name === "down") return (v.index = Math.min(state.rules.length - 1, v.index + 1)), true;
    if (key.name === "k" || key.name === "up") return (v.index = Math.max(0, v.index - 1)), true;
    if (key.name === "return" && state.rules[v.index]) return ctx.actions.openDetail(state.rules[v.index].id), true;
    return false;
  },
};
