import * as vscode from "vscode";
import { config } from "./config";

// Navigation helpers (the rule QuickPick is gone, Michael Oct 17): the status bar and "View source" links open the
// Hivemind sidebar (agent I's webview); the web dashboard is the fallback when the sidebar isn't registered.

const FOCUS = ["hivemind.focusSidebar", "hivemind.sidebar.focus", "hivemind.openSidebar"];
const SHOW_RULE = ["hivemind.showRule", "hivemind.sidebar.showRule", "hivemind.revealRule"];

async function firstRegistered(candidates: string[]): Promise<string | undefined> {
  const all = new Set(await vscode.commands.getCommands(true));
  return candidates.find((c) => all.has(c)) ?? (candidates === FOCUS ? [...all].find((c) => c.startsWith("workbench.view.extension.hivemind")) : undefined);
}

export function openDashboard(path = "") {
  void vscode.env.openExternal(vscode.Uri.parse(config().dashboardUrl + path));
}

/** Status bar click / "Show team rules": open the Hivemind sidebar. */
export async function focusSidebar() {
  const cmd = await firstRegistered(FOCUS);
  if (cmd) return vscode.commands.executeCommand(cmd);
  openDashboard();
}

/** Hover "View source": open this rule in the sidebar (falls back to the sidebar, then the dashboard). */
export async function viewRule(ruleId?: string) {
  const cmd = ruleId ? await firstRegistered(SHOW_RULE) : undefined;
  if (cmd) return vscode.commands.executeCommand(cmd, ruleId);
  return focusSidebar();
}
