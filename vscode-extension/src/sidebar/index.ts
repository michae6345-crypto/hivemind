import * as crypto from "crypto";
import * as vscode from "vscode";
import { config, isCodeDoc, relPath, repoFor } from "../config";
import { onRulesChanged, rulesFor } from "../rules";
import { hm, type Res } from "./http";

// Hivemind side panel (activity bar → Hivemind): rules by layer, "Here" (rules for the active file), your queue by
// role, a Teach box and the live feed. The webview (media/sidebar/) never sees the token: every API call is a
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

class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private people: Person[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private lastDoc?: vscode.TextDocument;
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

  /** Reveal the panel and open one rule's card (status bar, violation hovers, toasts). */
  async show(ruleId?: string) {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    if (!ruleId) return;
    const msg = { type: "detail", id: ruleId };
    if (this.view && this.ready) this.post(msg);
    else this.queued.push(msg);
  }

  /** Context the webview needs to render (no secrets). */
  private sendCtx() {
    const c = config();
    const workspaceName = vscode.workspace.getConfiguration("hivemind").get<string>("workspaceName") || "";
    this.post({ type: "ctx", me: this.me(), repo: this.repo(), workspaceName, dashboardUrl: c.dashboardUrl, hasToken: !!c.token });
  }

  setDoc(doc: vscode.TextDocument | undefined) {
    if (!doc || !isCodeDoc(doc)) return; // focusing the panel itself or an output pane keeps the last file
    const repoChanged = repoFor(doc.uri) !== this.repo();
    this.lastDoc = doc;
    if (repoChanged) this.sendCtx();
    void this.pushHere();
  }

  async pushHere(force = false) {
    if (!this.view) return;
    const doc = this.lastDoc;
    if (!doc) return this.post({ type: "here", file: null, data: null });
    const data = await rulesFor(doc, force);
    this.post({ type: "here", file: relPath(doc.uri), data });
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
            payload: { text: a.text, source: "vscode-sidebar", ...(doc ? { file: relPath(doc.uri) } : {}) },
          },
        });
      }
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
<div id="app"></div>
<script nonce="${nonce}" src="${uri("sidebar.js")}"></script>
</body>
</html>`;
}

const ruleIdOf = (a: unknown): string | undefined => {
  if (typeof a === "string") return a || undefined;
  const o = a as { ruleId?: string; id?: string } | undefined;
  return o?.ruleId ?? o?.id;
};

/** One-line registration from extension.ts. */
export function registerSidebar(ctx: vscode.ExtensionContext) {
  const provider = new SidebarProvider(ctx);
  provider.setDoc(vscode.window.activeTextEditor?.document);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.onDidChangeActiveTextEditor((e) => provider.setDoc(e?.document)),
    onRulesChanged(() => void provider.pushHere()),
    vscode.commands.registerCommand("hivemind.sidebar.refresh", () => provider.refresh()),
    // hivemind.focusSidebar([ruleId]) and hivemind.showRule(ruleId): open the panel, optionally on one rule's card.
    // ruleId = memory uuid or slug (VsRule.id / Violation.ruleId work as-is).
    vscode.commands.registerCommand("hivemind.focusSidebar", (id?: unknown) => provider.show(ruleIdOf(id))),
    vscode.commands.registerCommand("hivemind.showRule", (id?: unknown) => provider.show(ruleIdOf(id))),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("hivemind") && provider.refresh()),
  );
}
