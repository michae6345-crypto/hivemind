import * as crypto from "crypto";
import * as vscode from "vscode";
import { config, isCodeDoc, relPath, repoFor } from "../config";
import { onViolationsChanged, violationsFor } from "../diagnostics";
import { onRulesChanged, peekRules, rulesFor, symbolsIn } from "../rules";
import type { VsRule } from "../types";
import { hm, type Res } from "./http";

// Hivemind side panel (activity bar → Hivemind), built to public/brand/vscode/editor-spec.md §2d: Here (rules for
// the open file and cursor), All rules (by layer), Approvals (by role), activity feed, Teach box, and the
// "lesson approved" celebration. The webview (media/sidebar/) never sees the token: every API call is a
// postMessage to this host, which calls the server with the user's settings.

const VIEW_ID = "hivemind.sidebar";
const VIEW_AS = "hivemind.sidebar.viewAs";
const LIVE_MS = 3000;

type Person = { id: string; name: string; role: "security" | "lead" | "engineer"; scopeId: string; title: string };
type Msg =
  | { type: "ready" }
  | { type: "rpc"; id: number; op: string; args?: Record<string, string> }
  | { type: "open"; url: string }
  | { type: "dashboard"; path?: string }
  | { type: "settings" };
export type Celebrate = { ruleId?: string; title?: string; approver?: string; scope?: string };

/** A rule as the Here tab shows it: the server's VsRule plus where it shows up in the open file (1-based lines). */
type HereRule = Pick<VsRule, "id" | "slug" | "title" | "scopeId" | "kind" | "locked" | "handle" | "ownerId" | "ownerRole" | "taughtAt" | "learnedVia" | "symbols"> & {
  lines: number[];
  violated: boolean;
  atCursor: boolean;
};

