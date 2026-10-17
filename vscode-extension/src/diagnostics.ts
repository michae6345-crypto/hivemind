import * as vscode from "vscode";
import { api } from "./api";
import { exprSpan, type Span } from "./buddy/local";
import { config, isCodeDoc, relPath, repoFor } from "./config";
import { log } from "./log";
import { rulesFor } from "./rules";
import type { Violation } from "./types";

// Squiggles from POST /api/vscode/check (regex fast path + Haiku on the server), on open, save and debounced typing.
// One collection for everything Hivemind flags: the buddy's instant local hits (showLocal) land here too and are
// replaced by the server's answer. Squiggles cover exactly the violating expression. Quick Fix applies the server's edit.

const DEBOUNCE_MS = 600;
const PENDING_RECHECK_MS = 2000; // server answered with deterministic hits while Haiku still runs → ask again (cached)
const collection = vscode.languages.createDiagnosticCollection("hivemind");
const violations = new Map<string, Violation[]>(); // uri → last check
const timers = new Map<string, NodeJS.Timeout>();
const seq = new Map<string, number>();
const changed = new vscode.EventEmitter<vscode.Uri>();
const anchors = new WeakMap<Violation, string>(); // violation → text of its start line when it was flagged
/** Text of the violation's start line when it was flagged (lets the buddy re-place hits after lines move). */
export const anchorOf = (v: Violation) => anchors.get(v);
export const onViolationsChanged = changed.event;

export const violationsFor = (uri: vscode.Uri) => violations.get(uri.toString()) ?? [];

export async function checkDoc(doc: vscode.TextDocument, recheck = 0) {
  if (!isCodeDoc(doc)) return;
  const key = doc.uri.toString();
  const rules = await rulesFor(doc);
  if (!rules?.rules.length) return;
  const n = (seq.get(key) ?? 0) + 1;
  seq.set(key, n);
  const version = doc.version;
  const res = (await api.check({ repo: repoFor(doc.uri), file: relPath(doc.uri), text: doc.getText() })) as
    | (Awaited<ReturnType<typeof api.check>> & { pending?: boolean })
    | null;
  if (!res || seq.get(key) !== n || doc.isClosed || doc.version !== version) return; // superseded
  log(`check ${relPath(doc.uri)}: ${res.violations.length} violation(s) in ${res.ms}ms${res.cached ? " (cached)" : ""}${res.pending ? " (pending)" : ""}`);
  set(doc, res.violations);
  if (res.pending && recheck < 3) {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => (timers.delete(key), void checkDoc(doc, recheck + 1)), PENDING_RECHECK_MS));
  }
}

/** Buddy fast path: local regex hits for the current text, shown until the server answers. */
export function showLocal(doc: vscode.TextDocument, vs: Violation[]) {
  if (!doc.isClosed) set(doc, vs);
}

function set(doc: vscode.TextDocument, vs: Violation[]) {
  violations.set(doc.uri.toString(), vs);
  const lines = doc.getText().split("\n").map((s) => s.replace(/\r$/, ""));
  for (const v of vs) if (!anchors.has(v)) anchors.set(v, lines[v.startLine] ?? "");
  collection.set(doc.uri, vs.map((v) => toDiagnostic(doc, lines, v)));
  changed.fire(doc.uri);
}

/** The exact range to flag: the server's columns (startCol/endCol), else the trimmed lines. */
export function rangeOf(doc: vscode.TextDocument, v: Violation, lines = doc.getText().split("\n").map((s) => s.replace(/\r$/, ""))): vscode.Range {
  const s: Span = exprSpan(lines, v);
  return new vscode.Range(s.line, s.start, s.endLine, s.end);
}

function toDiagnostic(doc: vscode.TextDocument, lines: string[], v: Violation): vscode.Diagnostic {
  const d = new vscode.Diagnostic(
    rangeOf(doc, v, lines),
    v.message,
    v.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
  );
  d.source = "Hivemind";
  d.code = { value: v.ruleSlug, target: vscode.Uri.parse(config().dashboardUrl + "/") };
  return d;
}

function schedule(doc: vscode.TextDocument, ms: number) {
  const key = doc.uri.toString();
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => (timers.delete(key), void checkDoc(doc)), ms));
}

class FixProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(doc: vscode.TextDocument, _range: vscode.Range, ctx: vscode.CodeActionContext): vscode.CodeAction[] {
    const out: vscode.CodeAction[] = [];
    const vs = violationsFor(doc.uri);
    for (const d of ctx.diagnostics) {
      if (d.source !== "Hivemind") continue;
      const slug = typeof d.code === "object" ? String(d.code.value) : String(d.code ?? "");
      const v = vs.find((x) => x.ruleSlug === slug && x.message === d.message && x.fix);
      if (!v?.fix) continue;
      const edit = fixEdit(doc, v);
      if (!edit) continue;
      const action = new vscode.CodeAction(v.fix.title, vscode.CodeActionKind.QuickFix);
      action.edit = edit;
      action.diagnostics = [d];
      action.isPreferred = true;
      out.push(action);
    }
    return out;
  }
}

export function fixEdit(doc: vscode.TextDocument, v: Violation): vscode.WorkspaceEdit | null {
  const f = v.fix;
  if (!f || f.line < 0 || f.line > doc.lineCount) return null;
  const edit = new vscode.WorkspaceEdit();
  if (f.kind === "insertBefore") {
    edit.insert(doc.uri, new vscode.Position(f.line, 0), f.text + "\n");
  } else {
    const endLine = Math.min(f.endLine ?? f.line, doc.lineCount - 1);
    edit.replace(doc.uri, new vscode.Range(f.line, 0, endLine, doc.lineAt(endLine).text.length), f.text);
  }
  return edit;
}

export function registerDiagnostics(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    collection,
    changed,
    vscode.languages.registerCodeActionsProvider({ scheme: "file" }, new FixProvider(), {
      providedCodeActionKinds: FixProvider.kinds,
    }),
    vscode.workspace.onDidOpenTextDocument((d) => schedule(d, 300)),
    vscode.workspace.onDidSaveTextDocument((d) => schedule(d, 0)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      // Edits from disk (an agent like Claude Code or Cursor rewrote the file) always check; typing respects checkOnType.
      if (e.contentChanges.length && (config().checkOnType || !e.document.isDirty)) schedule(e.document, DEBOUNCE_MS);
    }),
    vscode.workspace.onDidCloseTextDocument((d) => {
      collection.delete(d.uri);
      violations.delete(d.uri.toString());
    }),
    vscode.window.onDidChangeActiveTextEditor((e) => e && schedule(e.document, 200)),
  );
  for (const e of vscode.window.visibleTextEditors) schedule(e.document, 500);
}

export function recheckVisible() {
  for (const e of vscode.window.visibleTextEditors) schedule(e.document, 0);
}
