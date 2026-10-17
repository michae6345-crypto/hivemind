// Runs inside the extension host (see run.mjs): the sidebar's commands exist, the view resolves, showRule works.
const fs = require("fs");
const vscode = require("vscode");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.run = async function run() {
  const out = { errors: [] };
  try {
    await vscode.extensions.getExtension("hivemind.hivemind-vscode").activate();
    const cmds = await vscode.commands.getCommands(true);
    out.commands = ["hivemind.focusSidebar", "hivemind.showRule", "hivemind.sidebar.refresh", "hivemind.sidebar.focus"].map((c) => [c, cmds.includes(c)]);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, "src", "export.ts"));
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("hivemind.focusSidebar");
    await sleep(1500);
    await vscode.commands.executeCommand("hivemind.showRule", "sec-lab-isolation");
    await sleep(1500);
    await vscode.commands.executeCommand("hivemind.sidebar.refresh");
    await sleep(1000);
    out.ok = true;
  } catch (e) {
    out.errors.push(String(e && e.stack ? e.stack : e));
  }
  fs.writeFileSync(process.env.HM_TEST_RESULTS, JSON.stringify(out, null, 2));
};
