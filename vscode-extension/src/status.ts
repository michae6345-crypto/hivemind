import * as vscode from "vscode";
import { isOnline, onOnlineChange } from "./api";
import { config, isCodeDoc, repoFor } from "./config";
import { onRulesChanged, peekRules, rulesFor } from "./rules";

// Status bar: `Hivemind · Meridian Data / export-service · 9 rules`. Click → the Hivemind sidebar.
const short = (repo: string) => repo.replace(/^repo\//, "");

export function registerStatus(ctx: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem("hivemind.status", vscode.StatusBarAlignment.Right, 100);
  item.name = "Hivemind";
  item.command = "hivemind.showRules";
  item.text = "Hivemind";
  item.show();

  let lastOrg = "";
  const render = () => {
    const doc = vscode.window.activeTextEditor?.document;
    const data = doc && isCodeDoc(doc) ? peekRules(doc) : null;
    const repo = data?.repo || repoFor(doc?.uri) || "";
    if (data?.org) lastOrg = data.org;
    const context = [lastOrg, short(repo)].filter(Boolean).join(" / ");
    if (isOnline() === false) {
      item.text = `Hivemind${context ? ` · ${context}` : ""} · offline`;
      item.tooltip = `Can't reach ${config().apiUrl}. Check hivemind.apiUrl and hivemind.token.`;
      return;
    }
    if (!data) {
      item.text = `Hivemind${context ? ` · ${context}` : ""}`;
      item.tooltip = repo ? `Team memory for #${repo}. Click to open the Hivemind sidebar.` : "Click to open the Hivemind sidebar.";
      return;
    }
    const n = data.rules.length;
    const locked = data.rules.filter((r) => r.locked).length;
    item.text = `Hivemind · ${context} · ${n} ${n === 1 ? "rule" : "rules"}`;
    const waiting = data.pending.count ? ` · ${data.pending.count} waiting on @${data.approver?.id ?? "a lead"}` : "";
    item.tooltip = `Team memory for #${data.repo}: ${locked} locked, ${n - locked} lessons${waiting}. Click to open the Hivemind sidebar.`;
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
  return { render, refresh, text: () => item.text };
}
