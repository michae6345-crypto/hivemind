import * as path from "path";
import * as vscode from "vscode";
import { api } from "../api";
import { isCodeDoc, relPath } from "../config";
import { anchorOf, checkDoc, fixEdit, onViolationsChanged, showLocal, violationsFor } from "../diagnostics";
import { log } from "../log";
import { peekRules, rulesFor } from "../rules";
import type { Violation, VsRule } from "../types";
import { fire } from "./events";
import { localCheck } from "./local";
import { hmToast } from "./toast";
import { agentBreakText, at, TOOL } from "./words";

// Change detection for the buddy (pattern after Error Lens: per-document debounce, repaint from one diagnostics source):
// - typing: the server's detectors run locally ~300ms after you stop (diagnostics.ts asks the server at 600ms);
// - agent writes: an open file reloaded from disk (Claude Code, Cursor, Codex… wrote it) or a watched file changing on
//   disk → check now, tell decorations which lines the agent wrote (shaped-by notes), and if the write broke a locked
//   rule, the one toast: `Claude Code's edit breaks a locked rule: … Locked by @maya.` [Fix it] [Show rule].

const LOCAL_DEBOUNCE_MS = 300;
const SHAPED_DELAY_MS = 150; // the spec's "fade in"
const AGENT_WINDOW_MS = 20000; // violations landing this long after an agent write count as the agent's
const WATCH_GLOB = "**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rb,java,rs,cs,php,kt,swift}";
const WATCH_SKIP = /[\\/](node_modules|\.git|out|dist|build|\.next|coverage)[\\/]/;

const linesOf = (text: string) => text.split("\n").map((s) => s.replace(/\r$/, ""));
const key = (v: Violation) => `${v.ruleSlug}:${anchorOf(v) ?? v.startLine}`;

// ---------- local fast path ----------

/** Run the detectors locally and merge into the shared collection, keeping the server's hits on other rules (LLM). */
export function runLocal(doc: vscode.TextDocument) {
  if (!isCodeDoc(doc) || doc.isClosed) return;
  const data = peekRules(doc);
  if (!data?.rules.length) return;
  const rules = data.rules.filter((r) => r.kind !== "owner");
  const lines = linesOf(doc.getText());
  const local = localCheck(doc.getText(), rules);
  const current = violationsFor(doc.uri);
  const merged: Violation[] = [];
  for (const v of current) {
    if (v.source === "regex") continue; // the detectors' own hits are recomputed below
    const moved = relocate(lines, v);
    if (moved) merged.push(moved);
  }
  merged.push(...local);
  merged.sort((a, b) => a.startLine - b.startLine || Number(b.locked) - Number(a.locked));
  const sig = (vs: Violation[]) => vs.map((v) => `${v.ruleSlug}:${v.startLine}:${(v as { startCol?: number }).startCol ?? ""}:${v.message}`).join("|");
  if (sig(merged) === sig(current)) return;
  showLocal(doc, merged);
}

/** Re-place a server hit on its anchor line after lines moved; null if that line is gone. */
function relocate(lines: string[], v: Violation): Violation | null {
  const anchor = anchorOf(v);
  if (anchor === undefined || lines[v.startLine] === anchor) return v.startLine < lines.length ? v : null;
  for (let d = 1; d < 200; d++)
    for (const i of [v.startLine + d, v.startLine - d])
      if (i >= 0 && i < lines.length && lines[i] === anchor) {
        const delta = i - v.startLine;
        const fix = v.fix && { ...v.fix, line: v.fix.line + delta, ...(v.fix.endLine !== undefined ? { endLine: v.fix.endLine + delta } : {}) };
        return { ...v, startLine: i, endLine: v.endLine + delta, ...(fix ? { fix } : {}) };
      }
  return null;
}

// ---------- agent edits ----------

const snap = new Map<string, string[]>(); // uri → lines at the last event
const agentAt = new Map<string, number>(); // uri → when an agent last wrote it
const agentTool = new Map<string, string | undefined>();
const lockedSeen = new Map<string, Set<string>>(); // uri → locked violation keys already present

/** New or changed lines between two versions (multiset diff on line text). */
function changedLines(before: string[] | undefined, after: string[]): number[] {
  if (!before) return [];
  const pool = new Map<string, number>();
  for (const l of before) pool.set(l, (pool.get(l) ?? 0) + 1);
  const out: number[] = [];
  after.forEach((l, i) => {
    const n = pool.get(l) ?? 0;
    if (n > 0) pool.set(l, n - 1);
    else if (l.trim()) out.push(i);
  });
  return out;
}

const symRe = new Map<string, RegExp>();
const symbolIn = (sym: string, text: string) => {
  let re = symRe.get(sym);
  if (!re) symRe.set(sym, (re = new RegExp(`(?<![\\w$.])${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w$])`)));
  return sym.length >= 3 && re.test(text);
};

