import * as vscode from "vscode";
import { api } from "../api";
import { config, isCodeDoc } from "../config";
import { log } from "../log";
import { peekRules, rulesFor } from "../rules";
import { fire } from "./events";
import { hmToast } from "./toast";
import { approvedText, capturedText } from "./words";

// Watches the live feed (GET /api/activity/live) for the current user's lessons:
// - approved → the celebration: agent I's sidebar seal (hivemind.sidebar.celebrate), agent H's status-bar flash
//   (hivemind.statusFlash), and the toast `@jordan approved your lesson "…". Every agent on #… gets it next session.`
// - captured (a correction you gave Claude Code / Cursor… became a pending lesson) → `Your correction is now a lesson.
//   Waiting on @jordan.` Not for lessons taught inside VS Code: the sidebar's Teach box says that inline.

type FeedItem = { id: string; actor: string; at: string; type: string; memoryId?: string; text?: string; agent?: string };
const POLL_MS = 5000;
const IDLE_POLL_MS = 20000;

const slugOf = (f: FeedItem) => f.text?.match(/\[\[([^\]]+)\]\]/)?.[1];
const humanize = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

async function runIf(command: string, ...args: unknown[]) {
  if ((await vscode.commands.getCommands(true)).includes(command)) void vscode.commands.executeCommand(command, ...args);
}

export function registerCelebrate(ctx: vscode.ExtensionContext) {
  let seen: Set<string> | null = null; // feed ids already handled (the first poll is the baseline)
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const rulesNow = async () => {
    const doc = vscode.window.activeTextEditor?.document;
    return doc && isCodeDoc(doc) ? ((await rulesFor(doc, true)) ?? peekRules(doc)) : null;
  };

  const approved = async (f: FeedItem, feed: FeedItem[], me: string) => {
    const data = await rulesNow();
    const rule = data?.rules.find((r) => r.id === f.memoryId);
    const slug = slugOf(f);
    const title = rule?.title ?? (slug ? humanize(slug) : "your lesson");
    const scope = rule?.scopeId ?? f.text?.match(/#([\w/-]+)/)?.[1];
    const approver =
      feed.find((x) => x.type === "approval" && x.memoryId === f.memoryId && x.id.startsWith("ev-") && x.actor?.toLowerCase() !== me)?.actor ??
      data?.approver?.id ??
      "your lead";
    const e = { ruleId: f.memoryId!, title, approver: approver.startsWith("@") ? approver : `@${approver}`, scope };
    log(`buddy: ${e.approver} approved ${title}`);
    fire.approved(e);
    void runIf("hivemind.sidebar.celebrate", e);
    void runIf("hivemind.statusFlash");
    const pick = await hmToast("approved", approvedText(approver, title, scope), "Show rule");
    if (pick) void vscode.commands.executeCommand("hivemind.showRule", e.ruleId);
  };

  const captured = async (feed: FeedItem[], me: string) => {
    const recent = Date.now() - 2 * 60000;
    const fromVsCode = feed.some((x) => x.type === "correction" && x.actor?.toLowerCase() === me && x.agent === "vscode" && new Date(x.at).getTime() >= recent);
    if (fromVsCode) return;
    const data = await rulesNow();
    await hmToast("captured", capturedText(data?.approver?.id));
  };

  const poll = async () => {
    const live = (await api.live()) as ({ feed?: FeedItem[] } & object) | null;
    if (!live?.feed) return;
    const me = config().user;
    const mine = live.feed.filter((f) => f.id.startsWith("mem-") && f.memoryId && f.actor?.toLowerCase() === me);
    if (!seen) {
      seen = new Set(mine.map((f) => f.id));
      return;
    }
    for (const f of mine) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      if (f.type === "approval" && f.id.endsWith("-active")) await approved(f, live.feed, me);
      else if (f.id.endsWith("-pending")) await captured(live.feed, me);
    }
  };

  const loop = async () => {
    if (stopped) return;
    try {
      await poll();
    } finally {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(loop, vscode.window.state.focused ? POLL_MS : IDLE_POLL_MS);
    }
  };
  ctx.subscriptions.push({ dispose: () => ((stopped = true), clearTimeout(timer)) });
  void loop();
}
