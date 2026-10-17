import * as vscode from "vscode";
import { api, type ActivityItem } from "./api";
import { fire } from "./buddy/events";
import { hmToast } from "./buddy/toast";
import { agentOf, ago } from "./buddy/words";
import { baseName, config, isCodeDoc, relPath, repoFor } from "./config";
import { log } from "./log";

// Polls GET /api/activity/live every 3s. When another person's agent edited a file you have open in the last 10 min:
// one toast per (person, tool, file) through the buddy's 2-minute gate, and the collision line on top of the file
// (fired as onCollision; agent H's decorations paint it in honey).

const POLL_MS = 3000;
const IDLE_POLL_MS = 15000;
const WINDOW_MIN = 10;

const who = (a: ActivityItem) => agentOf(a); // "@adrian's Cursor agent"


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

  const shown = new Map<string, string>(); // uri → collision line currently fired
  const dismissed = new Set<string>(); // "uri|activity id" the user already opened via "Show change"
  const paint = () => {
    const next = new Map<string, string>();
    if (config().collisionWarnings)
      for (const [uri, a] of latest) if (!dismissed.has(`${uri}|${a.id}`)) next.set(uri, `${who(a)} edited this file ${ago(a.createdAt)}`);
    for (const [uri, text] of next) if (shown.get(uri) !== text) fire.collision({ uri: vscode.Uri.parse(uri), text });
    for (const uri of shown.keys()) if (!next.has(uri)) fire.collision({ uri: vscode.Uri.parse(uri), text: null });
    shown.clear();
    next.forEach((t, u) => shown.set(u, t));
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
    const pick = await hmToast(
      "collision",
      `${who(a)} edited ${baseName(a.file)} ${ago(a.createdAt)}. Check before you both change the same lines.`,
      "Show change",
    );
    if (pick !== "Show change") return;
    dismissed.add(`${uri.toString()}|${a.id}`);
    paint();
    await vscode.window.showTextDocument(uri, { preview: false });
    void vscode.commands.executeCommand("hivemind.focusSidebar");
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
  /** For tests: the foreign edit currently flagged per open file. */
  return () => new Map([...latest].map(([uri, a]) => [uri, `${who(a)} edited ${baseName(a.file)} ${ago(a.createdAt)}`]));
}
