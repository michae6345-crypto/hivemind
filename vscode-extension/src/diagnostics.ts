import * as vscode from "vscode";
import { api } from "./api";
import { config, isCodeDoc, relPath, repoFor } from "./config";
import { log } from "./log";
import { rulesFor } from "./rules";
import type { Violation } from "./types";

// Squiggles from POST /api/vscode/check (regex fast path + Haiku on the server), on open, save and debounced typing.
// Quick Fix code actions apply the server's suggested edit.

const DEBOUNCE_MS = 1500;
const collection = vscode.languages.createDiagnosticCollection("hivemind");
const violations = new Map<string, Violation[]>(); // uri → last check
const timers = new Map<string, NodeJS.Timeout>();
const seq = new Map<string, number>();
const changed = new vscode.EventEmitter<vscode.Uri>();
export const onViolationsChanged = changed.event;

export const violationsFor = (uri: vscode.Uri) => violations.get(uri.toString()) ?? [];

export async function checkDoc(doc: vscode.TextDocument) {
  if (!isCodeDoc(doc)) return;
  const key = doc.uri.toString();
  const rules = await rulesFor(doc);
  if (!rules?.rules.length) return;
  const n = (seq.get(key) ?? 0) + 1;
  seq.set(key, n);
  const res = await api.check({ repo: repoFor(doc.uri), file: relPath(doc.uri), text: doc.getText() });
  if (!res || seq.get(key) !== n || doc.isClosed) return; // a newer check superseded this one
  log(`check ${relPath(doc.uri)}: ${res.violations.length} violation(s) in ${res.ms}ms${res.cached ? " (cached)" : ""}`);
  violations.set(key, res.violations);
  collection.set(doc.uri, res.violations.map((v) => toDiagnostic(doc, v)));
  changed.fire(doc.uri);
}

function toDiagnostic(doc: vscode.TextDocument, v: Violation): vscode.Diagnostic {
  const last = doc.lineCount - 1;
  const start = doc.lineAt(Math.min(Math.max(v.startLine, 0), last));
  const end = doc.lineAt(Math.min(Math.max(v.endLine, start.lineNumber), last));
  const range = new vscode.Range(start.lineNumber, start.firstNonWhitespaceCharacterIndex, end.lineNumber, end.text.length);
  const d = new vscode.Diagnostic(
    range,
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

function fixEdit(doc: vscode.TextDocument, v: Violation): vscode.WorkspaceEdit | null {
  const f = v.fix!;
  if (f.line < 0 || f.line > doc.lineCount) return null;
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
      if (e.contentChanges.length && config().checkOnType) schedule(e.document, DEBOUNCE_MS);
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
