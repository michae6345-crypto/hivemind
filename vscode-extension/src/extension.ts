import * as vscode from "vscode";
import { registerCollisions } from "./collisions";
import { config, isCodeDoc } from "./config";
import { checkDoc, recheckVisible, registerDiagnostics } from "./diagnostics";
import { registerHover } from "./hover";
import { registerInline } from "./inline";
import { registerLens } from "./lens";
import { initLog, log, showLog } from "./log";
import { openDashboard, pickRules } from "./picker";
import { clearRules, peekRules, rulesFor } from "./rules";
import { registerStatus } from "./status";
import { registerTeach, teach } from "./teach";

// Hivemind inside the editor: status bar, CodeLens, hovers, squiggles + quick fixes, lesson-aware ghost text,
// collision warnings and "Teach Hivemind". Everything talks to the Hivemind server (hivemind.apiUrl).
export function activate(ctx: vscode.ExtensionContext) {
  initLog(ctx);
  const c = config();
  log(`Hivemind ${ctx.extension.packageJSON.version} → ${c.apiUrl} as @${c.user}${c.token ? "" : " (no token set)"}`);

  const status = registerStatus(ctx);
  registerLens(ctx);
  registerHover(ctx);
  registerDiagnostics(ctx);
  registerInline(ctx);
  registerCollisions(ctx);
  registerTeach(ctx);

  const activeDoc = () => {
    const d = vscode.window.activeTextEditor?.document;
    return d && isCodeDoc(d) ? d : undefined;
  };

  ctx.subscriptions.push(
    vscode.commands.registerCommand("hivemind.showRules", async () => {
      const doc = activeDoc();
      const data = doc ? await rulesFor(doc) : null;
      if (doc && !data) {
        const pick = await vscode.window.showWarningMessage(`Hivemind can't reach ${config().apiUrl}.`, "Open settings", "Show log");
        if (pick === "Open settings") void vscode.commands.executeCommand("workbench.action.openSettings", "hivemind");
        if (pick === "Show log") showLog();
        return;
      }
      await pickRules({
        rules: data?.rules.filter((r) => r.kind !== "owner") ?? [],
        data,
        title: data ? `Hivemind · team rules for #${data.repo}` : "Hivemind",
        withActions: true,
      });
    }),
    vscode.commands.registerCommand("hivemind.showRuleList", async (ids: string[] = [], title = "Team rules") => {
      const doc = activeDoc();
      const data = doc ? peekRules(doc) ?? (await rulesFor(doc)) : null;
      const rules = (data?.rules ?? []).filter((r) => ids.includes(r.id));
      await pickRules({ rules, data, title: `Hivemind · ${title}` });
    }),
    vscode.commands.registerCommand("hivemind.openDashboard", () => openDashboard()),
    vscode.commands.registerCommand("hivemind.checkFile", async () => {
      const doc = activeDoc();
      if (doc) await checkDoc(doc);
    }),
    vscode.commands.registerCommand("hivemind.teach", (uri?: vscode.Uri, range?: vscode.Range) => teach(uri, range)),
    vscode.commands.registerCommand("hivemind.refresh", async () => {
      clearRules();
      await status.refresh();
      recheckVisible();
    }),
    vscode.commands.registerCommand("hivemind.showLog", () => showLog()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("hivemind")) return;
      log("settings changed, reloading");
      clearRules();
      void status.refresh();
      recheckVisible();
    }),
  );
}

export function deactivate() {}
