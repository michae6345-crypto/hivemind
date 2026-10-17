import * as vscode from "vscode";
import { log } from "../log";

// The only Hivemind toasts (editor-spec.md §f). Four kinds, information messages, never modal, at most one every
// 2 minutes: extra ones are dropped, not queued. Never on file open, rules loaded, lesson-level violations or offline.

export type ToastKind = "agentBreak" | "collision" | "captured" | "approved";
const GAP_MS = 2 * 60000;
let last = 0;
/** For tests: every toast decision, newest last. */
export const toastLog: { kind: ToastKind; message: string; shown: boolean; at: number }[] = [];

export const toastsOn = () => vscode.workspace.getConfiguration("hivemind").get<boolean>("toasts", true);

/** Shows a toast if the gate allows; resolves to the clicked button (undefined if dropped or dismissed). */
export async function hmToast(kind: ToastKind, message: string, ...buttons: string[]): Promise<string | undefined> {
  // The approval is the payoff moment: it may jump the gate (it still resets it).
  if (!toastsOn() || (kind !== "approved" && Date.now() - last < GAP_MS)) {
    log(`toast dropped (${kind}): ${message}`);
    toastLog.push({ kind, message, shown: false, at: Date.now() });
    return undefined;
  }
  last = Date.now();
  log(`toast (${kind}): ${message}`);
  toastLog.push({ kind, message, shown: true, at: Date.now() });
  return vscode.window.showInformationMessage(message, ...buttons);
}
