"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as mock from "@/mocks";
import type { ActivityItem, EvalDetail, FeedEvent, Memory, Metrics, Person, Role, Scope } from "@/mocks/types";
import { approverFor, canApprove, scopeLabel } from "./utils";

export const ROLE_USERS: { role: Role; userId: string; label: string }[] = [
  { role: "security", userId: "maya", label: "Security" },
  { role: "lead", userId: "jordan", label: "Lead" },
  { role: "engineer", userId: "alex", label: "Engineer" },
];

export type Source = "core" | "activity" | "metrics";
export type ActionResult = { ok: true; memory?: Memory } | { ok: false; error: string; forbidden?: boolean };

export interface NewMemoryInput {
  scopeId: string;
  kind: Memory["kind"];
  title: string;
  body: string;
  locked?: boolean;
  expiresAt?: string | null;
}

interface HivemindState {
  /** 'live' once /api/scopes + /api/memories answer; seed data before that. */
  mode: "mock" | "live";
  live: Record<Source, boolean>;
  scopes: Scope[];
  people: Person[];
  memories: Memory[];
  feed: FeedEvent[];
  activity: ActivityItem[];
  metrics: Metrics;
  /** The replay eval's detail (placebo arm, held-out tasks), from GET /api/metrics; a snapshot until it answers. */
  evalDetail: EvalDetail;
  metricsLive: boolean;
  user: Person | undefined;
  role: Role;
  setRole: (role: Role) => void;
  headers: Record<string, string>;
  /** The lesson shown on the Lessons screen. */
  openId: string | null;
  openMemory: (id: string) => void;
  approve: (id: string) => Promise<ActionResult>;
  reject: (id: string) => Promise<ActionResult>;
  restore: (m: Memory) => void;
  updateMemory: (id: string, patch: Partial<Memory>) => void;
  createMemory: (input: NewMemoryInput) => Promise<ActionResult>;
  memoryBySlug: (slug: string) => Memory | undefined;
  /** Memory ids that changed state in this browser session (drives the "just learned" flash). */
  recentlyChanged: Set<string>;
  composerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const Ctx = createContext<HivemindState | null>(null);

export const API = process.env.NEXT_PUBLIC_HIVEMIND_API ?? "";
const FORCE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

async function getJSON<T>(path: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { headers, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function postJSON(
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

function errorText(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
    return (data as { error: string }).error;
  }
  return fallback;
}

function feedFromMemories(memories: Memory[]): FeedEvent[] {
  return memories
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 14)
    .map((m) => ({
      id: `live-${m.id}-${m.status}`,
      type:
        m.status === "blocked"
          ? "blocked"
          : m.status === "pending"
            ? m.source === "review"
              ? "review_comment"
              : "correction"
            : m.status === "rejected"
              ? "rejection"
              : "approval",
      actor: m.author,
      text:
        m.status === "blocked"
          ? `proposed [[${m.slug}]], blocked by a locked rule`
          : m.status === "pending"
            ? `taught a pending lesson [[${m.slug}]]`
            : m.status === "rejected"
              ? `had [[${m.slug}]] rejected`
              : `taught [[${m.slug}]]`,
      at: m.updatedAt,
      memoryId: m.id,
    }));
}

export function chainOfCommandMessage(m: Memory, scopes: Scope[], people: Person[]) {
  const who = approverFor(m, scopes, people);
  const name = who ? `@${who.id} (${who.title})` : "the scope owner";
  return `Only ${name} can approve lessons for ${scopeLabel(m.scopeId)}.`;
}

export function HivemindProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<Record<Source, boolean>>({ core: false, activity: false, metrics: false });
  const [scopes, setScopes] = useState<Scope[]>(mock.scopes);
  const [people, setPeople] = useState<Person[]>(mock.people);
  const [memories, setMemories] = useState<Memory[]>(mock.memories);
  const [mockFeed, setMockFeed] = useState<FeedEvent[]>(mock.feed);
  const [liveFeed, setLiveFeed] = useState<FeedEvent[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>(mock.activity);
  const [metrics, setMetrics] = useState<Metrics>(mock.metrics);
  const [evalDetail, setEvalDetail] = useState<EvalDetail>(mock.evalDetail);
  const [role, setRole] = useState<Role>("lead");
  const [openId, setOpenId] = useState<string | null>(null);
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const mode: "mock" | "live" = live.core ? "live" : "mock";

  const user = useMemo(() => {
    const id = ROLE_USERS.find((r) => r.role === role)?.userId;
    return people.find((p) => p.id === id);
  }, [people, role]);

  const headers = useMemo(() => ({ "x-hm-role": role, "x-hm-user": user?.id ?? "" }), [role, user]);
  const headersRef = useRef(headers);
  useEffect(() => {
    headersRef.current = headers;
  }, [headers]);

  // Each source polls on its own: every 2s once it has answered, every 10s until then.
  useEffect(() => {
    if (FORCE_MOCKS) return;
    let stop = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const loop = (name: Source, poll: () => Promise<boolean>) => {
      const tick = async () => {
        const ok = await poll();
        if (stop) return;
        setLive((l) => (l[name] === ok ? l : { ...l, [name]: ok }));
        timers.push(setTimeout(tick, ok ? 2000 : 10_000));
      };
      tick();
    };

    loop("core", async () => {
      const [s, m] = await Promise.all([
        getJSON<{ scopes: Scope[]; people: Person[] } | Scope[]>("/api/scopes", headersRef.current),
        getJSON<{ memories: Memory[] } | Memory[]>("/api/memories", headersRef.current),
      ]);
      if (stop) return false;
      const scopeList = Array.isArray(s) ? s : s?.scopes;
      const memList = Array.isArray(m) ? m : m?.memories;
      if (!Array.isArray(scopeList) || !Array.isArray(memList) || memList.length === 0) return false;
      setScopes(scopeList);
      if (s && !Array.isArray(s) && Array.isArray(s.people) && s.people.length) setPeople(s.people);
      setMemories(memList);
      return true;
    });

    loop("activity", async () => {
      const r = await getJSON<{ items?: ActivityItem[]; feed?: FeedEvent[] }>("/api/activity/live", headersRef.current);
      if (stop || !r || (!Array.isArray(r.items) && !Array.isArray(r.feed))) return false;
      setActivity(r.items ?? []);
      setLiveFeed(Array.isArray(r.feed) ? r.feed : null);
      return true;
    });

    loop("metrics", async () => {
      // The eval answers even without the database (curve empty), and it is what Results leads with.
      const r = await getJSON<Metrics & { evalDetail?: EvalDetail }>("/api/metrics", headersRef.current);
      if (stop || !r || (!r.eval && !(Array.isArray(r.curve) && r.curve.length))) return false;
      setMetrics((m) => ({ ...m, ...r, curve: r.curve?.length ? r.curve : m.curve }));
      if (r.evalDetail?.targetViolations) setEvalDetail(r.evalDetail);
      return !!r.eval;
    });

    return () => {
      stop = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const feed = useMemo<FeedEvent[]>(() => {
    if (live.activity && liveFeed && liveFeed.length) return liveFeed;
    if (live.core) return feedFromMemories(memories);
    return mockFeed;
  }, [live.activity, live.core, liveFeed, memories, mockFeed]);

  const markChanged = useCallback((id: string) => {
    setRecentlyChanged((s) => new Set(s).add(id));
    setTimeout(() => {
      setRecentlyChanged((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 2400);
  }, []);

  const openMemory = useCallback((id: string) => setOpenId(id), []);

  const replaceLocal = useCallback((m: Memory) => {
    setMemories((ms) => ms.map((x) => (x.id === m.id ? m : x)));
  }, []);

  const patchLocal = useCallback((id: string, patch: Partial<Memory>) => {
    setMemories((ms) =>
      ms.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)),
    );
  }, []);

  const pushMockFeed = useCallback((e: Omit<FeedEvent, "id" | "at">) => {
    setMockFeed((f) => [{ ...e, id: `f-${Date.now()}`, at: new Date().toISOString() }, ...f].slice(0, 40));
  }, []);

  const decide = useCallback(
    async (id: string, verdict: "approve" | "reject"): Promise<ActionResult> => {
      const m = memories.find((x) => x.id === id);
      if (!m) return { ok: false, error: "That lesson no longer exists." };

      if (mode === "live") {
        const { status, data } = await postJSON(`/api/memories/${id}/${verdict}`, headersRef.current);
        if (status === 403) {
          return { ok: false, forbidden: true, error: errorText(data, chainOfCommandMessage(m, scopes, people)) };
        }
        if (status < 200 || status >= 300) {
          return { ok: false, error: errorText(data, `Couldn't ${verdict} the lesson. The API returned ${status || "no response"}.`) };
        }
        const updated =
          data && typeof data === "object" && "id" in data ? (data as Memory) : { ...m, status: verdict === "approve" ? "active" : "rejected" } as Memory;
        replaceLocal(updated);
        markChanged(id);
        return { ok: true, memory: updated };
      }

      // Seed-data mode mirrors the API's role rules, including the 403.
      if (!canApprove(user, m, scopes)) {
        return { ok: false, forbidden: true, error: chainOfCommandMessage(m, scopes, people) };
      }
      if (verdict === "approve") {
        patchLocal(id, { status: "active", alpha: m.alpha + 2 });
        pushMockFeed({ type: "approval", actor: user?.id ?? "", text: `approved [[${m.slug}]] for #${m.scopeId}`, memoryId: id });
      } else {
        patchLocal(id, { status: "rejected" });
        pushMockFeed({ type: "rejection", actor: user?.id ?? "", text: `rejected [[${m.slug}]]`, memoryId: id });
      }
      markChanged(id);
      return { ok: true };
    },
    [memories, mode, scopes, people, user, replaceLocal, patchLocal, pushMockFeed, markChanged],
  );

  const approve = useCallback((id: string) => decide(id, "approve"), [decide]);
  const reject = useCallback((id: string) => decide(id, "reject"), [decide]);

  const restore = useCallback((m: Memory) => replaceLocal(m), [replaceLocal]);

  const updateMemory = useCallback(
    (id: string, patch: Partial<Memory>) => {
      // No PATCH route in the contract yet: local-only edits.
      patchLocal(id, patch);
    },
    [patchLocal],
  );

  const createMemory = useCallback(
    async (input: NewMemoryInput): Promise<ActionResult> => {
      if (mode === "live") {
        const { status, data } = await postJSON("/api/memories", headersRef.current, input);
        if (status === 403) return { ok: false, forbidden: true, error: errorText(data, "Your role can't write to that scope.") };
        if (status < 200 || status >= 300 || !data || typeof data !== "object") {
          return { ok: false, error: errorText(data, `Couldn't save the rule. The API returned ${status || "no response"}.`) };
        }
        const created = data as Memory;
        setMemories((ms) => [created, ...ms]);
        markChanged(created.id);
        return { ok: true, memory: created };
      }
      const slug =
        input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48) || `rule-${Date.now()}`;
      const now = new Date().toISOString();
      const created: Memory = {
        id: `mem-${slug}-${Date.now()}`,
        slug,
        scopeId: input.scopeId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        locked: !!input.locked,
        status: "active",
        source: "human",
        author: user?.id ?? "",
        evidence: [],
        alpha: input.locked ? 10 : 2,
        beta: 1,
        expiresAt: input.expiresAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      setMemories((ms) => [created, ...ms]);
      pushMockFeed({ type: "approval", actor: user?.id ?? "", text: `wrote ${input.locked ? "the locked rule" : "the rule"} [[${slug}]] for #${input.scopeId}`, memoryId: created.id });
      markChanged(created.id);
      return { ok: true, memory: created };
    },
    [mode, user, pushMockFeed, markChanged],
  );

  const memoryBySlug = useCallback((slug: string) => memories.find((m) => m.slug === slug), [memories]);

  const value: HivemindState = {
    mode,
    live,
    scopes,
    people,
    memories,
    feed,
    activity,
    metrics,
    evalDetail,
    metricsLive: live.metrics,
    user,
    role,
    setRole,
    headers,
    openId,
    openMemory,
    approve,
    reject,
    restore,
    updateMemory,
    createMemory,
    memoryBySlug,
    recentlyChanged,
    composerOpen,
    setComposerOpen,
    paletteOpen,
    setPaletteOpen,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHivemind() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHivemind must be used inside <HivemindProvider>");
  return v;
}
