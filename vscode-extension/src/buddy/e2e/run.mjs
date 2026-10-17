// Buddy integration test against a live server (default: prod). Launches the installed VS Code (isolated profile)
// with this extension on a temp copy of demo/export-service, runs suite.js, prints what popped up and when.
// Usage: node src/buddy/e2e/run.mjs [apiUrl] [--download]   (HIVEMIND_TOKEN env or hm-dev-token; --download uses a
// fresh VS Code stable in .vscode-test/ instead of the installed one, e.g. while it is mid-update)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const here = dirname(fileURLToPath(import.meta.url));
const ext = resolve(here, "..", "..", "..");
const root = resolve(ext, "..");
const args = process.argv.slice(2);
const apiUrl = args.find((a) => !a.startsWith("--")) || "https://hivemind-beta-virid.vercel.app";
const tmp = join(tmpdir(), "hm-buddy-e2e");
const ws = join(tmp, "export-service");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
cpSync(join(root, "demo", "export-service"), ws, { recursive: true });
rmSync(join(ws, ".vscode"), { recursive: true, force: true }); // demo settings would override the env below
const results = join(tmp, "results.json");
const codeExe = args.includes("--download")
  ? undefined
  : process.env.VSCODE_EXE ||
  [join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"), "C:\Program Files\Microsoft VS Code\Code.exe"].find(existsSync);

await runTests({
  vscodeExecutablePath: codeExe,
  extensionDevelopmentPath: ext,
  extensionTestsPath: join(here, "suite.js"),
  launchArgs: [ws, "--user-data-dir", join(tmp, "user"), "--extensions-dir", join(tmp, "exts"), "--disable-extensions", "--disable-workspace-trust"],
  extensionTestsEnv: {
    HIVEMIND_API_URL: apiUrl,
    HIVEMIND_TOKEN: process.env.HIVEMIND_TOKEN || "hm-dev-token",
    HIVEMIND_USER: "alex",
    HM_TEST_RESULTS: results,
  },
});
console.log(readFileSync(results, "utf8"));
