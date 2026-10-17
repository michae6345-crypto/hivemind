import * as vscode from "vscode";
import { isOnline, onOnlineChange } from "./api";
import { config, isCodeDoc, repoFor } from "./config";
import { onRulesChanged, peekRules, rulesFor } from "./rules";

// Status bar: `$(hivemind) Hivemind: 13 rules, 2 waiting`. Click → quick pick of rules + dashboard.
export function registerStatus(ctx: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem("hivemind.status", vscode.StatusBarAlignment.Right, 100);
  item.name = "Hivemind";
  item.command = "hivemind.showRules";
  item.text = "$(hivemind) Hivemind";
  item.show();

  const render = () => {
    const doc = vscode.window.activeTextEditor?.document;
    const data = doc && isCodeDoc(doc) ? peekRules(doc) : null;
    const scope = data?.repo || repoFor(doc?.uri) || "your team";
    if (isOnline() === false) {
      item.text = "$(hivemind) Hivemind: offline";
      item.tooltip = `Can't reach ${config().apiUrl}. Check hivemind.apiUrl / hivemind.token. Click for options.`;
      return;
    }
    if (!data) {
      item.text = "$(hivemind) Hivemind";
      item.tooltip = `Team lessons loaded for #${scope}. Click to see them.`;
      return;
    }
    const n = data.rules.length;
    item.text = `$(hivemind) Hivemind: ${n} ${n === 1 ? "rule" : "rules"}${data.pending.count ? `, ${data.pending.count} waiting` : ""}`;
    const md = new vscode.MarkdownString(`Team lessons loaded for #${data.repo}. Click to see them.`);
    md.appendMarkdown(`\n\n$(lock) ${data.rules.filter((r) => r.locked).length} locked · $(lightbulb) ${data.rules.filter((r) => !r.locked).length} lessons`);
    if (data.pending.count) md.appendMarkdown(` · $(clock) ${data.pending.count} waiting on @${data.approver?.id ?? "a lead"}`);
    md.supportThemeIcons = true;
    item.tooltip = md;
  };

  const refresh = async () => {
    const doc = vscode.window.activeTextEditor?.document;
    if (doc && isCodeDoc(doc)) await rulesFor(doc);
    render();
  };

  ctx.subscriptions.push(
    item,
    onRulesChanged(render),
    onOnlineChange(render),
    vscode.window.onDidChangeActiveTextEditor(() => void refresh()),
  );
  // Poll the active file's rules so approvals made in the web app show up live.
  const timer = setInterval(() => {
    if (vscode.window.state.focused) void refresh();
  }, 5000);
  ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
  void refresh();
  return { render, refresh };
}
