// Types now come from Michael's shared contracts (src/contracts). This file
// re-exports them so existing UI imports keep working.
export type {
  ScopeLevel,
  Scope,
  Role,
  Person,
  MemStatus,
  MemKind,
  MemSource,
  Evidence,
  Memory,
  FeedType,
  FeedEvent,
  ActivityItem,
  Metrics,
  Entity,
} from "@/contracts";

/** GET /api/metrics also returns `evalDetail` beside the contract's `eval` (src/app/api/metrics/route.ts). */
export interface EvalArmCount {
  n: number;
  targetViolations: number;
}
export interface EvalDetail {
  model?: string;
  n: { off: number; on: number; placebo: number };
  targetViolations: { off: number; on: number; placebo: number | null };
  heldOut?: { off?: EvalArmCount; on?: EvalArmCount; placebo?: EvalArmCount } | null;
  heldOutTasks?: string[];
}
