import * as vscode from "vscode";
import { registerCelebrate } from "./celebrate";
import { runDemoAgentWrite, runDemoFlag } from "./demo";
import { registerDetect } from "./detect";
import { eventDisposables, onAgentEdit, onCollision, onShaped } from "./events";
import { toastLog } from "./toast";

// The Hivemind buddy: notices a broken rule the moment it's typed or written by an agent (local detectors + the
// server check), tells the decorations which lines an agent just wrote, and owns the only four toasts.
export function registerBuddy(ctx: vscode.ExtensionContext) {
  registerDetect(ctx);
  registerCelebrate(ctx);
  ctx.subscriptions.push(...eventDisposables, 
    vscode.commands.registerCommand("hivemind.runDemoFlag", () => runDemoFlag(ctx)),
    vscode.commands.registerCommand("hivemind.runDemoAgentWrite", () => runDemoAgentWrite(ctx)),
  );
  // For the integration test (src/buddy/e2e): what the buddy fired.
  const events: { type: string; uri: string; data: unknown; at: number }[] = [];
  ctx.subscriptions.push(
    onAgentEdit((e) => events.push({ type: "agentEdit", uri: e.uri.toString(), data: { lines: e.lines, tool: e.tool }, at: Date.now() })),
    onShaped((e) => events.push({ type: "shaped", uri: e.uri.toString(), data: e.lines, at: Date.now() })),
    onCollision((e) => events.push({ type: "collision", uri: e.uri.toString(), data: e.text, at: Date.now() })),
  );
  return { toasts: toastLog, events };
}