/** Lines the agent wrote that follow a team rule (they use a symbol the rule names), minus lines that break one. */
function shapedLines(doc: vscode.TextDocument, lines: number[]): { line: number; handle: string; locked: boolean }[] {
  const rules = (peekRules(doc)?.rules ?? []).filter((r) => r.kind !== "owner" && r.symbols.length);
  if (!rules.length) return [];
  const broken = new Set(violationsFor(doc.uri).flatMap((v) => Array.from({ length: v.endLine - v.startLine + 1 }, (_, k) => v.startLine + k)));
  const out: { line: number; handle: string; locked: boolean }[] = [];
  for (const i of lines) {
    if (broken.has(i) || i >= doc.lineCount) continue;
    const text = doc.lineAt(i).text;
    if (/^\s*(\/\/|\*|#)/.test(text)) continue;
    const hits = rules.filter((r) => r.symbols.some((s) => symbolIn(s, text)));
    // A lesson that shaped the line is the learning story ("from @alex's lesson"); a locked rule otherwise.
    const r: VsRule | undefined = hits.find((x) => !x.locked) ?? hits[0];
    if (r) out.push({ line: i, handle: at(r.handle || r.ownerId), locked: r.locked });
  }
  return out;
}

/** Which tool wrote this file just now, from the hooks' activity (`/api/activity/live`). */
async function toolFor(uri: vscode.Uri): Promise<string | undefined> {
  const live = await api.live();
  const rel = relPath(uri).toLowerCase();
  const since = Date.now() - 3 * 60000;
  const hit = live?.items.find((a) => {
    const f = a.file.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
    return a.agent && a.agent !== "vscode" && new Date(a.createdAt).getTime() >= since && (f === rel || rel.endsWith("/" + f) || f.endsWith("/" + rel));
  });
  return hit?.agent ? TOOL[hit.agent] : undefined;
}

function agentWrote(doc: vscode.TextDocument, before: string[] | undefined) {
  const k = doc.uri.toString();
  agentAt.set(k, Date.now());
  agentTool.delete(k);
  void toolFor(doc.uri).then((t) => agentTool.set(k, t));
  runLocal(doc);
  void checkDoc(doc);
  const lines = changedLines(before, linesOf(doc.getText()));
  log(`buddy: agent wrote ${path.basename(doc.uri.fsPath)} (${lines.length} new line(s))`);
  setTimeout(() => {
    if (doc.isClosed) return;
    fire.agentEdit({ uri: doc.uri, lines, tool: agentTool.get(k) });
    fire.shaped({ uri: doc.uri, lines: shapedLines(doc, lines) });
  }, SHAPED_DELAY_MS);
}

async function maybeToast(uri: vscode.Uri) {
  const k = uri.toString();
  const vs = violationsFor(uri);
  const seen = lockedSeen.get(k) ?? new Set<string>();
  const fresh = vs.filter((v) => v.locked && !seen.has(key(v)));
  lockedSeen.set(k, new Set(vs.filter((v) => v.locked).map(key)));
  const v = fresh[0];
  if (!v || Date.now() - (agentAt.get(k) ?? 0) > AGENT_WINDOW_MS) return; // only after an agent's write, never while you type
  const tool = agentTool.get(k) ?? (await toolFor(uri));
  const fix = v.fix ? "Fix it" : undefined;
  const pick = await hmToast("agentBreak", agentBreakText(v, tool), ...(fix ? [fix] : []), "Show rule");
  if (pick === "Show rule") void vscode.commands.executeCommand("hivemind.showRule", v.ruleId);
  if (pick === fix) await applyFix(uri, v);
}

async function applyFix(uri: vscode.Uri, v: Violation) {
  if ((await vscode.commands.getCommands(true)).includes("hivemind.applyFix"))
    return void vscode.commands.executeCommand("hivemind.applyFix", uri, v.ruleSlug, v.startLine);
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = fixEdit(doc, v);
  if (edit) await vscode.workspace.applyEdit(edit);
  await vscode.window.showTextDocument(doc, { preview: false });
}

export function registerDetect(ctx: vscode.ExtensionContext) {
  const timers = new Map<string, NodeJS.Timeout>();
  const remember = (d: vscode.TextDocument) => isCodeDoc(d) && snap.set(d.uri.toString(), linesOf(d.getText()));
  vscode.workspace.textDocuments.forEach(remember);

  // Files an agent changed on disk that aren't open in VS Code.
  const watcher = vscode.workspace.createFileSystemWatcher(WATCH_GLOB, false, false, true);
  const onDisk = (uri: vscode.Uri) => {
    if (uri.scheme !== "file" || WATCH_SKIP.test(uri.fsPath)) return;
    if (vscode.workspace.textDocuments.some((d) => d.uri.toString() === uri.toString())) return; // change event covers it
    const k = "disk:" + uri.toString();
    clearTimeout(timers.get(k));
    timers.set(
      k,
      setTimeout(async () => {
        timers.delete(k);
        const doc = await vscode.workspace.openTextDocument(uri).then(undefined, () => undefined);
        if (!doc || !isCodeDoc(doc) || !(await rulesFor(doc))?.rules.length) return;
        agentWrote(doc, undefined);
      }, 600),
    );
  };

  ctx.subscriptions.push(
    watcher,
    watcher.onDidChange(onDisk),
    watcher.onDidCreate(onDisk),
    vscode.workspace.onDidOpenTextDocument(remember),
    vscode.workspace.onDidCloseTextDocument((d) => {
      const k = d.uri.toString();
      for (const m of [snap, agentAt, agentTool, lockedSeen]) m.delete(k);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const doc = e.document;
      if (!e.contentChanges.length || !isCodeDoc(doc)) return;
      const k = doc.uri.toString();
      const before = snap.get(k);
      remember(doc);
      if (!doc.isDirty && e.reason === undefined) return agentWrote(doc, before); // reloaded from disk: an agent wrote it
      clearTimeout(timers.get(k));
      timers.set(k, setTimeout(() => (timers.delete(k), runLocal(doc)), LOCAL_DEBOUNCE_MS));
    }),
    onViolationsChanged((uri) => void maybeToast(uri)),
    { dispose: () => timers.forEach((t) => clearTimeout(t)) },
  );
}
