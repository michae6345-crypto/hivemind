// Integration test: launches the installed VS Code (isolated profile, other extensions disabled) with this extension in
// development mode on a temp copy of demo/export-service, runs test/suite.js, prints its JSON results.
// Usage: node test/run.mjs [apiUrl]   (default http://localhost:3107; reads HIVEMIND_TOKEN from ../.env.local)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const here = dirname(fileURLToPath(import.meta.url));
const ext = resolve(here, "..");
const root = resolve(ext, "..");
const apiUrl = process.argv[2] || "http://localhost:3107";

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

const tmp = join(tmpdir(), "hm-vscode-test");
const ws = join(tmp, "export-service");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
cpSync(join(root, "demo", "export-service"), ws, { recursive: true });
const results = join(tmp, "results.json");

const codeExe =
  process.env.VSCODE_EXE ||
  [join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"), "C:\\Program Files\\Microsoft VS Code\\Code.exe"].find(existsSync);

await runTests({
  vscodeExecutablePath: codeExe,
  extensionDevelopmentPath: ext,
  extensionTestsPath: join(here, "suite.js"),
  launchArgs: [ws, "--user-data-dir", join(tmp, "user"), "--extensions-dir", join(tmp, "exts"), "--disable-extensions", "--disable-workspace-trust"],
  extensionTestsEnv: {
    HIVEMIND_API_URL: apiUrl,
    HIVEMIND_TOKEN: env.HIVEMIND_TOKEN ?? "",
    HIVEMIND_USER: "alex",
    HM_TEST_RESULTS: results,
  },
});
console.log(readFileSync(results, "utf8"));
