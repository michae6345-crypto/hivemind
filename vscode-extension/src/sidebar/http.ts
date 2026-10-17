import { config } from "../config";
import { log } from "../log";

// Sidebar calls need the status code and the server's { error } text (403 → "You can't approve this"), which the
// shared api.ts client folds into null. Same headers: bearer token + x-hm-agent: vscode + x-hm-user.

export type Res<T = unknown> = { ok: boolean; status: number; data?: T; error?: string };

export async function hm<T = unknown>(
  method: "GET" | "POST",
  path: string,
  opts: { body?: unknown; user?: string; role?: string; timeoutMs?: number } = {},
): Promise<Res<T>> {
  const c = config();
  const headers: Record<string, string> = { "x-hm-agent": "vscode", "x-hm-user": opts.user ?? c.user };
  if (opts.role) headers["x-hm-role"] = opts.role;
  if (c.token) headers.authorization = `Bearer ${c.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  try {
    const res = await fetch(c.apiUrl + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 6000),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    if (!res.ok) {
      const error = (data as { error?: string } | undefined)?.error ?? (text.slice(0, 200) || res.statusText);
      log(`sidebar ${method} ${path} → ${res.status} ${error}`);
      return { ok: false, status: res.status, error };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`sidebar ${method} ${path} failed: ${error}`);
    return { ok: false, status: 0, error: `Can't reach ${c.apiUrl}` };
  }
}
