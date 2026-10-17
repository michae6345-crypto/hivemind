import * as vscode from "vscode";
import { api } from "./api";
import { relPath, repoFor } from "./config";
import type { RulesResponse, VsRule } from "./types";

// Per-file cache of GET /api/vscode/rules. Refreshed on open/focus and every REFRESH_MS for the active file, so an
// approval in the web app shows up in the status bar / CodeLens within seconds.
const TTL_MS = 8000;

type Entry = { at: number; data: RulesResponse | null; inflight?: Promise<RulesResponse | null> };
const cache = new Map<string, Entry>();
const changed = new vscode.EventEmitter<void>();
export const onRulesChanged = changed.event;

const keyOf = (doc: vscode.TextDocument) => `${repoFor(doc.uri)}|${relPath(doc.uri)}`;

/** Cached rules for a document (may be stale/null); never blocks. */
export function peekRules(doc: vscode.TextDocument): RulesResponse | null {
  return cache.get(keyOf(doc))?.data ?? null;
}

export async function rulesFor(doc: vscode.TextDocument, force = false): Promise<RulesResponse | null> {
  const key = keyOf(doc);
  const hit = cache.get(key);
  if (hit?.inflight) return hit.inflight;
  if (hit && !force && Date.now() - hit.at < TTL_MS) return hit.data;
  const inflight = api.rules(repoFor(doc.uri), relPath(doc.uri)).then((data) => {
    const prev = cache.get(key)?.data;
    // keep the last good answer if the server blips
    cache.set(key, { at: Date.now(), data: data ?? prev ?? null });
    if (data && signature(data) !== (prev ? signature(prev) : "")) changed.fire();
    return data ?? prev ?? null;
  });
  cache.set(key, { at: hit?.at ?? 0, data: hit?.data ?? null, inflight });
  return inflight;
}

const signature = (r: RulesResponse) =>
  `${r.rules.map((x) => `${x.id}:${x.status}:${x.locked}:${x.taughtAt}`).join(",")}|${r.pending.count}|${r.approver?.id ?? ""}`;

export function clearRules() {
  cache.clear();
  changed.fire();
}

// ---------- relevance ----------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const symRe = new Map<string, RegExp>();
function symbolRegex(sym: string): RegExp {
  let re = symRe.get(sym);
  if (!re) {
    re = new RegExp(`(?<![\\w$.])${esc(sym)}(?![\\w$])`);
    symRe.set(sym, re);
  }
  return re;
}

/** Symbols of `rule` that occur in `text`. */
export function symbolsIn(rule: VsRule, text: string): string[] {
  return rule.symbols.filter((s) => s.length >= 3 && symbolRegex(s).test(text));
}
