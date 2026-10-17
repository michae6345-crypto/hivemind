// Shared API contracts (Michael owns). Field names match src/mocks/types.ts (camelCase) so the UI can
// switch `import type { … } from "@/mocks/types"` → "@/contracts" with no renames.
// DB rows are snake_case; src/lib/map.ts converts. Change only in small dedicated commits.
import { z } from "zod";

// ---------- Core entities ----------
export const ScopeLevel = z.enum(["org", "team", "repo", "personal"]);
export type ScopeLevel = z.infer<typeof ScopeLevel>;

export const Scope = z.object({
  id: z.string(), // 'org' | 'team/data-pipelines' | 'repo/export-service' | 'personal/alex'
  level: ScopeLevel,
  name: z.string(),
  parentId: z.string().nullable(),
  owner: z.string().nullable().optional(),
});
export type Scope = z.infer<typeof Scope>;

export const Role = z.enum(["security", "lead", "engineer"]);
export type Role = z.infer<typeof Role>;

export const Person = z.object({
  id: z.string(),
  name: z.string(),
  role: Role,
  scopeId: z.string(),
  title: z.string(),
});
export type Person = z.infer<typeof Person>;

export const MemStatus = z.enum(["pending", "active", "rejected", "invalid", "blocked"]);
export type MemStatus = z.infer<typeof MemStatus>;
export const MemKind = z.enum(["directive", "lesson", "owner", "fact"]);
export type MemKind = z.infer<typeof MemKind>;
export const MemSource = z.enum(["human", "correction", "review", "agent"]);
export type MemSource = z.infer<typeof MemSource>;

