import type { Violation } from "../types";

// Toast wording: public/brand/vscode/wording.md "Editor, 17 Oct" (Adrian). No emojis; people are @handles.

export const TOOL: Record<string, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  copilot: "Copilot",
  codex: "Codex",
  "claude-ai": "Claude",
  windsurf: "Windsurf",
  vscode: "VS Code",
};

export const at = (s: string) => (s.startsWith("@") ? s : `@${s}`);

/** `@adrian's Cursor agent` */
export const agentOf = (a: { actor: string; agent?: string }) =>
  `${at(a.actor.toLowerCase())}'s ${a.agent && TOOL[a.agent] ? `${TOOL[a.agent]} ` : ""}agent`;

/** `@maya` from a violation's owner ("@maya" since 9936076; older servers sent "Maya Chen, Head of Security"). */
export const ownerHandle = (v: Violation) =>
  v.owner.startsWith("@") ? v.owner.split(/[\s(,]/)[0] : at(v.owner.split(/[\s,]/)[0].toLowerCase());

/** `Claude Code's edit breaks a locked rule: {title}. Locked by @maya.` */
export const agentBreakText = (v: Violation, tool?: string) =>
  `${tool ? `${tool}'s` : "An agent's"} edit breaks a locked rule: ${v.ruleTitle}. Locked by ${ownerHandle(v)}.`;

/** `@jordan approved your lesson "{title}". Every agent on #{scope} gets it next session.` */
export const approvedText = (approver: string, title: string, scope?: string) =>
  `${at(approver)} approved your lesson "${title}". Every agent${scope ? ` on #${scope}` : ""} gets it next session.`;

export const capturedText = (lead?: string) => `Your correction is now a lesson. Waiting on ${lead ? at(lead) : "your lead"}.`;

export function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m === 0 ? "just now" : `${m} min ago`;
}
