import * as vscode from "vscode";
import { api } from "./api";
import { hmToast } from "./buddy/toast";
import { config, relPath, repoFor } from "./config";
import { peekRules } from "./rules";
import { plain } from "./wording";

// "Teach Hivemind?" lightbulb on a selection → one-line rule → POST /api/events (type correction, x-hm-agent: vscode).

/** Toast #3, through the buddy's 2-minute gate. */
const captured = (text: string) => void hmToast("captured", text);

const sessionId = () => `vscode-${vscode.env.sessionId.slice(0, 8)}`;

class TeachProvider implements vscode.CodeActionProvider {
  static readonly kind = vscode.CodeActionKind.QuickFix.append("hivemind.teach");

  provideCodeActions(doc: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] {
    if (range.isEmpty || doc.uri.scheme !== "file") return [];
    const scope = peekRules(doc)?.repo || repoFor(doc.uri) || "your team";
    const action = new vscode.CodeAction(`Teach Hivemind: turn this fix into a lesson for #${scope}`, TeachProvider.kind);
    action.command = { command: "hivemind.teach", title: "Teach Hivemind", arguments: [doc.uri, range] };
    return [action];
  }
}

export async function teach(uri?: vscode.Uri, range?: vscode.Range) {
  const editor = vscode.window.activeTextEditor;
  const doc = uri ? await vscode.workspace.openTextDocument(uri) : editor?.document;
  const sel = range ?? editor?.selection;
  if (!doc || !sel || sel.isEmpty) {
    void vscode.window.showInformationMessage("Select the code you fixed, then run Teach Hivemind.");
    return;
  }
  const repo = repoFor(doc.uri);
  const rule = await vscode.window.showInputBox({
    title: `Teach Hivemind: a lesson for #${repo}`,
    prompt: "One line every agent on the team should follow",
    placeHolder: "e.g. Exports call assertSingleCustomer(rows) before writing any file",
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim().length < 8 ? "Write the rule as one short sentence" : undefined),
  });
  if (!rule) return;

  const c = config();
  const res = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Hivemind: proposing the lesson…" },
    () =>
      api.event({
        type: "correction",
        actor: c.user,
        sessionId: sessionId(),
        repo,
        payload: { text: rule.trim(), context: doc.getText(sel).slice(0, 4000), file: relPath(doc.uri), source: "vscode" },
      }),
  );
  // Only four Hivemind toasts exist (editor-spec.md §2f); this is #3, "correction captured". Every other outcome
  // is a short status-bar message, so explicit actions still get feedback without a fifth toast.
  const note = (text: string) => vscode.window.setStatusBarMessage(`Hivemind: ${text}`, 6000);
  if (!res) {
    note("couldn't save the lesson (see Hivemind: Show log).");
    return;
  }
  const lesson = res.lessons[0];
  const approver = peekRules(doc)?.approver?.id;
  if (lesson?.status === "blocked") {
    note(`blocked by a locked rule: ${plain(lesson.title)}.${lesson.blockedReason ? ` ${plain(lesson.blockedReason)}` : ""}`);
  } else if (lesson?.status === "active") {
    note(`lesson added: ${plain(lesson.title)}.`);
  } else if (lesson) {
    captured(`Your correction is now a lesson. Waiting on @${approver ?? "your lead"}.`);
  } else {
    note("saved. It matches a lesson the team already has.");
  }
}

export function registerTeach(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ scheme: "file" }, new TeachProvider(), {
      providedCodeActionKinds: [TeachProvider.kind],
    }),
  );
}