export const Evidence = z.object({
  type: z.enum(["correction", "review_comment", "manual", "agent", "fix"]), // fix: learned from a code fix (quote = diff excerpt)
  quote: z.string(),
  actor: z.string(), // person id or 'agent:<session>'
  at: z.string(),
  url: z.string().nullable().optional(), // permalink (PR comment, commit line)
  ref: z.string().nullable().optional(),
  file: z.string().nullable().optional(), // where the correction/fix happened, e.g. 'src/export.ts'
  line: z.number().nullable().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const Memory = z.object({
  id: z.string(),
  scopeId: z.string(),
  kind: MemKind,
  title: z.string(),
  body: z.string(), // markdown with #scope @person [[slug]] 🔒 tokens
  slug: z.string(),
  locked: z.boolean(),
  status: MemStatus,
  source: MemSource,
  author: z.string(),
  evidence: z.array(Evidence),
  alpha: z.number(),
  beta: z.number(),
  expiresAt: z.string().nullable().optional(),
  invalidatedBy: z.string().nullable().optional(),
  blockedReason: z.string().nullable().optional(), // DB column status_reason
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Memory = z.infer<typeof Memory>;

/** Which coding agent produced an event (cross-vendor attribution). Sent as header x-hm-agent. */
export const AgentKind = z.enum(["claude-code", "cursor", "gemini-cli", "copilot", "codex", "claude-ai", "windsurf", "vscode", "other"]);
export type AgentKind = z.infer<typeof AgentKind>;

export const FeedType = z.enum([
  "correction", "review_comment", "approval", "rejection", "blocked", "collision", "session_start", "deny", "transfer",
]);
export type FeedType = z.infer<typeof FeedType>;
export const FeedEvent = z.object({
  id: z.string(),
  type: FeedType,
  actor: z.string(),
  text: z.string(),
  at: z.string(),
  memoryId: z.string().optional(),
  repo: z.string().optional(),
  agent: AgentKind.optional(),
});
export type FeedEvent = z.infer<typeof FeedEvent>;

export const ActivityItem = z.object({
  id: z.string(),
  sessionId: z.string(),
  actor: z.string(),
  repo: z.string(),
  file: z.string(),
  createdAt: z.string(),
  warning: z.string().optional(),
  agent: AgentKind.optional(),
});
export type ActivityItem = z.infer<typeof ActivityItem>;

export const Metrics = z.object({
  curve: z.array(z.object({ session: z.number(), corrections: z.number(), lessonApproved: z.string().optional() })),
  repeatMistakeRate: z.number(), // 0..1
  acceptanceRate: z.number(), // 0..1
  transfer: z.array(z.object({ lesson: z.string(), from: z.string(), to: z.string(), at: z.string() })),
  eval: z
    .object({
      tasks: z.number(),
      runs: z.number(),
      off: z.object({ violationsPerTask: z.number(), passRate: z.number() }),
      on: z.object({ violationsPerTask: z.number(), passRate: z.number() }),
    })
    .optional(),
});
export type Metrics = z.infer<typeof Metrics>;

export const Entity = z.object({
  kind: z.enum(["team", "repo", "org", "person", "link"]),
  id: z.string(),
  label: z.string(),
  detail: z.string(),
});
export type Entity = z.infer<typeof Entity>;

// ---------- Request headers ----------
// UI calls send: x-hm-user: <person id>, x-hm-role: <Role>
// Hooks/MCP send: Authorization: Bearer <HIVEMIND_TOKEN>, x-hm-user
export const HDR_USER = "x-hm-user";
export const HDR_ROLE = "x-hm-role";
export const HDR_AGENT = "x-hm-agent"; // AgentKind; defaults to "claude-code" for hook routes

// ---------- API shapes ----------
/** GET /api/scopes → { scopes: Scope[], people: Person[] } */
export const ScopesResponse = z.object({ scopes: z.array(Scope), people: z.array(Person) });

/** GET /api/memories?scope=&status= → { memories: Memory[] } */
export const MemoriesResponse = z.object({ memories: z.array(Memory) });

/** POST /api/memories (role-checked) → Memory */
export const CreateMemoryInput = z.object({
  scopeId: z.string(),
  kind: MemKind.default("directive"),
  title: z.string().min(1),
  body: z.string().min(1),
  locked: z.boolean().default(false),
  expiresAt: z.string().nullable().optional(),
});
export type CreateMemoryInput = z.infer<typeof CreateMemoryInput>;

/** POST /api/memories/:id/approve | /reject → Memory (403 { error } if role not allowed) */

/** GET /api/context-pack?repo=&user=&session= */
export const ContextPack = z.object({
  markdown: z.string(), // ≤ ~6000 chars (Claude Code additionalContext cap is 10k)
  memoryIds: z.array(z.string()),
  tokens: z.number(),
});
export type ContextPack = z.infer<typeof ContextPack>;

/** POST /api/events → { id, lessons: Memory[] } */
export const EventType = z.enum(["correction", "review_comment", "session_start", "session_end", "edit", "approval", "agent_proposal", "fix"]);
export const EventInput = z.object({
  type: EventType,
  actor: z.string(),
  sessionId: z.string().optional(),
  repo: z.string().optional(), // 'repo/export-service'
  // correction: {text, context?}; review_comment: {text,url,file?};
  // fix: {file, diff (unified, ≤4KB), before?, after?, previousAuthor ("agent:claude-code" | "@kevin"), violationRuleId?}
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type EventInput = z.infer<typeof EventInput>;
export const EventResult = z.object({ id: z.string(), lessons: z.array(Memory) });
export type EventResult = z.infer<typeof EventResult>;

/** POST /api/activity → { warnings } */
export const ActivityInput = z.object({ sessionId: z.string(), actor: z.string(), repo: z.string().optional(), file: z.string() });
export type ActivityInput = z.infer<typeof ActivityInput>;
export const ActivityResult = z.object({ warnings: z.array(z.string()) });

/** GET /api/activity/live → { items: ActivityItem[], feed: FeedEvent[] } */
export const LiveResponse = z.object({ items: z.array(ActivityItem), feed: z.array(FeedEvent) });
export type LiveResponse = z.infer<typeof LiveResponse>;

/** GET /api/entities?q=&kind= → { entities: Entity[] } */
/** GET /api/metrics → Metrics */
