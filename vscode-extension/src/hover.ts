import * as vscode from "vscode";
import { isCodeDoc } from "./config";
import { rulesFor, symbolsIn } from "./rules";
import type { VsRule } from "./types";
import { kindLine, plain, provenance } from "./wording";

// Hover on a symbol a team rule names (assertSingleCustomer, console.log, logger…), outside violations:
//   **Use logger, not console.log**
//   lesson · #org
//   rule text
//   Learned from @alex's correction · 3h ago · View source
// Inside a Hivemind diagnostic range the buddy's violation hover (src/buddy) owns the card, so this stays silent.
class RulesHover implements vscode.HoverProvider {
  async provideHover(doc: vscode.TextDocument, pos: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | undefined> {
    if (!isCodeDoc(doc)) return;
    if (vscode.languages.getDiagnostics(doc.uri).some((d) => d.source === "Hivemind" && d.range.contains(pos))) return;
    const word = doc.getWordRangeAtPosition(pos, /[\w$.]+/);
    if (!word) return;
    const data = await rulesFor(doc);
    if (!data || token.isCancellationRequested) return;
    const w = doc.getText(word);
    const line = doc.lineAt(pos.line).text;
    const hits = data.rules
      .filter((r) => r.kind !== "owner" && symbolsIn(r, line).some((s) => w === s || w.startsWith(s + ".") || s.endsWith("." + w) || s.startsWith(w + ".")))
      .slice(0, 2);
    if (!hits.length) return;

    const md = new vscode.MarkdownString();
    md.isTrusted = { enabledCommands: ["hivemind.viewRule"] };
    md.appendMarkdown(hits.map(card).join("\n\n---\n\n"));
    return new vscode.Hover(md, word);
  }
}

const mdEsc = (s: string) => s.replace(/[\\*_[\]<>`]/g, (c) => "\\" + c);

function card(r: VsRule): string {
  const link = `command:hivemind.viewRule?${encodeURIComponent(JSON.stringify([r.id]))}`;
  const lines = [`**${mdEsc(plain(r.title))}**`, "", kindLine(r)];
  const summary = plain(r.summary);
  if (summary && summary !== plain(r.title)) lines.push("", mdEsc(summary));
  lines.push("", `${mdEsc(provenance(r))} · [View source](${link} "Open this rule in the Hivemind sidebar")`);
  return lines.join("\n");
}

export function registerHover(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: "file" }, new RulesHover()));
}
