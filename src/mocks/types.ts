// UI-side mirror of PLAN.md §3–4. When Michael lands src/contracts/,
// replace these with `import type { … } from "@/contracts"` — field names match.

export type ScopeLevel = "org" | "team" | "repo" | "personal";

export interface Scope {
  id: string; // 'org' | 'team/data-pipelines' | 'repo/export-service' | 'personal/alex'
  level: ScopeLevel;
  name: string;
  parentId: string | null;
  owner?: string | null; // person id
}

export type Role = "security" | "lead" | "engineer";

export interface Person {
  id: string;
  name: string;
  role: Role;
  scopeId: string; // home scope (team for leads/engineers, org for security)
  title: string;
}

export type MemStatus = "pending" | "active" | "rejected" | "invalid" | "blocked";
export type MemKind = "directive" | "lesson" | "owner" | "fact";
export type MemSource = "human" | "correction" | "review" | "agent";

export interface Evidence {
  type: "correction" | "review_comment" | "manual" | "agent";
  quote: string;
  actor: string; // person id or 'agent:<session>'
  at: string; // ISO
  url?: string | null;
  ref?: string | null; // e.g. "export-service#412" or "session s-104"
}

export interface Memory {
  id: string;
  scopeId: string;
  kind: MemKind;
  title: string;
  body: string; // markdown with #scope @person [[slug]] 🔒 tokens
  slug: string;
  locked: boolean;
  status: MemStatus;
  source: MemSource;
  author: string;
  evidence: Evidence[];
  alpha: number;
  beta: number;
  expiresAt?: string | null;
  invalidatedBy?: string | null;
  blockedReason?: string | null; // UI-only until contracts confirm the field
  createdAt: string;
  updatedAt: string;
}

export type FeedType =
  | "correction"
  | "review_comment"
  | "approval"
  | "rejection"
  | "blocked"
  | "collision"
  | "session_start"
  | "deny"
  | "transfer";

export interface FeedEvent {
  id: string;
  type: FeedType;
  actor: string;
  text: string;
  at: string;
  memoryId?: string;
  repo?: string;
}

export interface ActivityItem {
  id: string;
  sessionId: string;
  actor: string;
  repo: string;
  file: string;
  createdAt: string;
  warning?: string;
}

export interface Metrics {
  curve: { session: number; corrections: number; lessonApproved?: string }[];
  repeatMistakeRate: number; // 0..1
  acceptanceRate: number; // 0..1
  transfer: { lesson: string; from: string; to: string; at: string }[];
  eval?: {
    tasks: number;
    runs: number;
    off: { violationsPerTask: number; passRate: number };
    on: { violationsPerTask: number; passRate: number };
  };
}

export interface Entity {
  kind: "team" | "repo" | "org" | "person" | "link";
  id: string;
  label: string;
  detail: string;
}