class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private people: Person[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private lastDoc?: vscode.TextDocument;
  private cursorLine = 0; // 0-based
  private ready = false;
  private queued: unknown[] = [];

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  me(): string {
    return this.ctx.globalState.get<string>(VIEW_AS) || config().user;
  }
  private role(): string | undefined {
    return this.people.find((p) => p.id === this.me())?.role;
  }
  private repo(): string {
    return repoFor(this.lastDoc?.uri);
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    const media = vscode.Uri.joinPath(this.ctx.extensionUri, "media", "sidebar");
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = html(view.webview, media);
    view.webview.onDidReceiveMessage((m: Msg) => void this.onMessage(m));
    view.onDidChangeVisibility(() => this.poll());
    view.onDidDispose(() => {
      this.view = undefined;
      this.ready = false;
      this.poll();
    });
    this.poll();
  }

  private post(msg: unknown) {
    void this.view?.webview.postMessage(msg);
  }
  private postWhenReady(msg: unknown) {
    if (this.view && this.ready) this.post(msg);
    else this.queued.push(msg);
  }

  /** Reveal the panel and open one rule's card (status bar, violation hovers, toasts). */
  async show(ruleId?: string) {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    if (ruleId) this.postWhenReady({ type: "detail", id: ruleId });
  }

  /** §2g: the honey hex seal. Plays only if the panel is open; the toast + status flip cover the rest. */
  celebrate(c: Celebrate) {
    if (!c.ruleId && !c.title) return;
    if (this.view?.visible && this.ready) this.post({ type: "celebrate", ...c });
  }

  /** Context the webview needs to render (no secrets). */
  private sendCtx() {
    const c = config();
    const workspaceName = vscode.workspace.getConfiguration("hivemind").get<string>("workspaceName") || "";
    this.post({ type: "ctx", me: this.me(), repo: this.repo(), workspaceName, dashboardUrl: c.dashboardUrl, apiUrl: c.apiUrl });
  }

  setDoc(doc: vscode.TextDocument | undefined) {
    if (!doc || !isCodeDoc(doc)) return; // focusing the panel itself or an output pane keeps the last file
    const repoChanged = repoFor(doc.uri) !== this.repo();
    if (doc !== this.lastDoc) this.cursorLine = vscode.window.activeTextEditor?.document === doc ? vscode.window.activeTextEditor.selection.active.line : 0;
    this.lastDoc = doc;
    if (repoChanged) this.sendCtx();
    void this.pushHere();
  }

  setCursor(e: vscode.TextEditorSelectionChangeEvent) {
    if (e.textEditor.document !== this.lastDoc) return;
    const line = e.selections[0]?.active.line ?? 0;
    if (line === this.cursorLine) return;
    this.cursorLine = line;
    void this.pushHere();
  }

  async pushHere(force = false) {
    if (!this.view) return;
    const doc = this.lastDoc;
    if (!doc) return this.post({ type: "here", file: null });
    const data = force ? await rulesFor(doc, true) : peekRules(doc) ?? (await rulesFor(doc));
    const cur = this.cursorLine + 1;
    const viol = violationsFor(doc.uri);
    const rules: HereRule[] = [];
    for (const r of data?.rules ?? []) {
      if (r.kind === "owner") continue;
      const lines = new Set<number>();
      for (const v of viol) if (v.ruleId === r.id) lines.add(v.startLine + 1);
      if (r.symbols.length)
        for (let i = 0; i < doc.lineCount; i++) if (symbolsIn(r, doc.lineAt(i).text).length) lines.add(i + 1);
      const violated = viol.some((v) => v.ruleId === r.id);
      if (!violated && !lines.size && !r.mentionsFile) continue;
      const sorted = [...lines].sort((a, b) => a - b);
      rules.push({
        id: r.id, slug: r.slug, title: r.title, scopeId: r.scopeId, kind: r.kind, locked: r.locked, handle: r.handle,
        ownerId: r.ownerId, ownerRole: r.ownerRole, taughtAt: r.taughtAt, learnedVia: r.learnedVia, symbols: r.symbols,
        lines: sorted, violated, atCursor: sorted.includes(cur),
      });
    }
    const dist = (r: HereRule) => (r.lines.length ? Math.min(...r.lines.map((l) => Math.abs(l - cur))) : 1e6);
    rules.sort((a, b) => +b.atCursor - +a.atCursor || +b.violated - +a.violated || +b.locked - +a.locked || dist(a) - dist(b));
    this.post({
      type: "here",
      file: relPath(doc.uri),
      line: cur,
      ok: !!data,
      org: data?.org ?? "",
      repo: data?.repo ?? this.repo(),
      approver: data?.approver?.id ?? null,
      rules,
    });
  }

  /** Select a rule's range in the editor: the violation's exact columns, else the first symbol on that line. */
  private async reveal(ruleId: string, line?: number) {
    const doc = this.lastDoc;
    if (!doc) return;
    const r = peekRules(doc)?.rules.find((x) => x.id === ruleId || x.slug === ruleId);
    const v = violationsFor(doc.uri).find((x) => x.ruleId === r?.id && (line === undefined || x.startLine === line - 1));
    let range: vscode.Range | undefined;
    if (v) {
      const end = doc.lineAt(Math.min(v.endLine, doc.lineCount - 1));
      const start = doc.lineAt(v.startLine);
      range = new vscode.Range(v.startLine, v.startCol ?? start.firstNonWhitespaceCharacterIndex, end.lineNumber, v.endCol ?? end.text.length);
    } else if (r) {
      const lines = line !== undefined ? [line - 1] : [...Array(doc.lineCount).keys()];
      for (const i of lines) {
        const text = doc.lineAt(i).text;
        const sym = symbolsIn(r, text)[0];
        if (sym) {
          const at = text.indexOf(sym);
          range = new vscode.Range(i, at, i, at + sym.length);
          break;
        }
      }
    }
    if (!range && line !== undefined) range = doc.lineAt(Math.min(line - 1, doc.lineCount - 1)).range;
    if (!range) return;
    await vscode.window.showTextDocument(doc, { selection: range, preserveFocus: false });
  }

  private poll() {
    const want = !!this.view?.visible;
    if (want && !this.timer) {
      const tick = async () => {
        const r = await hm("GET", "/api/activity/live", { timeoutMs: 4000 });
        this.post({ type: "live", ok: r.ok, data: r.data, error: r.error });
      };
      void tick();
      this.timer = setInterval(tick, LIVE_MS);
    } else if (!want && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  refresh() {
    this.sendCtx();
    this.post({ type: "reload" });
    void this.pushHere(true);
  }

  private async onMessage(m: Msg) {
    if (m.type === "ready") {
      this.lastDoc ??= vscode.window.activeTextEditor?.document;
      this.ready = true;
      this.sendCtx();
      this.queued.splice(0).forEach((q) => this.post(q));
      return void this.pushHere();
    }
    if (m.type === "open") return void vscode.env.openExternal(vscode.Uri.parse(m.url));
    if (m.type === "dashboard") return void vscode.env.openExternal(vscode.Uri.parse(config().dashboardUrl + (m.path ?? "/app")));
    if (m.type === "settings") return void vscode.commands.executeCommand("workbench.action.openSettings", "hivemind");
    if (m.type !== "rpc") return;
    const res = await this.rpc(m.op, m.args ?? {}).catch((e): Res => ({ ok: false, status: 0, error: String(e) }));
    this.post({ type: "rpc", id: m.id, ...res });
  }

  private async rpc(op: string, a: Record<string, string>): Promise<Res> {
    const enc = encodeURIComponent;
    switch (op) {
      case "load": {
        const repo = this.repo();
        const [scopes, chain, all, metrics] = await Promise.all([
          hm<{ scopes: unknown[]; people: Person[] }>("GET", "/api/scopes"),
          repo ? hm<{ memories: unknown[] }>("GET", `/api/memories?scope=${enc(repo)}&chain=1`) : Promise.resolve(null),
          hm<{ memories: unknown[] }>("GET", "/api/memories?status=pending,active,blocked,rejected"),
          hm<{ transfer?: unknown[] }>("GET", "/api/metrics", { timeoutMs: 8000 }),
        ]);
        if (!scopes.ok) return scopes;
        this.people = scopes.data?.people ?? [];
        return {
          ok: true,
          status: 200,
          data: {
            scopes: scopes.data?.scopes ?? [],
            people: this.people,
            chain: chain?.ok ? chain.data?.memories ?? [] : null,
            all: all.ok ? all.data?.memories ?? [] : [],
            transfer: metrics.ok ? metrics.data?.transfer ?? [] : [],
          },
        };
      }
      case "approve":
      case "reject":
        return hm("POST", `/api/memories/${enc(a.id)}/${op}`, { user: this.me(), role: this.role(), timeoutMs: 15000 });
      case "lock":
        return hm("POST", "/api/memories", {
          user: this.me(),
          role: this.role(),
          body: { scopeId: a.scopeId, kind: "directive", title: a.title, body: a.body || a.title, locked: true },
        });
      case "teach": {
        const doc = this.lastDoc;
        return hm("POST", "/api/events", {
          user: this.me(),
          timeoutMs: 30000,
          body: {
            type: "correction",
            actor: this.me(),
            sessionId: `vscode-${vscode.env.sessionId.slice(0, 8)}`,
            repo: this.repo() || undefined,
            // the engine reads payload.scope: "team…" files the lesson on the team, anything else on the repo
            payload: { text: a.text, source: "vscode-sidebar", scope: a.scope || undefined, ...(doc ? { file: relPath(doc.uri) } : {}) },
          },
        });
      }
      case "reveal":
        await this.reveal(a.id, a.line ? Number(a.line) : undefined);
        return { ok: true, status: 200 };
      case "viewAs":
        await this.ctx.globalState.update(VIEW_AS, a.id && a.id !== config().user ? a.id : undefined);
        this.sendCtx();
        return { ok: true, status: 200 };
      case "here":
        await this.pushHere(true);
        return { ok: true, status: 200 };
      default:
        return { ok: false, status: 400, error: `unknown op ${op}` };
    }
  }
}

function html(webview: vscode.Webview, media: vscode.Uri): string {
  const nonce = crypto.randomBytes(16).toString("base64");
  const uri = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(media, f)).toString();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${uri("sidebar.css")}">
<title>Hivemind</title>
</head>
<body>
<div class="hm" id="app"></div>
<script nonce="${nonce}" src="${uri("sidebar.js")}"></script>
</body>
</html>`;
}

const ruleIdOf = (a: unknown): string | undefined => {
  if (typeof a === "string") return a || undefined;
  const o = a as { ruleId?: string; id?: string } | undefined;
  return o?.ruleId ?? o?.id;
};
const celebrationOf = (a: unknown): Celebrate => (typeof a === "string" ? { ruleId: a } : ((a ?? {}) as Celebrate));

/** One-line registration from extension.ts. */
export function registerSidebar(ctx: vscode.ExtensionContext) {
  const provider = new SidebarProvider(ctx);
  provider.setDoc(vscode.window.activeTextEditor?.document);
  let cursorTimer: ReturnType<typeof setTimeout> | undefined;
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.onDidChangeActiveTextEditor((e) => provider.setDoc(e?.document)),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => provider.setCursor(e), 200);
    }),
    onRulesChanged(() => void provider.pushHere()),
    onViolationsChanged(() => void provider.pushHere()),
    vscode.commands.registerCommand("hivemind.sidebar.refresh", () => provider.refresh()),
    // hivemind.focusSidebar([ruleId]) and hivemind.showRule(ruleId): open the panel, optionally on one rule's card.
    // ruleId = memory uuid or slug (VsRule.id / Violation.ruleId work as-is).
    vscode.commands.registerCommand("hivemind.focusSidebar", (id?: unknown) => provider.show(ruleIdOf(id))),
    vscode.commands.registerCommand("hivemind.showRule", (id?: unknown) => provider.show(ruleIdOf(id))),
    // Lesson-approved celebration: { ruleId, title?, approver?: "@jordan", scope?: "team/data-pipelines" } or a bare ruleId.
    vscode.commands.registerCommand("hivemind.sidebar.celebrate", (c?: unknown) => provider.celebrate(celebrationOf(c))),
    vscode.commands.registerCommand("hivemind.celebrate", (c?: unknown) => provider.celebrate(celebrationOf(c))),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("hivemind") && provider.refresh()),
  );
}
