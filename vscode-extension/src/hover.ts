import * as vscode from "vscode";
import { isCodeDoc } from "./config";
import { peekRules, provenance, symbolsIn } from "./rules";
import type { VsRule } from "./types";

// Hover on a line that uses a symbol a team rule names (assertSingleCustomer, console.log, logger…).
// Title: the lesson title. Body: `{Person} taught this on {date}. Applies to #{scope}.`
class RulesHover implements vscode.HoverProvider {
  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    if (!isCodeDoc(doc)) return;
    const data = peekRules(doc);
    if (!data) return;
    const line = doc.lineAt(pos.line).text;
    const hits = data.rules.filter((r) => r.kind !== "owner" && symbolsIn(r, line).length > 0).slice(0, 3);
    if (!hits.length) return;

    // Anchor the hover on the matched symbol under the cursor when there is one, else the whole line.
    const word = doc.getWordRangeAtPosition(pos, /[\w$.]+/);
    const w = word ? doc.getText(word) : "";
    const onSymbol = hits.some((r) => r.symbols.some((s) => w === s || w.startsWith(s + ".") || s.endsWith("." + w) || s.startsWith(w + ".")));
    if (!onSymbol) return;

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: ["hivemind.openDashboard", "hivemind.showRuleList"] };
    hits.forEach((r, i) => {
      if (i) md.appendMarkdown("\n\n---\n\n");
      md.appendMarkdown(card(r));
    });
    const ids = encodeURIComponent(JSON.stringify([hits.map((r) => r.id), "Team rules on this line"]));
    md.appendMarkdown(`\n\n[$(list-unordered) All rules](command:hivemind.showRuleList?${ids}) · [$(link-external) Open in Hivemind](command:hivemind.openDashboard)`);
    return new vscode.Hover(md, word);
  }
}

const mdEsc = (s: string) => s.replace(/[\\*_[\]<>]/g, (c) => "\\" + c);

function card(r: VsRule): string {
  const head = `${r.locked ? "🔒 " : "⬡ "}**${mdEsc(r.title)}**`;
  const lines = [head, "", provenance(r)];
  if (r.summary && r.summary !== r.title) lines.push("", `> ${r.summary.replace(/\n/g, " ")}`);
  if (r.learnedFrom) lines.push("", `_${mdEsc(r.learnedFrom)}_`);
  return lines.join("\n");
}

export function registerHover(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: "file" }, new RulesHover()));
}
