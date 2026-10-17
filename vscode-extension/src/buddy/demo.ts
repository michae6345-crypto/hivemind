import * as vscode from "vscode";

// Demo triggers (vscode-extension/DEMO.md), both insert demo/trigger.ts.txt: a test helper that exports both labs'
// rows to one file.
// - "Hivemind: Run demo flag": types it at the cursor (the typing path: highlight + squiggle, no toast).
// - "Hivemind: Run demo agent write": appends it to the file ON DISK, the way Claude Code / Cursor write files
//   (the agent path: highlight + "An agent's edit breaks a locked rule" toast). A fallback if the live agent is slow.

const FALLBACK = `
// Test fixture: both labs' rows in one file, for testing
export async function exportAllLabsForTesting(): Promise<string> {
  const labA = await rowsForCustomer("lab-a");
  const labB = await rowsForCustomer("lab-b");
  const rows = [...labA, ...labB];
  console.log("exporting", rows.length, "rows");
  return rows.map((r) => JSON.stringify(r)).join("\n");
}
`;

async function snippet(ctx: vscode.ExtensionContext, eol: string) {
  let text = FALLBACK;
  try {
    text = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(ctx.extensionUri, "demo", "trigger.ts.txt"))).toString("utf8");
  } catch {
    // packaged without demo/: use the copy above
  }
  return text.replace(/\r?\n/g, eol);
}

const noEditor = () => vscode.window.setStatusBarMessage("Hivemind: open demo/export-service/src/export.ts first", 5000);

export async function runDemoFlag(ctx: vscode.ExtensionContext) {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return void noEditor();
  const text = await snippet(ctx, ed.document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n");
  await ed.edit((e) => e.insert(ed.selection.active, text));
}

export async function runDemoAgentWrite(ctx: vscode.ExtensionContext) {
  const doc = vscode.window.activeTextEditor?.document;
  if (!doc || doc.uri.scheme !== "file") return void noEditor();
  if (doc.isDirty) await doc.save();
  const eol = doc.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  const body = doc.getText().replace(/\s+$/, "") + eol + (await snippet(ctx, eol));
  await vscode.workspace.fs.writeFile(doc.uri, Buffer.from(body, "utf8")); // VS Code reloads it, like an agent's write
}
