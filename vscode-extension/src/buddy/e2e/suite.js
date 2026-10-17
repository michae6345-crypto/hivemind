// Runs inside the VS Code extension host (see run.mjs). Edits only the temp workspace copy.
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000, step = 50) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await sleep(step);
  }
}
const hm = (uri) => vscode.languages.getDiagnostics(uri).filter((d) => d.source === "Hivemind");
const flagged = (doc, uri) =>
  hm(uri).map((d) => ({
    severity: d.severity === 0 ? "error" : "warning",
    line: d.range.start.line + 1,
    text: doc.getText(d.range),
    message: d.message,
  }));

exports.run = async function run() {
  const out = { errors: [] };
  const step = async (name, fn) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out.errors.push(`${name}: ${e && e.stack ? e.stack : e}`);
    }
  };
  const ext = vscode.extensions.getExtension("hivemind.hivemind-vscode");
  const { testing } = await ext.activate();
  const { toasts, events } = testing.buddy;
  const folder = vscode.workspace.workspaceFolders[0].uri;
  const uri = vscode.Uri.joinPath(folder, "src", "export.ts");
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const original = doc.getText();

  await step("onOpen", async () => {
    await sleep(5000); // rules load + first check
    return { flags: flagged(doc, uri), toasts: toasts.length };
  });

  // Typing path: paste the trigger at the end (what "Hivemind: Run demo flag" does).
  await step("typed", async () => {
    const end = doc.lineAt(doc.lineCount - 1).range.end;
    editor.selection = new vscode.Selection(end, end);
    const t0 = Date.now();
    await vscode.commands.executeCommand("hivemind.runDemoFlag");
    const first = await until(() => hm(uri).some((d) => d.message.includes("locked rule")), 10000);
    const firstMs = Date.now() - t0;
    await sleep(4500); // server answer (+ pending re-check)
    return { firstFlagMs: first ? firstMs : null, flags: flagged(doc, uri), toastsWhileTyping: toasts.filter((t) => t.at >= t0) };
  });

  await step("quickFix", async () => {
    const d = hm(uri).find((x) => x.message.includes("locked rule"));
    const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", uri, d.range);
    return actions.filter((a) => a.title.startsWith("Fix:")).map((a) => a.title);
  });

  // Agent path: restore, save, then write the trigger to disk the way Claude Code / Cursor do.
  await step("agentWrite", async () => {
    await editor.edit((e) => e.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), original));
    await doc.save();
    await sleep(2500);
    const t0 = Date.now();
    const trigger = fs.readFileSync(path.join(ext.extensionPath, "demo", "trigger.ts.txt"), "utf8");
    fs.writeFileSync(uri.fsPath, original.replace(/\s+$/, "") + "\n" + trigger);
    const first = await until(() => hm(uri).some((d) => d.message.includes("locked rule")), 10000);
    const firstMs = Date.now() - t0;
    await until(() => toasts.some((t) => t.at >= t0), 8000);
    await sleep(1000);
    return {
      firstFlagMs: first ? firstMs : null,
      flags: flagged(doc, uri),
      toasts: toasts.filter((t) => t.at >= t0),
      events: events.filter((e) => e.at >= t0 && e.uri === uri.toString()).map(({ type, data }) => ({ type, data })),
    };
  });

  // An agent writes a file you don't have open: flagged via the file watcher; its toast is dropped by the 2-min gate.
  await step("unopenedAgentFile", async () => {
    const other = vscode.Uri.joinPath(folder, "src", "fixtures.ts");
    const t0 = Date.now();
    const trigger = fs.readFileSync(path.join(ext.extensionPath, "demo", "trigger.ts.txt"), "utf8");
    fs.writeFileSync(other.fsPath, `import { rowsForCustomer } from "./db.js";\n${trigger}`);
    const first = await until(() => hm(other).length > 0, 12000);
    await sleep(1500);
    const d = vscode.workspace.textDocuments.find((x) => x.uri.toString() === other.toString());
    return { firstFlagMs: first ? Date.now() - t0 : null, flags: d ? flagged(d, other) : [], toasts: toasts.filter((t) => t.at >= t0) };
  });

  // Restore the temp copy.
  fs.writeFileSync(uri.fsPath, original);
  fs.writeFileSync(process.env.HM_TEST_RESULTS, JSON.stringify(out, null, 2));
};
