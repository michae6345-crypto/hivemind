import * as vscode from "vscode";

// One output channel ("Hivemind") for diagnostics; the UI itself stays quiet.
let channel: vscode.OutputChannel | undefined;

export function initLog(ctx: vscode.ExtensionContext) {
  channel = vscode.window.createOutputChannel("Hivemind");
  ctx.subscriptions.push(channel);
}

export function log(msg: string) {
  channel?.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

export const showLog = () => channel?.show(true);
