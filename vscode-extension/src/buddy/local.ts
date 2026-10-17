import type { Violation, VsRule } from "../types";
import { detect } from "./vendor/detectors";

// Buddy fast path: the server's own deterministic detectors (vendored by sync-detectors.mjs), run locally ~300ms after
// you stop typing, so a broken rule is flagged before POST /api/vscode/check answers. Same slug, line, columns and
// message as the server, so its answer replaces these hits without a flicker. Pure (no vscode import):
// src/buddy/local.selftest.mjs runs it in node against the live server.

export type Span = { line: number; start: number; endLine: number; end: number };
type Vx = Violation & { startCol?: number; endCol?: number };

export function localCheck(text: string, rules: VsRule[]): Violation[] {
  return detect(text.split("\n").map((s) => s.replace(/\r$/, "")), rules);
}

/** The exact expression to flag: the server's columns; the trimmed lines when it sent none (LLM hits). */
export function exprSpan(lines: string[], v: Vx): Span {
  const last = Math.max(0, lines.length - 1);
  const s = clamp(v.startLine, 0, last);
  const e = clamp(v.endLine, s, last);
  if (typeof v.startCol === "number" && typeof v.endCol === "number" && (e > s || v.endCol > v.startCol)) {
    return { line: s, start: clamp(v.startCol, 0, lines[s].length), endLine: e, end: clamp(v.endCol, 0, lines[e].length) };
  }
  const start = Math.max(0, lines[s].search(/\S/));
  const end = lines[e].replace(/\s+$/, "").length;
  return { line: s, start, endLine: e, end: e === s ? Math.max(end, start + 1) : end };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));
