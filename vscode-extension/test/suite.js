// Runs inside the VS Code extension host (see test/run.mjs). Exercises every feature through VS Code's own provider
// commands and writes what it saw to $HM_TEST_RESULTS. Edits only the temp workspace copy.
const fs = require("fs");
const vscode = require("vscode");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000, step = 300) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await sleep(step);
  }
}
const md = (h) => h.contents.map((c) => (typeof c === "string" ? c : c.value)).join("\n");
const hmDiags = (uri) => vscode.languages.getDiagnostics(uri).filter((d) => d.source === "Hivemind");

async function appendText(editor, text) {
  const doc = editor.document;
  const end = doc.lineAt(doc.lineCount - 1).range.end;
  await editor.edit((e) => e.insert(end, text));
  const last = editor.document.lineAt(editor.document.lineCount - 1);
  return last.range.end;
}

exports.run = async function run() {
  const out = { ok: {}, errors: [] };
  const step = async (name, fn) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out.errors.push(`${name}: ${e && e.stack ? e.stack : e}`);
    }
  };

  const ext = vscode.extensions.getExtension("hivemind.hivemind-vscode");
  const api = await ext.activate();
  const folder = vscode.workspace.workspaceFolders[0].uri;
  const uri = vscode.Uri.joinPath(folder, "src", "export.ts");
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const original = doc.getText();
  const restore = async () => {
    const d = editor.document;
    await editor.edit((e) => e.replace(new vscode.Range(d.positionAt(0), d.positionAt(d.getText().length)), original));
    await d.save();
  };

  // CodeLens was removed (Michael, Oct 17): expect none from Hivemind once rules have loaded.
  await step("noCodeLens", async () => {
    await until(async () => !!(await api.testing.rules(doc)), 15000);
    const l = (await vscode.commands.executeCommand("vscode.executeCodeLensProvider", uri, 10)) || [];
    return l.filter((x) => x.command && /hivemind|rule|lesson/i.test(x.command.title)).length;
  });

  await step("statusBar", async () => {
    await until(() => / rules?$/.test(api.testing.statusText()), 10000);
    return api.testing.statusText();
  });

  await step("initialDiagnostics", async () => {
    await sleep(4000);
    return hmDiags(uri).map((d) => d.message);
  });

  await step("hover", async () => {
    const line = doc.getText().split("\n").findIndex((l) => /^\s+assertSingleCustomer\(rows\)/.test(l));
    const col = doc.lineAt(line).text.indexOf("assertSingleCustomer") + 3;
    const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", uri, new vscode.Position(line, col));
    return { line: line + 1, cards: hovers.map(md).filter((s) => s.includes("View source")) };
  });

  await step("hoverConsoleLog", async () => {
    const pos = await appendText(editor, '\n// probe\nconsole.log("probe");');
    const p = new vscode.Position(pos.line, 3);
    const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", uri, p);
    await vscode.commands.executeCommand("undo");
    return hovers.map(md).filter((s) => s.includes("View source"));
  });

  // Ghost text, provider level: case A (cursor after `{` with auto-closed `}`) and case B (blank first body line).
  await step("inlineProvider", async () => {
    const res = {};
    const cts = new vscode.CancellationTokenSource();
    const ctx = { triggerKind: vscode.InlineCompletionTriggerKind.Automatic, selectedCompletionInfo: undefined };
    let pos = await appendText(editor, "\n\nexport async function writeExport(rows: Row[]) {}");
    pos = pos.translate(0, -1);
    let t0 = Date.now();
    let items = await api.testing.inline.provideInlineCompletionItems(editor.document, pos, ctx, cts.token);
    res.caseA = { ms: Date.now() - t0, insertText: items && items[0] && items[0].insertText };
    await vscode.commands.executeCommand("undo");
    pos = await appendText(editor, "\n\nexport function buildManifest(records: Row[]) {\n  ");
    t0 = Date.now();
    items = await api.testing.inline.provideInlineCompletionItems(editor.document, pos, ctx, cts.token);
    res.caseB = { ms: Date.now() - t0, insertText: items && items[0] && items[0].insertText };
    await vscode.commands.executeCommand("undo");
    return res;
  });

  // Ghost text through VS Code's real inline-suggest pipeline: trigger + commit (= pressing Tab).
  await step("inlineAccepted", async () => {
    const pos = await appendText(editor, "\n\nexport async function writeExport(rows: Row[]) {\n  ");
    editor.selection = new vscode.Selection(pos, pos);
    for (let i = 0; i < 3; i++) {
      await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
      await sleep(2500);
      await vscode.commands.executeCommand("editor.action.inlineSuggest.commit");
      await sleep(300);
      if (editor.document.lineAt(pos.line).text.includes("assertSingleCustomer")) break;
    }
    const text = editor.document.lineAt(pos.line).text;
    await vscode.commands.executeCommand("undo");
    const after = editor.document.getText();
    // remove the probe function either way
    const cut = after.lastIndexOf("\n\nexport async function writeExport");
    if (cut > 0) await editor.edit((e) => e.delete(new vscode.Range(editor.document.positionAt(cut), editor.document.positionAt(after.length))));
    return { acceptedLine: text };
  });

  await step("diagnostics", async () => {
    await restore();
    await appendText(editor, '\n\nexport async function dumpAll(rows: Row[]) {\n  console.log("dump", rows.length);\n  return rows;\n}\n');
    await editor.document.save();
    const t0 = Date.now();
    const diags = await until(() => {
      const d = hmDiags(uri);
      return d.length >= 2 ? d : null;
    }, 25000);
    return { ms: Date.now() - t0, items: (diags || hmDiags(uri)).map((d) => ({ line: d.range.start.line + 1, severity: d.severity === 0 ? "error" : "warning", code: editor.document.getText(d.range), message: d.message })) };
  });

  await step("quickFix", async () => {
    const res = { actions: [] };
    for (const d of hmDiags(uri)) {
      const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", uri, d.range, vscode.CodeActionKind.QuickFix.value);
      res.actions.push({ diag: d.message.slice(0, 60), titles: actions.filter((a) => a.title.startsWith("Fix")).map((a) => a.title) });
    }
    const lock = hmDiags(uri).find((d) => d.severity === vscode.DiagnosticSeverity.Error);
    if (lock) {
      const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", uri, lock.range, vscode.CodeActionKind.QuickFix.value);
      const fix = actions.find((a) => a.title.startsWith("Fix"));
      if (fix && fix.edit) {
        await vscode.workspace.applyEdit(fix.edit);
        await editor.document.save();
        const t = editor.document.getText();
        res.appliedLine = t.split("\n").find((l) => l.includes("assertSingleCustomer(rows);") && t.indexOf(l) > t.indexOf("dumpAll"));
        const gone = await until(() => !hmDiags(uri).some((d) => d.severity === vscode.DiagnosticSeverity.Error), 20000);
        res.lockedSquiggleGoneAfterFix = !!gone;
        res.remaining = hmDiags(uri).map((d) => d.message);
        res.finalFunction = editor.document.getText().slice(editor.document.getText().indexOf("export async function dumpAll"));
      }
    }
    return res;
  });

  await step("teachAction", async () => {
    const t = editor.document.getText();
    const start = editor.document.positionAt(t.indexOf("export async function dumpAll"));
    const range = new vscode.Range(start, start.translate(3, 0));
    const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", uri, range);
    return actions.filter((a) => a.title.startsWith("Teach")).map((a) => a.title);
  });

  await step("collision", async () => {
    const base = process.env.HIVEMIND_API_URL;
    const r = await fetch(`${base}/api/activity`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.HIVEMIND_TOKEN}`, "x-hm-agent": "cursor" },
      body: JSON.stringify({ sessionId: `s-test-cursor-${Date.now()}`, actor: "riley", repo: "repo/export-service", file: "src/export.ts" }),
    });
    const t0 = Date.now();
    const seen = await until(() => api.testing.collisions().get(uri.toString()), 15000);
    return { postStatus: r.status, ms: Date.now() - t0, banner: seen || null };
  });

  fs.writeFileSync(process.env.HM_TEST_RESULTS, JSON.stringify(out, null, 2));
};
