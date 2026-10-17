// Feed (owner: H). Newest on top; each card eases in; collisions get an amber bar. STUB: replace freely, keep the contract.
export default {
  id: "feed",
  title: "Feed",
  keys: () => [],
  render(state, ctx) {
    const { theme: th, width: w, now } = ctx;
    const out = [""];
    const cards = state.cards.filter((c) => c.kind !== "edit" || now - Date.parse(c.at) < 10 * 60000);
    if (!cards.length) return ["", "  " + th.t.muted("No agents working right now."), "  " + th.t.faint("Corrections, approvals and collisions show up here as they happen.")];
    for (const c of cards) {
      const a = c.born ? th.ease((now - c.born) / 350) : 1;
      th.faded(a, () => {
        const bar = th.fg(th.labelColor(c.kind))("▌");
        const line = typeof c.line === "function" ? c.line(now) : c.line;
        const tool = c.agent ? th.badge(th.toolName(c.agent)) + " " : "";
        out.push(th.spread(` ${bar} ${th.label(c.kind)}`, `${tool}${th.t.faint(shortAgo(c.at, now))} `, w));
        out.push(th.clip(` ${bar} ${th.rich(th.plain(line))}`, w));
        if (c.meta) out.push(th.clip(` ${bar} ${th.t.muted(c.meta)}`, w));
        out.push("");
      });
      if (out.length > ctx.height) break;
    }
    return out;
  },
};

function shortAgo(iso, now) {
  const s = (now - Date.parse(iso)) / 1000;
  return s < 45 ? "now" : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
}
