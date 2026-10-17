import { config } from "./config";
import { log } from "./log";
import type { CheckRequest, CheckResponse, CompleteRequest, CompleteResponse, RulesResponse } from "./types";

// Thin client for the Hivemind server. Every call sends the bearer token + x-hm-agent: vscode and never throws:
// failures resolve to null so the editor stays quiet.

export type ActivityItem = {
  id: string;
  sessionId: string;
  actor: string;
  repo: string; // short name, e.g. "export-service"
  file: string;
  createdAt: string;
  warning?: string;
  agent?: string;
};
export type LiveResponse = { items: ActivityItem[] };
export type EventResult = {
  id: string;
  lessons: { id: string; title: string; status: string; slug?: string; blockedReason?: string | null; scopeId?: string }[];
};

let online: boolean | null = null;
const listeners = new Set<(on: boolean) => void>();
export const onOnlineChange = (fn: (on: boolean) => void) => (listeners.add(fn), { dispose: () => listeners.delete(fn) });
export const isOnline = () => online;
function setOnline(on: boolean) {
  if (on === online) return;
  online = on;
  listeners.forEach((fn) => fn(on));
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 5000, signal?: AbortSignal): Promise<T | null> {
  const c = config();
  const headers: Record<string, string> = { "x-hm-agent": "vscode", "x-hm-user": c.user };
  if (c.token) headers.authorization = `Bearer ${c.token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(c.apiUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? anySignal([signal, timeout]) : timeout,
    });
    setOnline(true);
    if (!res.ok) {
      log(`${method} ${path} → ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    const aborted = signal?.aborted;
    if (!aborted) {
      log(`${method} ${path} failed: ${e instanceof Error ? e.message : String(e)}`);
      if (!timeout.aborted) setOnline(false);
    }
    return null;
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const ctl = new AbortController();
  for (const s of signals) {
    if (s.aborted) return ctl.abort(), ctl.signal;
    s.addEventListener("abort", () => ctl.abort(), { once: true });
  }
  return ctl.signal;
}

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export const api = {
  rules: (repo: string, file: string) => call<RulesResponse>("GET", `/api/vscode/rules?${q({ repo, file, user: config().user })}`),
  check: (req: CheckRequest) => call<CheckResponse>("POST", "/api/vscode/check", req, 12000),
  complete: (req: CompleteRequest, signal?: AbortSignal) => call<CompleteResponse>("POST", "/api/vscode/complete", req, 2500, signal),
  live: () => call<LiveResponse>("GET", "/api/activity/live", undefined, 4000),
  activity: (body: { sessionId: string; actor: string; repo: string; file: string }) =>
    call<{ warnings: string[] }>("POST", "/api/activity", body, 4000),
  event: (body: { type: "correction"; actor: string; sessionId: string; repo: string; payload: Record<string, unknown> }) =>
    call<EventResult>("POST", "/api/events", body, 20000),
};
