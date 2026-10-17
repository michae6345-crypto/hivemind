import * as vscode from "vscode";
import { registerBuddy } from "./buddy";
import { registerCollisions } from "./collisions";
import { painted, registerDecorations } from "./decorations";
import { config, isCodeDoc } from "./config";
import { checkDoc, recheckVisible, registerDiagnostics } from "./diagnostics";
import { registerHover } from "./hover";
import { registerInline } from "./inline";
import { initLog, log, showLog } from "./log";
import { openDashboard, pickRules, viewRule } from "./picker";
import { clearRules, rulesFor } from "./rules";
import { registerSidebar } from "./sidebar";
import { registerStatus } from "./status";
import { registerTeach, teach } from "./teach";

// Hivemind inside the editor: status bar, decorations (tint, gutter, ruler, end-of-line notes), hovers, quick fixes,
// lesson-aware ghost text, collision warnings and "Teach Hivemind". Everything talks to the Hivemind server (hivemind.apiUrl).
export function activate(ctx: vscode.ExtensionContext) {
  initLog(ctx);
  const c = config();
  log(`Hivemind ${ctx.extension.packageJSON.version} → ${c.apiUrl} as @${c.user}${c.token ? "" : " (no token set)"}`);

  const status = registerStatus(ctx);
  registerHover(ctx);
  registerDiagnostics(ctx);
  registerDecorations(ctx);
  const buddy = registerBuddy(ctx);
  const inline = registerInline(ctx);
  const collisions = registerCollisions(ctx);
  registerTeach(ctx);
  registerSidebar(ctx);

  const activeDoc = () => {
    const d = vscode.window.activeTextEditor?.document;
    return d && isCodeDoc(d) ? d : undefined;
  };

  ctx.subscriptions.push(
    // Command palette only ("Hivemind: Show team rules"); every click opens the sidebar instead.
    vscode.commands.registerCommand("hivemind.showRules", async () => {
      const doc = activeDoc();
      const data = doc ? await rulesFor(doc) : null;
      if (doc && !data) {
        const pick = await vscode.window.showWarningMessage(`Hivemind can't reach ${config().apiUrl}.`, "Open settings", "Show log");
        if (pick === "Open settings") void vscode.commands.executeCommand("workbench.action.openSettings", "hivemind");
        if (pick === "Show log") showLog();
        return;
      }
      await pickRules(data);
    }),
    vscode.commands.registerCommand("hivemind.viewRule", (ruleId?: string) => viewRule(ruleId)),
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
  // Exposed for the integration test (test/suite.js), not a public API.
  return { testing: { inline, collisions, buddy, rules: rulesFor, statusText: status.text, painted: (uri: vscode.Uri) => painted.get(uri.toString()) } };
}

export function deactivate() {}
