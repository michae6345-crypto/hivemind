import * as vscode from "vscode";
import { onCollision, onShaped } from "./buddy/events";
import { onViolationsChanged, violationsFor } from "./diagnostics";
import { peekRules } from "./rules";
import type { Violation, VsRule } from "./types";
import { at, plain } from "./wording";

// Every Hivemind decoration in the editor (Adrian's editor-spec.md §2a/§2b + the collision line). Extensions can't
// colour squiggles, so the theme's diagnostic squiggle stays (error = locked, warning = lesson) and we add, on the
// exact offending range: a tint, a 2px gutter bar and an overview-ruler mark — never a second wavy line. Plus ONE
// italic end-of-line note per line (locked > lesson > shaped-by), and the honey collision line on line 1.
//
// Patterns adapted from Error Lens (usernamehw/vscode-error-lens, MIT, © 2023 Alexander): data-URI SVG gutter icons,
// `after` attachments with per-instance contentText, and CSS injected through `textDecoration` (font-size) since the
// API has no font-size field. The note's look follows GitLens' trailing inline-blame annotation (italic, muted,
// left margin) (gitkraken/vscode-gitlens, MIT).

const ROSE = "#FB7185";
const HONEY = "#F5A524";

/** 2px rounded bar as a gutter icon (Error Lens' svgToUri; `#` must be escaped in a data URI). */
const bar = (color: string) =>
  vscode.Uri.parse(
    `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="20" viewBox="0 0 4 20"><rect x="1" y="0" width="2" height="20" rx="1" fill="${color}"/></svg>`)}`,
  );

const tint = (bg: string, ruler: string) =>
  vscode.window.createTextEditorDecorationType({
    backgroundColor: bg,
    borderRadius: "2px",
    overviewRulerColor: ruler,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
const gutter = (color: string) => vscode.window.createTextEditorDecorationType({ gutterIconPath: bar(color), gutterIconSize: "contain" });

const T = {
  lockedTint: tint("rgba(251,113,133,.16)", ROSE),
  lessonTint: tint("rgba(245,165,36,.13)", HONEY),
  lockedGutter: gutter(ROSE),
  lessonGutter: gutter(HONEY),
  note: vscode.window.createTextEditorDecorationType({
    after: { fontStyle: "italic", margin: "0 0 0 2.5em", textDecoration: "none; font-size: 12px" },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  }),
  collision: vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(245,165,36,.08)",
    after: { color: HONEY, fontStyle: "italic", margin: "0 0 0 2.5em", textDecoration: "none; font-size: 12px" },
  }),
};

const NOTE_COLOR = { locked: "rgba(251,113,133,.8)", lesson: "rgba(245,165,36,.75)", shapedLesson: "rgba(245,165,36,.6)", shapedLocked: "rgba(251,113,133,.6)" };

/** Rule title cut at 40 characters on a word boundary, with "…". */
export function shortTitle(title: string, max = 40): string {
  const t = plain(title);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 20 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, "") + "…";
}

/** The exact offending range: server columns when present, else the trimmed line(s). Same as the diagnostic. */
export function violationRange(doc: vscode.TextDocument, v: Violation): vscode.Range {
  const last = doc.lineCount - 1;
  const sl = Math.min(Math.max(v.startLine, 0), last);
  const el = Math.min(Math.max(v.endLine, sl), last);
  const s = doc.lineAt(sl);
  const e = doc.lineAt(el);
  if (v.startCol != null && v.endCol != null && v.startCol < s.text.length) {
    const ec = Math.min(v.endCol, e.text.length);
    if (el > sl || ec > v.startCol) return new vscode.Range(sl, v.startCol, el, ec);
  }
  return new vscode.Range(sl, s.firstNonWhitespaceCharacterIndex, el, e.text.length);
}

const ruleOf = (doc: vscode.TextDocument, v: Violation): VsRule | undefined => peekRules(doc)?.rules.find((r) => r.id === v.ruleId || r.slug === v.ruleSlug);
const handleOf = (doc: vscode.TextDocument, v: Violation) => at(ruleOf(doc, v)?.handle ?? v.owner ?? "");

// ---- shaped-by notes (lines an agent just wrote that a lesson shaped; computed by the buddy) + collision line
type Shaped = { line: number; handle: string; locked: boolean };
const shaped = new Map<string, Map<number, Shaped>>();
const collision = new Map<string, string>();

/** Buddy → "from @alex's lesson" / "locked rule · @maya" on these lines, until each is next edited by hand. [] clears. */
export function setShaped(uri: vscode.Uri, lines: Shaped[]) {
  const m = new Map(lines.map((l) => [l.line, l]));
  if (m.size) shaped.set(uri.toString(), m);
  else shaped.delete(uri.toString());
  paintUri(uri);
}

/** Buddy → the honey whole-line note on line 1 (`@adrian's Cursor agent edited this file 2 min ago`), or null. */
export function setCollision(uri: vscode.Uri, text: string | null) {
  if (text) collision.set(uri.toString(), plain(text));
  else collision.delete(uri.toString());
  paintUri(uri);
}

