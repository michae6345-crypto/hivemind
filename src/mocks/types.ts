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
