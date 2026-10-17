// Wire types for /api/vscode/* (agent H). The VS Code extension keeps a copy in vscode-extension/src/types.ts —
// change both together. Lines are 0-based (VS Code convention). All routes: bearer token + x-hm-agent: vscode.
// Display text is emoji-free (titles/summaries are stripped server-side); people are @handles.

/** One team rule as the editor sees it. */
export type VsRule = {
  id: string;
  slug: string;
  title: string;
  /** Body collapsed to one line, markdown tokens kept (#scope @person [[slug]] `code`). */
  summary: string;
  scopeId: string; // 'org' | 'team/data-pipelines' | 'repo/export-service' | 'personal/alex'
  kind: "directive" | "lesson" | "owner" | "fact";
  locked: boolean;
  status: "active" | "pending";
  /** Display owner as a handle: "@maya" / "@alex" ("an agent" for agent authors). Same as `handle`. */
  owner: string;
  /** "@maya" — use this wherever a person is mentioned (never full names). */
  handle: string;
  ownerId: string;
  /** "Maya" / "Alex" ("An agent" for agent authors). */
  ownerFirst: string;
  /** people.role as a word: "Security" | "Lead" | "Engineer" ("Agent"). */
  ownerRole: string;
  /** When it was taught/locked: first evidence `at`, else createdAt (ISO). */
  taughtAt: string;
  /** Where it was learned, one line: `Alex corrected an agent: "exports must call assertSingleCustomer"`. Null for hand-written rules. */
  learnedFrom: string | null;
  /** Structured provenance for hovers: "Learned from @alex's correction · 3h ago". Null for hand-written rules. */
  learnedVia: { kind: "correction" | "review" | "manual" | "agent"; by: string; at: string } | null;
  evidenceCount: number;
  /** Wilson lower bound 0..1 (locked rules = 1). */
  confidence: number;
  /** Rule text mentions this file (path, basename or stem). */
  mentionsFile: boolean;
  /** Code identifiers named in the rule (from `backticks`), e.g. ["assertSingleCustomer", "console.log", "logger"]. The extension hovers lines containing them. */
  symbols: string[];
};

/** GET /api/vscode/rules?repo=&file=&user= */
export type RulesResponse = {
  repo: string; // normalized 'repo/<name>'
  /** Org display name for the status bar: "Meridian Data". */
  org: string;
  file: string;
  /** locked + active rules in the scope chain, ranked: locked → mentionsFile → confidence×specificity. */
  rules: VsRule[];
  /** Pending lessons in the chain (count only + top few for the quick pick). */
  pending: { count: number; items: Pick<VsRule, "id" | "title" | "owner" | "scopeId">[] };
  /** Who approves lessons for this repo (scope owner), e.g. { id: "jordan", name: "Jordan Reyes" }. */
  approver: { id: string; name: string } | null;
};

export type QuickFix = {
  title: string; // "Fix: add assertSingleCustomer(rows)"
  /** insertBefore: insert `text` (one or more full lines, no trailing newline) before line `line`. replaceLines: replace lines line..endLine (inclusive) with `text`. */
  kind: "insertBefore" | "replaceLines";
  line: number;
  endLine?: number;
  text: string;
};

export type Violation = {
  ruleId: string;
  ruleSlug: string;
  ruleTitle: string;
  locked: boolean;
  owner: string; // "@maya"
  startLine: number;
  endLine: number;
  /** Exact offending expression (0-based columns: startCol on startLine, endCol exclusive on endLine). Absent → whole trimmed lines. */
  startCol?: number;
  endCol?: number;
  /** Squiggle text (Adrian's wording, public/brand/vscode/wording.md). Locked: `Breaks a locked rule: Never mix data from different lab customers. Locked by @maya (Security).`
   *  Lesson: `Doesn't follow a team lesson: Use logger, not console.log. From @alex's lesson.` LLM hits append ` <explanation>`. */
  message: string;
  severity: "error" | "warning"; // locked → error, lesson → warning
  source: "regex" | "llm";
  fix?: QuickFix;
};

/** POST /api/vscode/check { repo, file, text } */
export type CheckRequest = { repo: string; file: string; text: string };
/** pending: the deterministic pass answered within the latency budget and the LLM pass is still running — ask again in ~2s (it lands in the cache). */
export type CheckResponse = { violations: Violation[]; cached: boolean; ms: number; pending?: boolean };

/** POST /api/vscode/complete { repo, file, prefix, suffix } — prefix/suffix = document text before/after the cursor. */
export type CompleteRequest = { repo: string; file: string; prefix: string; suffix: string };
export type CompleteResponse = {
  /** Text to insert at the cursor ("" = no suggestion). Usually starts with "\n" + indentation. */
  text: string;
  /** The lesson the completion follows, for the "Hivemind · Alex's lesson" label. */
  lesson: { id: string; slug: string; title: string; author: string; /** "@alex" */ authorName: string; locked: boolean } | null;
  cached: boolean;
  ms: number;
  source: "regex" | "llm" | "none";
};
