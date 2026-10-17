import * as vscode from "vscode";
import { config } from "./config";
import type { RulesResponse, VsRule } from "./types";
import { at, plain } from "./wording";

// Navigation. Clicks (status bar, hover links, toasts) open the Hivemind sidebar (agent I's webview,
// hivemind.focusSidebar([ruleId])). The QuickPick stays only as the command-palette command
// "Hivemind: Show team rules" for keyboard users (editor-spec.md §0.4) — no click ever opens it.

export function openDashboard(path = "") {
  void vscode.env.openExternal(vscode.Uri.parse(config().dashboardUrl + path));
}

async function registered(cmd: string) {
  return (await vscode.commands.getCommands(true)).includes(cmd);
}

/** The sidebar, optionally on one rule's card; the web dashboard if the sidebar isn't there. */
export async function focusSidebar(ruleId?: string) {
  if (await registered("hivemind.focusSidebar")) return vscode.commands.executeCommand("hivemind.focusSidebar", ruleId);
  openDashboard();
}

/** Back-compat alias used by older links. */
export const viewRule = (ruleId?: string) => focusSidebar(ruleId);

type Item = vscode.QuickPickItem & { rule?: VsRule };
const sep = (label: string): Item => ({ label, kind: vscode.QuickPickItemKind.Separator });
const item = (r: VsRule): Item => ({
  label: plain(r.title),
  description: `${r.locked ? "locked rule" : "lesson"} · #${r.scopeId} · ${at(r.handle ?? r.ownerId)}`,
  detail: r.quote ? `"${plain(r.quote)}"` : plain(r.summary),
  rule: r,
});

/** Palette-only list of the team rules for the active file; picking one opens it in the sidebar. */
export async function pickRules(data: RulesResponse | null) {
  const rules = (data?.rules ?? []).filter((r) => r.kind !== "owner");
  const locked = rules.filter((r) => r.locked);
  const lessons = rules.filter((r) => !r.locked);
  const items: Item[] = [
    ...(locked.length ? [sep(`Locked · ${locked.length}`), ...locked.map(item)] : []),
    ...(lessons.length ? [sep(`Lessons · ${lessons.length}`), ...lessons.map(item)] : []),
  ];
  if (!items.length) items.push({ label: "No team rules apply here." });
  const picked = await vscode.window.showQuickPick(items, {
    title: data ? `Hivemind · team rules for #${data.repo}` : "Hivemind",
    placeHolder: "Pick a rule to open it in the Hivemind sidebar",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (picked?.rule) await focusSidebar(picked.rule.id);
}
