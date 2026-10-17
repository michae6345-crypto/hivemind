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
import type {
  ActivityItem,
  FeedEvent,
  Memory,
  Metrics,
  Person,
  Role,
  Scope,
} from "@/mocks/types";

export type Selection =
  | { kind: "memory"; id: string }
  | { kind: "person"; id: string }
  | { kind: "scope"; id: string };

export const ROLE_USERS: { role: Role; userId: string; label: string }[] = [
  { role: "security", userId: "maya", label: "Security" },
  { role: "lead", userId: "jordan", label: "Data Pipelines Lead" },
  { role: "engineer", userId: "alex", label: "Engineer" },
];

type Mode = "mock" | "live";

interface HivemindState {
  mode: Mode;
  scopes: Scope[];
  people: Person[];
  memories: Memory[];
  feed: FeedEvent[];
  activity: ActivityItem[];
  metrics: Metrics;
  metricsLive: boolean;
  user: Person | undefined;
  role: Role;
  setRole: (role: Role) => void;
  selection: Selection | null;
  select: (s: Selection | null) => void;
  openTabs: string[]; // memory ids
  activeTab: string | null;
  openMemory: (id: string) => void;
  closeTab: (id: string) => void;
  approve: (id: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
  restore: (m: Memory) => void;
  updateMemory: (id: string, patch: Partial<Memory>) => Promise<void>;
  createMemory: (input: {
    scopeId: string;
    kind: Memory["kind"];
    title: string;
    body: string;
    locked?: boolean;
    expiresAt?: string | null;
  }) => Promise<Memory>;
  memoryBySlug: (slug: string) => Memory | undefined;
}

const Ctx = createContext<HivemindState | null>(null);

const API = process.env.NEXT_PUBLIC_HIVEMIND_API ?? "";
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

function feedFromMemories(memories: Memory[]): FeedEvent[] {
  // Live mode: derive a readable feed from memory state until /api exposes one.
  return memories
    .filter((m) => m.status !== "active" || Date.now() - new Date(m.updatedAt).getTime() < 3_600_000)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 12)
    .map((m) => ({
      id: `live-${m.id}`,
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

export function HivemindProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("mock");
  const [scopes, setScopes] = useState<Scope[]>(mock.scopes);
  const [people] = useState<Person[]>(mock.people);
  const [memories, setMemories] = useState<Memory[]>(mock.memories);
  const [feed, setFeed] = useState<FeedEvent[]>(mock.feed);
  const [activity, setActivity] = useState<ActivityItem[]>(mock.activity);
  const [metrics, setMetrics] = useState<Metrics>(mock.metrics);
  const [metricsLive, setMetricsLive] = useState(false);
  const [role, setRole] = useState<Role>("lead");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>(["mem-export-assert-single-customer", "mem-sec-lab-isolation"]);
  const [activeTab, setActiveTab] = useState<string | null>("mem-export-assert-single-customer");

  const user = useMemo(() => {
    const id = ROLE_USERS.find((r) => r.role === role)?.userId;
    return people.find((p) => p.id === id);
  }, [people, role]);

  const headers = useMemo(
    () => ({ "x-hm-role": role, "x-hm-user": user?.id ?? "" }),
    [role, user],
  );
  const headersRef = useRef(headers);
  useEffect(() => {
    headersRef.current = headers;
  }, [headers]);

  // Try the real API; fall back to mocks. Poll every 2s once live (PLAN.md §2).
  useEffect(() => {
    if (FORCE_MOCKS) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      const live = await poll();
      // 2s while the API answers; back off to 10s while it doesn't exist yet.
      if (!stop) timer = setTimeout(tick, live ? 2000 : 10_000);
    }
    async function poll(): Promise<boolean> {
      const [s, m] = await Promise.all([
        getJSON<Scope[]>("/api/scopes", headersRef.current),
        getJSON<Memory[]>("/api/memories", headersRef.current),
      ]);
      if (stop) return false;
      if (Array.isArray(s) && Array.isArray(m) && m.length > 0) {
        setMode("live");
        setScopes(s);
        setMemories(m);
        setFeed(feedFromMemories(m));
        const live = await getJSON<{ items?: ActivityItem[] } | ActivityItem[]>(
          "/api/activity/live",
          headersRef.current,
        );
        if (live) setActivity(Array.isArray(live) ? live : (live.items ?? []));
        const met = await getJSON<Metrics>("/api/metrics", headersRef.current);
        if (met && Array.isArray(met.curve) && met.curve.length > 0) {
          setMetrics(met);
          setMetricsLive(true);
        }
        return true;
      }
      return false;
    }
    tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const select = useCallback((s: Selection | null) => setSelection(s), []);

  const openMemory = useCallback((id: string) => {
    setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]));
    setActiveTab(id);
    setSelection({ kind: "memory", id });
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setOpenTabs((tabs) => {
        const next = tabs.filter((t) => t !== id);
        if (activeTab === id) setActiveTab(next.at(-1) ?? null);
        return next;
      });
    },
    [activeTab],
  );

  const patchLocal = useCallback((id: string, patch: Partial<Memory>) => {
    setMemories((ms) =>
      ms.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)),
    );
  }, []);

  const pushFeed = useCallback((e: Omit<FeedEvent, "id" | "at">) => {
    setFeed((f) => [{ ...e, id: `f-${Date.now()}`, at: new Date().toISOString() }, ...f].slice(0, 40));
  }, []);

  const approve = useCallback(
    async (id: string) => {
      const m = memories.find((x) => x.id === id);
      if (!m) return;
      if (mode === "live") {
        await fetch(`${API}/api/memories/${id}/approve`, { method: "POST", headers: headersRef.current });
      }
      patchLocal(id, { status: "active", alpha: m.alpha + 2 });
      pushFeed({ type: "approval", actor: user?.id ?? "", text: `approved [[${m.slug}]] for #${m.scopeId}`, memoryId: id });
    },
    [memories, mode, patchLocal, pushFeed, user],
  );

  const reject = useCallback(
    async (id: string) => {
      const m = memories.find((x) => x.id === id);
      if (!m) return;
      if (mode === "live") {
        await fetch(`${API}/api/memories/${id}/reject`, { method: "POST", headers: headersRef.current });
      }
      patchLocal(id, { status: "rejected" });
      pushFeed({ type: "rejection", actor: user?.id ?? "", text: `rejected [[${m.slug}]]`, memoryId: id });
    },
    [memories, mode, patchLocal, pushFeed, user],
  );

  const restore = useCallback((m: Memory) => {
    setMemories((ms) => ms.map((x) => (x.id === m.id ? m : x)));
  }, []);

  const updateMemory = useCallback(
    async (id: string, patch: Partial<Memory>) => {
      patchLocal(id, patch);
      // PATCH route isn't in the contract yet; local-only until it exists.
    },
    [patchLocal],
  );

  const createMemory = useCallback<HivemindState["createMemory"]>(
    async (input) => {
      const slug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48);
      if (mode === "live") {
        const res = await fetch(`${API}/api/memories`, {
          method: "POST",
          headers: { ...headersRef.current, "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (res.ok) {
          const created = (await res.json()) as Memory;
          setMemories((ms) => [created, ...ms]);
          return created;
        }
      }
      const now = new Date().toISOString();
      const created: Memory = {
        id: `mem-${slug}-${Date.now()}`,
        slug,
        scopeId: input.scopeId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        locked: !!input.locked,
        status: input.kind === "directive" && user?.role !== "engineer" ? "active" : "pending",
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
      pushFeed({ type: "approval", actor: user?.id ?? "", text: `wrote a ${input.kind} [[${slug}]] in #${input.scopeId}`, memoryId: created.id });
      return created;
    },
    [mode, pushFeed, user],
  );

  const memoryBySlug = useCallback(
    (slug: string) => memories.find((m) => m.slug === slug),
    [memories],
  );

  const value: HivemindState = {
    mode,
    scopes,
    people,
    memories,
    feed,
    activity,
    metrics,
    metricsLive,
    user,
    role,
    setRole,
    selection,
    select,
    openTabs,
    activeTab,
    openMemory,
    closeTab,
    approve,
    reject,
    restore,
    updateMemory,
    createMemory,
    memoryBySlug,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHivemind() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHivemind must be used inside <HivemindProvider>");
  return v;
}
