import * as vscode from "vscode";
import { isOnline, onOnlineChange } from "./api";
import { config, isCodeDoc, repoFor } from "./config";
import { onViolationsChanged, violationsFor } from "./diagnostics";
import { onRulesChanged, peekRules, rulesFor } from "./rules";

// Status bar (editor-spec.md §2e). The mark says "Hivemind", so the word is dropped:
//   $(hivemind) 10 rules · 2 waiting      normal (no pending: "$(hivemind) 10 rules")
//   $(hivemind) breaks 1 locked rule      rose, when the active file breaks a locked rule
//   $(hivemind) offline                   muted
// hivemind.statusFlash: the approval celebration, prominent background for 1.2s (the count flips on the next poll).
// Click → the Hivemind sidebar (hivemind.focusSidebar), never the QuickPick.
const ROSE = "#FB7185";
const MUTED = "#A1A1AA";

export function registerStatus(ctx: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem("hivemind.status", vscode.StatusBarAlignment.Right, 100);
  item.name = "Hivemind";
  item.command = "hivemind.focusSidebar";
  item.text = "$(hivemind)";
  item.show();

  const render = () => {
    const doc = vscode.window.activeTextEditor?.document;
    const data = doc && isCodeDoc(doc) ? peekRules(doc) : null;
    const repo = data?.repo || repoFor(doc?.uri) || "";
    item.color = undefined;
    if (isOnline() === false) {
      item.text = "$(hivemind) offline";
      item.color = MUTED;
      item.tooltip = `Hivemind can't reach ${config().apiUrl}. Check hivemind.apiUrl and hivemind.token.`;
      return;
    }
    if (!data) {
      item.text = "$(hivemind)";
      item.tooltip = repo ? `Hivemind · team memory for #${repo}. Click to open the sidebar.` : "Hivemind. Click to open the sidebar.";
      return;
    }
    const n = data.rules.length;
    const locked = data.rules.filter((r) => r.locked).length;
    const waiting = data.pending.count;
    const broken = new Set(doc ? violationsFor(doc.uri).filter((v) => v.locked).map((v) => v.ruleId) : []).size;
    if (broken) {
      item.text = `$(hivemind) breaks ${broken} locked ${broken === 1 ? "rule" : "rules"}`;
      item.color = ROSE;
    } else {
      item.text = `$(hivemind) ${n} ${n === 1 ? "rule" : "rules"}${waiting ? ` · ${waiting} waiting` : ""}`;
    }
    const org = data.org ? `${data.org} / ${data.repo.replace(/^repo\//, "")}` : `#${data.repo}`;
    item.tooltip =
      `Hivemind · ${org}\n${locked} locked, ${n - locked} lessons` +
      (waiting ? ` · ${waiting} waiting on @${data.approver?.id ?? "a lead"}` : "") +
      "\nClick to open the Hivemind sidebar.";
  };

  const refresh = async () => {
    const doc = vscode.window.activeTextEditor?.document;
    if (doc && isCodeDoc(doc)) await rulesFor(doc);
    render();
  };

  let flash: NodeJS.Timeout | undefined;
  ctx.subscriptions.push(
    item,
    onRulesChanged(render),
    onOnlineChange(render),
    onViolationsChanged((uri) => {
      if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) render();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => void refresh()),
    vscode.commands.registerCommand("hivemind.statusFlash", async () => {
      clearTimeout(flash);
      await refresh();
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
      flash = setTimeout(() => (item.backgroundColor = undefined), 1200);
    }),
    { dispose: () => clearTimeout(flash) },
  );
  // Poll the active file's rules so approvals made elsewhere show up live.
  const timer = setInterval(() => {
    if (vscode.window.state.focused) void refresh();
  }, 5000);
  ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
  void refresh();
  return { render, refresh, text: () => item.text };
}
