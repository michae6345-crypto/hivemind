import * as vscode from "vscode";
import { config } from "./config";
import { provenance } from "./rules";
import type { RulesResponse, VsRule } from "./types";

// Quick pick of team rules (status bar, "Show team rules", CodeLens clicks). Picking a rule opens its card.

type Item = vscode.QuickPickItem & { rule?: VsRule; action?: () => void };

const sep = (label: string): Item => ({ label, kind: vscode.QuickPickItemKind.Separator });
const ruleItem = (r: VsRule): Item => ({
  label: `${r.locked ? "$(lock)" : "$(lightbulb)"} ${r.title}`,
  description: r.locked ? `${r.ownerFirst}, ${r.ownerRole} · #${r.scopeId}` : `${r.ownerFirst}'s lesson · #${r.scopeId}`,
  detail: r.learnedFrom ?? r.summary,
  rule: r,
});

export function openDashboard(path = "") {
  void vscode.env.openExternal(vscode.Uri.parse(config().dashboardUrl + path));
}

export async function pickRules(opts: { rules: VsRule[]; data?: RulesResponse | null; title: string; withActions?: boolean }) {
  const { rules, data } = opts;
  const locked = rules.filter((r) => r.locked);
  const lessons = rules.filter((r) => !r.locked);
  const items: Item[] = [];
  if (locked.length) items.push(sep("Locked rules"), ...locked.map(ruleItem));
  if (lessons.length) items.push(sep("Team lessons"), ...lessons.map(ruleItem));
  if (opts.withActions && data?.pending.count) {
    items.push(
      sep(`Waiting for approval${data.approver ? ` (@${data.approver.id})` : ""}`),
      ...data.pending.items.map((p) => ({
        label: `$(clock) ${p.title}`,
        description: `${p.owner} · #${p.scopeId}`,
        action: () => openDashboard("/approvals"),
      })),
    );
  }
  if (opts.withActions) {
    items.push(
      sep("Hivemind"),
      { label: "$(link-external) Open dashboard", action: () => openDashboard() },
      ...(data?.pending.count ? [{ label: "$(check) Review approvals", action: () => openDashboard("/approvals") }] : []),
      { label: "$(refresh) Refresh", action: () => void vscode.commands.executeCommand("hivemind.refresh") },
      { label: "$(output) Show log", action: () => void vscode.commands.executeCommand("hivemind.showLog") },
    );
  }
  if (!items.length) items.push({ label: "No team rules for this file yet", action: () => openDashboard() });

  const picked = await vscode.window.showQuickPick(items, {
    title: opts.title,
    placeHolder: "Pick a rule to see where it came from",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;
  if (picked.action) return picked.action();
  if (picked.rule) return showRule(picked.rule);
}

export async function showRule(r: VsRule) {
  const detail = [r.summary, "", provenance(r), r.learnedFrom ? `Learned from: ${r.learnedFrom}` : ""].filter(Boolean).join("\n");
  const open = "Open in Hivemind";
  const choice = await vscode.window.showInformationMessage(`${r.locked ? "🔒 " : ""}${r.title}`, { modal: true, detail }, open);
  if (choice === open) openDashboard();
}
