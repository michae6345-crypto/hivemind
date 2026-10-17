import * as vscode from "vscode";

// Buddy events the rest of the extension paints from. Agent H's src/decorations.ts subscribes:
//   onShaped(e => setShaped(e.uri, e.lines)) · onCollision(e => setCollision(e.uri, e.text))
// Agent I's sidebar / H's status bar can follow onLessonApproved.

export type AgentEdit = { uri: vscode.Uri; lines: number[]; tool?: string };
export type ShapedLine = { line: number; handle: string; locked: boolean };
export type Shaped = { uri: vscode.Uri; lines: ShapedLine[] };
export type Collision = { uri: vscode.Uri; text: string | null };
export type LessonApproved = { ruleId: string; title: string; approver: string; scope?: string };

const agentEdit = new vscode.EventEmitter<AgentEdit>();
const shaped = new vscode.EventEmitter<Shaped>();
const collision = new vscode.EventEmitter<Collision>();
const approved = new vscode.EventEmitter<LessonApproved>();

/** ~150ms after an agent's write lands (disk reload of an open file, or a watched file): the new/changed lines. */
export const onAgentEdit = agentEdit.event;
/** Lines an agent just wrote that a team rule shaped (`from @alex's lesson` / `locked rule · @maya`). [] = clear. */
export const onShaped = shaped.event;
/** The collision line on top of a file (`@adrian's Cursor agent edited this file 2 min ago`); null = clear. */
export const onCollision = collision.event;
/** A lesson the current user taught was approved. */
export const onLessonApproved = approved.event;

export const fire = {
  agentEdit: (e: AgentEdit) => agentEdit.fire(e),
  shaped: (e: Shaped) => shaped.fire(e),
  collision: (e: Collision) => collision.fire(e),
  approved: (e: LessonApproved) => approved.fire(e),
};
export const eventDisposables = [agentEdit, shaped, collision, approved];

// Last value per file, so a late subscriber (or a re-shown editor) can repaint.
const lastShaped = new Map<string, ShapedLine[]>();
const lastCollision = new Map<string, string>();
onShaped((e) => (e.lines.length ? lastShaped.set(e.uri.toString(), e.lines) : lastShaped.delete(e.uri.toString())));
onCollision((e) => (e.text ? lastCollision.set(e.uri.toString(), e.text) : lastCollision.delete(e.uri.toString())));
export const shapedFor = (uri: vscode.Uri) => lastShaped.get(uri.toString()) ?? [];
export const collisionFor = (uri: vscode.Uri) => lastCollision.get(uri.toString()) ?? null;