/** What was last painted per file (read by the integration test; decorations can't be read back from VS Code). */
export const painted = new Map<string, { locked: string[]; lesson: string[]; notes: string[]; collision: string | null }>();

function paint(editor: vscode.TextEditor) {
  const doc = editor.document;
  const key = doc.uri.toString();
  const vs = violationsFor(doc.uri);
  const lockedR: vscode.Range[] = [];
  const lessonR: vscode.Range[] = [];
  const lockedLines = new Set<number>();
  const lessonLines = new Set<number>();
  const notes = new Map<number, { text: string; color: string; rank: number }>();
  const note = (line: number, text: string, color: string, rank: number) => {
    const cur = notes.get(line);
    if (!cur || rank < cur.rank) notes.set(line, { text, color, rank });
  };

  for (const v of vs) {
    const r = violationRange(doc, v);
    (v.locked ? lockedR : lessonR).push(r);
    for (let l = r.start.line; l <= r.end.line; l++) (v.locked ? lockedLines : lessonLines).add(l);
    const title = shortTitle(v.ruleTitle);
    if (v.locked) note(r.start.line, `Breaks locked rule · ${title} · ${handleOf(doc, v)}`, NOTE_COLOR.locked, 0);
    else note(r.start.line, `Team lesson · ${title} · ${handleOf(doc, v)}`, NOTE_COLOR.lesson, 1);
  }
  for (const s of shaped.get(key)?.values() ?? []) {
    if (s.line >= doc.lineCount) continue;
    if (s.locked) note(s.line, `locked rule · ${at(s.handle)}`, NOTE_COLOR.shapedLocked, 2);
    else note(s.line, `from ${at(s.handle)}'s lesson`, NOTE_COLOR.shapedLesson, 3);
  }

  const gutterRanges = (lines: Set<number>) => [...lines].map((l) => new vscode.Range(l, 0, l, 0));
  editor.setDecorations(T.lockedTint, lockedR);
  editor.setDecorations(T.lessonTint, lessonR);
  editor.setDecorations(T.lockedGutter, gutterRanges(lockedLines));
  editor.setDecorations(T.lessonGutter, gutterRanges(new Set([...lessonLines].filter((l) => !lockedLines.has(l)))));
  editor.setDecorations(
    T.note,
    [...notes].map(([line, n]) => {
      const end = doc.lineAt(line).range.end;
      return { range: new vscode.Range(end, end), renderOptions: { after: { contentText: n.text, color: n.color } } };
    }),
  );
  const c = collision.get(key);
  painted.set(key, {
    locked: lockedR.map((r) => doc.getText(r)),
    lesson: lessonR.map((r) => doc.getText(r)),
    notes: [...notes].map(([line, n]) => `${line + 1}: ${n.text}`),
    collision: c ?? null,
  });
  editor.setDecorations(T.collision, c && doc.lineCount ? [{ range: doc.lineAt(0).range, renderOptions: { after: { contentText: c } } }] : []);
}

function paintUri(uri: vscode.Uri) {
  for (const e of vscode.window.visibleTextEditors) if (e.document.uri.toString() === uri.toString()) paint(e);
}

export function registerDecorations(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    ...Object.values(T),
    onViolationsChanged((uri) => paintUri(uri)),
    onShaped((e) => setShaped(e.uri, e.lines)), // the buddy: lines an agent just wrote that a rule shaped
    onCollision((e) => setCollision(e.uri, e.text)), // the buddy: collision line on top of the file
    vscode.window.onDidChangeVisibleTextEditors((eds) => eds.forEach(paint)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      // A hand edit on a shaped line ends its "from @alex's lesson" note.
      const m = shaped.get(e.document.uri.toString());
      if (m && e.contentChanges.length && e.reason === undefined) {
        for (const ch of e.contentChanges) for (let l = ch.range.start.line; l <= ch.range.end.line; l++) m.delete(l);
        paintUri(e.document.uri);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((d) => {
      shaped.delete(d.uri.toString());
      collision.delete(d.uri.toString());
    }),
  );
  vscode.window.visibleTextEditors.forEach(paint);
}
