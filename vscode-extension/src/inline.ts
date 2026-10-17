import * as vscode from "vscode";
import { api } from "./api";
import { config, isCodeDoc, relPath, repoFor } from "./config";
import { log } from "./log";
import { rulesFor } from "./rules";
import type { CompleteResponse } from "./types";
import { at } from "./wording";

// Ghost text that follows the team's lessons (POST /api/vscode/complete), offered when you open a new function in a
// file that has rules, or on demand (Alt+\ / "Trigger inline suggestion"). The lesson it follows is shown as a faint
// end-of-line note, same as decorations.ts' shaped-by note: `from @alex's lesson` (honey) / `locked rule · @maya` (rose).

const DEBOUNCE_MS = 120;
const SIGNATURE = [
  /\bfunction\b[^{]*\{\s*$/, // function foo(rows) {  /  export async function foo(rows: Row[]): Promise<void> {
  /=>\s*\{\s*$/, // const foo = async (rows) => {
  /^\s+(?:(?:public|private|protected|static|async)\s+)*[A-Za-z_$][\w$]*\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/, // method
  /^\s*(?:async\s+)?def\s.*:\s*$/, // python
  /^\s*func\s.*\{\s*$/, // go
];
const isSignature = (line: string) => SIGNATURE.some((re) => re.test(line)) && !/^\s*(if|for|while|switch|catch)\b/.test(line);

const label = vscode.window.createTextEditorDecorationType({
  after: { fontStyle: "italic", margin: "0 0 0 2.5em", textDecoration: "none; font-size: 12px" },
});

const labelText = (r: CompleteResponse) =>
  !r.lesson ? "" : r.lesson.locked ? `locked rule · ${at(r.lesson.authorName || r.lesson.author)}` : `from ${at(r.lesson.authorName || r.lesson.author)}'s lesson`;
const labelColor = (text: string) => (text.startsWith("locked") ? "rgba(251,113,133,.6)" : "rgba(245,165,36,.6)");

let shown: { uri: string; line: number; char: number; anchor: number } | null = null;

function showLabel(editor: vscode.TextEditor, line: number, text: string) {
  const l = editor.document.lineAt(Math.min(line, editor.document.lineCount - 1));
  editor.setDecorations(label, [{ range: l.range, renderOptions: { after: { contentText: text, color: labelColor(text) } } }]);
}
function clearLabel() {
  shown = null;
  for (const e of vscode.window.visibleTextEditors) e.setDecorations(label, []);
}

const cache = new Map<string, CompleteResponse>();
const remember = (k: string, v: CompleteResponse) => {
  cache.set(k, v);
  if (cache.size > 100) cache.delete(cache.keys().next().value as string);
};

class LessonCompletions implements vscode.InlineCompletionItemProvider {
  async provideInlineCompletionItems(
    doc: vscode.TextDocument,
    pos: vscode.Position,
    ctx: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!config().inlineSuggestions || !isCodeDoc(doc)) return;
    const line = doc.lineAt(pos.line).text;
    const before = line.slice(0, pos.character);
    const after = line.slice(pos.character);
    const invoked = ctx.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;

    // A: cursor right after `{` of a signature.  B: cursor on the first (blank) line of a new function body.
    const caseA = isSignature(before) && /^\s*\}?\s*$/.test(after);
    const prev = pos.line > 0 ? doc.lineAt(pos.line - 1).text : "";
    const caseB = !caseA && before.trim() === "" && after.trim() === "" && isSignature(prev);
    if (!caseA && !caseB && !invoked) return;

    const rules = await rulesFor(doc);
    if (!rules?.rules.length || token.isCancellationRequested) return;

    const key = `${doc.uri}|${doc.version}|${pos.line}:${pos.character}`;
    let res = cache.get(key);
    if (!res) {
      await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
      if (token.isCancellationRequested) return;
      const ctl = new AbortController();
      const sub = token.onCancellationRequested(() => ctl.abort());
      const text = doc.getText();
      const offset = doc.offsetAt(pos);
      const t0 = Date.now();
      const r = await api.complete(
        { repo: repoFor(doc.uri), file: relPath(doc.uri), prefix: text.slice(Math.max(0, offset - 6000), offset), suffix: text.slice(offset, offset + 2000) },
        ctl.signal,
      );
      sub.dispose();
      if (!r) return;
      log(`complete ${relPath(doc.uri)}:${pos.line + 1} → ${r.source} ${JSON.stringify(r.text.slice(0, 60))} in ${Date.now() - t0}ms${r.lesson ? ` (${r.lesson.slug})` : ""}`);
      res = r;
      remember(key, r);
    }
    if (token.isCancellationRequested || !res.text.trim()) return;

    let insert = res.text;
    // Auto-closed `{}`: keep the closing brace on its own line below the suggestion.
    if (caseA && after.trim() === "}" && insert.startsWith("\n")) insert += "\n" + (line.match(/^\s*/)?.[0] ?? "");

    const anchor = caseB ? pos.line - 1 : pos.line;
    const editor = vscode.window.activeTextEditor;
    if (editor?.document === doc) {
      showLabel(editor, anchor, labelText(res));
      shown = { uri: doc.uri.toString(), line: pos.line, char: pos.character, anchor };
    }
    const acceptedLine = caseA ? pos.line + 1 : pos.line;
    return [
      new vscode.InlineCompletionItem(insert, new vscode.Range(pos, pos), {
        command: "hivemind.inlineAccepted",
        title: "Hivemind suggestion accepted",
        arguments: [doc.uri.toString(), acceptedLine, labelText(res)],
      }),
    ];
  }
}

export function registerInline(ctx: vscode.ExtensionContext) {
  const provider = new LessonCompletions();
  let fade: NodeJS.Timeout | undefined;
  ctx.subscriptions.push(
    label,
    vscode.languages.registerInlineCompletionItemProvider({ scheme: "file" }, provider),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (!shown) return;
      const p = e.selections[0]?.active;
      if (e.textEditor.document.uri.toString() !== shown.uri || !p || p.line !== shown.line || p.character !== shown.char) clearLabel();
    }),
    vscode.commands.registerCommand("hivemind.inlineAccepted", (uri: string, line: number, text: string) => {
      clearTimeout(fade);
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== uri) return;
      log(`accepted Hivemind suggestion at line ${line + 1}`);
      showLabel(editor, line, text);
      shown = null;
      fade = setTimeout(() => editor.setDecorations(label, []), 6000);
    }),
    { dispose: () => clearTimeout(fade) },
  );
  return provider;
}
