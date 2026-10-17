import * as vscode from "vscode";
import { api, type ActivityItem } from "./api";
import { baseName, config, isCodeDoc, relPath, repoFor } from "./config";
import { log } from "./log";
import { openDashboard } from "./picker";

// Polls GET /api/activity/live every 3s. When another person's agent edited a file you have open in the last 10 min:
// one notification per (person, tool, file) + a subtle amber banner on the editor's top line.

const POLL_MS = 3000;
const IDLE_POLL_MS = 15000;
const WINDOW_MIN = 10;

const TOOL: Record<string, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  copilot: "Copilot",
  codex: "Codex",
  "claude-ai": "Claude",
  windsurf: "Windsurf",
  vscode: "VS Code",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const who = (a: ActivityItem) => `${cap(a.actor)}'s ${a.agent && TOOL[a.agent] ? `${TOOL[a.agent]} ` : ""}agent`;
function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m === 0 ? "just now" : `${m} min ago`;
}

const banner = vscode.window.createTextEditorDecorationType({
  isWholeLine: true,
  backgroundColor: "rgba(245, 165, 36, 0.07)",
  overviewRulerColor: "rgba(245, 165, 36, 0.8)",
  overviewRulerLane: vscode.OverviewRulerLane.Full,
  after: { color: "#F5A524", fontStyle: "italic", margin: "0 0 0 2.5em" },
});

const sameFile = (rel: string, file: string) => {
  const a = rel.toLowerCase();
  const b = file.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  return a === b || a.endsWith("/" + b) || b.endsWith("/" + a);
};
const sameRepo = (docRepo: string, itemRepo: string) => !itemRepo || !docRepo || docRepo.replace(/^repo\//, "") === itemRepo.replace(/^repo\//, "");

function openFileUris(): vscode.Uri[] {
  const out = new Map<string, vscode.Uri>();
  for (const g of vscode.window.tabGroups.all)
    for (const t of g.tabs) if (t.input instanceof vscode.TabInputText && t.input.uri.scheme === "file") out.set(t.input.uri.toString(), t.input.uri);
  for (const e of vscode.window.visibleTextEditors) if (isCodeDoc(e.document)) out.set(e.document.uri.toString(), e.document.uri);
  return [...out.values()];
}

export function registerCollisions(ctx: vscode.ExtensionContext) {
  const notified = new Map<string, number>(); // key → time notified
  let latest = new Map<string, ActivityItem>(); // uri → newest foreign edit
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const paint = () => {
    for (const ed of vscode.window.visibleTextEditors) {
      const a = latest.get(ed.document.uri.toString());
      if (!a || !config().collisionWarnings) {
        ed.setDecorations(banner, []);
        continue;
      }
      ed.setDecorations(banner, [
        {
          range: new vscode.Range(0, 0, 0, 0),
          renderOptions: { after: { contentText: `⚠ ${who(a)} edited this file ${ago(a.createdAt)}` } },
          hoverMessage: new vscode.MarkdownString(`**Hivemind** · ${who(a)} edited \`${a.file}\` ${ago(a.createdAt)}. Check before you both change the same lines.`),
        },
      ]);
    }
  };

  const poll = async () => {
    if (!config().collisionWarnings) {
      latest = new Map();
      return paint();
    }
    const live = await api.live();
    if (!live) return;
    const me = config().user;
    const since = Date.now() - WINDOW_MIN * 60000;
    const recent = live.items.filter((a) => a.actor && a.actor.toLowerCase() !== me && new Date(a.createdAt).getTime() >= since);
    const next = new Map<string, ActivityItem>();
    for (const uri of openFileUris()) {
      const rel = relPath(uri);
      const repo = repoFor(uri);
      const hit = recent.find((a) => sameFile(rel, a.file) && sameRepo(repo, a.repo)); // items are newest first
      if (!hit) continue;
      next.set(uri.toString(), hit);
      const key = `${hit.actor}|${hit.agent ?? ""}|${hit.file}`;
      const last = notified.get(key);
      if (last && Date.now() - last < WINDOW_MIN * 60000) continue;
      notified.set(key, Date.now());
      log(`collision: ${who(hit)} edited ${hit.file} (${hit.createdAt})`);
      void notify(hit, uri);
    }
    latest = next;
    paint();
  };

  const notify = async (a: ActivityItem, uri: vscode.Uri) => {
    const open = "Open file";
    const show = "Show activity";
    const isActive = vscode.window.activeTextEditor?.document.uri.toString() === uri.toString();
    const pick = await vscode.window.showWarningMessage(
      `${who(a)} edited ${baseName(a.file)} ${ago(a.createdAt)}. Check before you both change the same lines.`,
      ...(isActive ? [show] : [open, show]),
    );
    if (pick === open) void vscode.window.showTextDocument(uri);
    if (pick === show) openDashboard();
  };

  let busy = false;
  const loop = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await poll();
    } finally {
      busy = false;
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(loop, vscode.window.state.focused ? POLL_MS : IDLE_POLL_MS);
    }
  };

  // Share our own saves so other agents' hooks can warn about us (POST /api/activity).
  const onSave = (doc: vscode.TextDocument) => {
    const c = config();
    if (!c.shareActivity || !isCodeDoc(doc)) return;
    void api.activity({ sessionId: `vscode-${vscode.env.sessionId.slice(0, 8)}`, actor: c.user, repo: repoFor(doc.uri), file: relPath(doc.uri) });
  };

  ctx.subscriptions.push(
    banner,
    vscode.window.onDidChangeVisibleTextEditors(paint),
    vscode.workspace.onDidSaveTextDocument(onSave),
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused) {
        clearTimeout(timer);
        void loop();
      }
    }),
    { dispose: () => ((stopped = true), clearTimeout(timer)) },
  );
  void loop();
}
