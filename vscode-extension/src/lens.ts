import * as vscode from "vscode";
import { isCodeDoc } from "./config";
import { onViolationsChanged, violationsFor } from "./diagnostics";
import { findFunctions, lensTitle, onRulesChanged, peekRules, provenance, rulesApplying, rulesFor, symbolsIn } from "./rules";

// CodeLens at the top of the file and above each function: `$(lock) 1 locked rule · 2 team lessons apply`.
// A rule applies to a function if it names a symbol used there, names this file, or the server flagged a violation in it.
class RulesLens implements vscode.CodeLensProvider {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;
  refresh = () => this.emitter.fire();

  async provideCodeLenses(doc: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (!isCodeDoc(doc)) return [];
    const data = peekRules(doc) ?? (await rulesFor(doc));
    if (!data?.rules.length) return [];
    const rules = data.rules.filter((r) => r.kind !== "owner");
    const vs = violationsFor(doc.uri);
    const lenses: vscode.CodeLens[] = [];

    const fileRules = rulesApplying(rules, doc.getText(), new Set(vs.map((v) => v.ruleId)));
    const top = fileRules.length ? fileRules : rules.filter((r) => r.locked);
    if (top.length) {
      lenses.push(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: `⬡ Hivemind · ${lensTitle(top)} to this file`,
          tooltip: "Team rules for this file. Click to see who taught them.",
          command: "hivemind.showRuleList",
          arguments: [top.map((r) => r.id), "Team rules for this file"],
        }),
      );
    }

    for (const fn of findFunctions(doc)) {
      if (fn.line === 0) continue;
      const body = doc.getText(new vscode.Range(fn.line, 0, fn.endLine, doc.lineAt(fn.endLine).text.length));
      const flagged = new Set(vs.filter((v) => v.startLine >= fn.line && v.startLine <= fn.endLine).map((v) => v.ruleId));
      const applying = rules.filter((r) => flagged.has(r.id) || symbolsIn(r, body).length > 0);
      if (!applying.length) continue;
      lenses.push(
        new vscode.CodeLens(new vscode.Range(fn.line, 0, fn.line, 0), {
          title: lensTitle(applying),
          tooltip: applying.map((r) => `${r.locked ? "🔒 " : ""}${r.title}: ${provenance(r)}`).join("\n"),
          command: "hivemind.showRuleList",
          arguments: [applying.map((r) => r.id), `Team rules for ${fn.name}()`],
        }),
      );
    }
    return lenses;
  }
}

export function registerLens(ctx: vscode.ExtensionContext) {
  const lens = new RulesLens();
  ctx.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, lens),
    onRulesChanged(lens.refresh),
    onViolationsChanged(lens.refresh),
  );
  return lens;
}
