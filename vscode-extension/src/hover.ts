import * as vscode from "vscode";
import { config, isCodeDoc } from "./config";
import { violationRange } from "./decorations";
import { violationsFor } from "./diagnostics";
import { rulesFor, symbolsIn } from "./rules";
import type { Violation, VsRule } from "./types";
import { ago, at, plain } from "./wording";

// The one Hivemind hover card (editor-spec.md §2c), on a violation range or on a symbol a rule names:
//   LOCKED RULE · #org                                       (rose caps; honey "TEAM LESSON" for lessons)
//   **Never mix data from different lab customers**
//   Set by @maya · Head of Security · locked 14 Oct          (provenance from learnedVia)
//   ---
//   "the evidence, verbatim"                                 (hand-written rules: the rule text)
//   ---
//   Fix: add assertSingleCustomer(rows) · Show in sidebar · Open in Hivemind
// The "Approved by … · n agents have used it" / "Reaches every agent" line needs served-to data the API doesn't
// have yet, so it's left out rather than faked (spec: "drop the line; don't fake it"). Max 2 cards.

const KIND = { locked: { label: "LOCKED RULE", color: "#FB7185" }, lesson: { label: "TEAM LESSON", color: "#F5A524" } };
const LAYER: Record<string, string> = { org: "#E4E4E7", team: "#8B93FF", repo: "#2DD4BF", personal: "#A1A1AA" };
const LINK = "#7C93FA";

const esc = (s: string) => s.replace(/[\\*_[\]<>`#|]/g, (c) => "\\" + c);
const span = (text: string, color: string, bg?: string) =>
  `<span style="color:${color};${bg ? `background-color:${bg};` : ""}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`;
const chip = (scope: string) => {
  const c = LAYER[scope.split("/")[0]] ?? LAYER.org;
  return span(` #${scope} `, "#E4E4E7", `${c}22`);
};
const link = (label: string, cmd: string, args: unknown[]) => `[${span(label, LINK)}](command:${cmd}?${encodeURIComponent(JSON.stringify(args))})`;
const dayMonth = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Spec provenance line: correction → "Learned from …", locked → "Set by @maya · Head of Security · locked 14 Oct", else "Written by …". */
function provenance(r: VsRule): string {
  const who = at(r.handle ?? r.ownerId);
  if (r.locked) return [`Set by ${who}`, r.ownerTitle, `locked ${dayMonth(r.taughtAt)}`].filter(Boolean).join(" · ");
  const v = r.learnedVia;
  if (v?.kind === "correction") return `Learned from ${at(v.by)}'s correction · ${ago(v.at)}`;
  if (v?.kind === "review") return `Learned from ${at(v.by)}'s code review · ${ago(v.at)}`;
  return `Written by ${who} · ${ago(v?.at ?? r.taughtAt)}`;
}

function card(r: VsRule, v?: Violation, uri?: vscode.Uri): string {
  const k = r.locked ? KIND.locked : KIND.lesson;
  const head = [`${span(k.label, k.color)} · ${chip(r.scopeId)}`, "", `**${esc(plain(r.title))}**`, "", span(provenance(r), "#A1A1AA")].join("\n");
  const quote = r.quote ? `"${plain(r.quote)}"` : plain(r.summary);
  const links = [
    v?.fix && uri ? link(v.fix.title, "hivemind.applyFix", [uri.toString(), v.ruleSlug, v.startLine]) : "",
    link("Show in sidebar", "hivemind.focusSidebar", [r.id]),
    `[${span("Open in Hivemind", LINK)}](${config().dashboardUrl}/)`,
  ].filter(Boolean);
  return [head, "\n---\n", `*${esc(quote)}*`, "\n---\n", links.join(" &nbsp;·&nbsp; ")].join("\n");
}

/** Card for a violation whose rule isn't in the cached list (e.g. just approved): built from the violation itself. */
const ruleFromViolation = (v: Violation): VsRule => ({
  id: v.ruleId, slug: v.ruleSlug, title: v.ruleTitle, summary: v.message, scopeId: "org", kind: "lesson", locked: v.locked,
  status: "active", owner: v.owner, handle: v.owner, ownerId: v.owner.replace(/^@/, ""), ownerFirst: "", ownerRole: "", ownerTitle: "",
  taughtAt: "", learnedFrom: null, learnedVia: null, quote: null, evidenceCount: 0, confidence: 1, mentionsFile: false, symbols: [],
});

class RulesHover implements vscode.HoverProvider {
  async provideHover(doc: vscode.TextDocument, pos: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
    if (!isCodeDoc(doc)) return;
    const data = await rulesFor(doc);
    if (token.isCancellationRequested) return;
    const rules = data?.rules ?? [];
    const byId = (id: string, slug?: string) => rules.find((r) => r.id === id || r.slug === slug);

    const cards: { r: VsRule; v?: Violation }[] = [];
    let anchor: vscode.Range | undefined;
    // 1) violations under the cursor (locked first)
    const vs = violationsFor(doc.uri)
      .filter((v) => violationRange(doc, v).contains(pos))
      .sort((a, b) => Number(b.locked) - Number(a.locked));
    for (const v of vs) {
      if (cards.some((c) => c.r.id === v.ruleId)) continue;
      cards.push({ r: byId(v.ruleId, v.ruleSlug) ?? ruleFromViolation(v), v });
      anchor ??= violationRange(doc, v);
    }
    // 2) otherwise a symbol a rule names (assertSingleCustomer, console.log, logger…)
    if (!cards.length) {
      const word = doc.getWordRangeAtPosition(pos, /[\w$.]+/);
      if (!word) return;
      const w = doc.getText(word);
      const line = doc.lineAt(pos.line).text;
      for (const r of rules) {
        if (r.kind === "owner") continue;
        if (symbolsIn(r, line).some((s) => w === s || w.startsWith(s + ".") || s.endsWith("." + w) || s.startsWith(w + "."))) cards.push({ r });
      }
      anchor = word;
    }
    if (!cards.length) return;

    const md = new vscode.MarkdownString(cards.slice(0, 2).map((c) => card(c.r, c.v, doc.uri)).join("\n\n---\n\n"));
    md.supportHtml = true;
    md.isTrusted = { enabledCommands: ["hivemind.applyFix", "hivemind.focusSidebar"] };
    return new vscode.Hover(md, anchor);
  }
}

/** Fix link (hover) and the buddy's "Fix it" toast: apply the server's quick fix for (uri, rule, line). */
export async function applyFix(uriStr: string, slug: string, line: number) {
  const uri = vscode.Uri.parse(uriStr);
  const doc = await vscode.workspace.openTextDocument(uri);
  const v = violationsFor(uri).find((x) => x.ruleSlug === slug && x.startLine === line && x.fix) ?? violationsFor(uri).find((x) => x.ruleSlug === slug && x.fix);
  const f = v?.fix;
  if (!f) return;
  const edit = new vscode.WorkspaceEdit();
  if (f.kind === "insertBefore") edit.insert(uri, new vscode.Position(Math.min(f.line, doc.lineCount), 0), f.text + "\n");
  else {
    const end = Math.min(f.endLine ?? f.line, doc.lineCount - 1);
    edit.replace(uri, new vscode.Range(f.line, 0, end, doc.lineAt(end).text.length), f.text);
  }
  await vscode.workspace.applyEdit(edit);
}

export function registerHover(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: "file" }, new RulesHover()),
    vscode.commands.registerCommand("hivemind.applyFix", applyFix),
  );
}
