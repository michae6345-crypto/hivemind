// Smoke test for the sidebar in a real VS Code (isolated profile): node src/sidebar/smoke/run.mjs [apiUrl]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const here = dirname(fileURLToPath(import.meta.url));
const ext = resolve(here, "..", "..", "..");
const root = resolve(ext, "..");
const tmp = join(tmpdir(), "hm-sidebar-smoke");
const ws = join(tmp, "export-service");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
cpSync(join(root, "demo", "export-service"), ws, { recursive: true });
const results = join(tmp, "results.json");
const codeExe =
  process.env.VSCODE_EXE ||
  [join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"), "C:\Program Files\Microsoft VS Code\Code.exe"].find(existsSync);
await runTests({
  vscodeExecutablePath: codeExe,
  extensionDevelopmentPath: ext,
  extensionTestsPath: join(here, "suite.js"),
  launchArgs: [ws, "--user-data-dir", join(tmp, "user"), "--extensions-dir", join(tmp, "exts"), "--disable-extensions", "--disable-workspace-trust"],
  extensionTestsEnv: {
    HIVEMIND_API_URL: process.argv[2] || "https://hivemind-beta-virid.vercel.app",
    HIVEMIND_TOKEN: process.env.HIVEMIND_TOKEN || "hm-dev-token",
    HIVEMIND_USER: "jordan",
    HM_TEST_RESULTS: results,
  },
});
console.log(readFileSync(results, "utf8"));
