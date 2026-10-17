// File watching → POST /api/vscode/check → state.flags (owner: J). startWatcher({ root, cfg, state, api, actions, hooks }) → stop().
// STUB: recursive fs.watch, 400ms debounce, deterministic (regex) hits only. J adds the LLM pass, notify wiring, ignores.
import { readFileSync, statSync, watch } from "node:fs";
import { join } from "node:path";

const CODE = /\.(m?[jt]sx?|cjs|cts|py|go|rb|java|kt|rs|sql|cs|php|swift|scala|sh)$/i;
const SKIP = /(^|[\\/])(node_modules|\.git|\.next|dist|build|out|coverage)([\\/]|$)/;

export function startWatcher({ root, state, api, actions }) {
  const timers = new Map();
  let w;
  try {
    w = watch(root, { recursive: true }, (_ev, name) => {
      if (!name || SKIP.test(name) || !CODE.test(name)) return;
      const file = String(name).replace(/\\/g, "/");
      clearTimeout(timers.get(file));
      timers.set(file, setTimeout(() => check(file), 400));
    });
  } catch {
    return () => {};
  }
  async function check(file) {
    let text;
    try {
      if (!statSync(join(root, file)).isFile()) return;
      text = readFileSync(join(root, file), "utf8");
    } catch {
      return;
    }
    state.lastFile = file;
    state.files[file] = { text, at: Date.now(), checking: true };
    actions.render();
    try {
      const res = await api.check(file, text);
      state.flags[file] = (res.violations ?? []).filter((v) => v.source !== "llm");
    } catch (e) {
      actions.toast(actions.plainError(e), "locked");
    }
    state.files[file].checking = false;
    if (state.flags[file]?.length) actions.setTab("here");
    else actions.render();
  }
  return () => {
    w?.close();
    for (const t of timers.values()) clearTimeout(t);
  };
}
