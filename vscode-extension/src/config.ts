import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

// Settings (hivemind.*) with env fallbacks, so a terminal-launched `code` picks up the same HIVEMIND_* vars as the hooks.
export type Config = {
  apiUrl: string;
  token: string;
  user: string;
  dashboardUrl: string;
  inlineSuggestions: boolean;
  checkOnType: boolean;
  collisionWarnings: boolean;
  shareActivity: boolean;
};

const DEFAULT_API = "http://localhost:3000";
const trim = (s: string) => s.replace(/\/+$/, "");

export function config(): Config {
  const c = vscode.workspace.getConfiguration("hivemind");
  const apiSet = c.inspect<string>("apiUrl");
  const explicitApi = apiSet?.workspaceFolderValue ?? apiSet?.workspaceValue ?? apiSet?.globalValue;
  const apiUrl = trim(explicitApi || process.env.HIVEMIND_API_URL || DEFAULT_API);
  return {
    apiUrl,
    token: c.get<string>("token") || process.env.HIVEMIND_TOKEN || "",
    user: (c.get<string>("user") || process.env.HIVEMIND_USER || os.userInfo().username || "engineer").toLowerCase(),
    dashboardUrl: trim(c.get<string>("dashboardUrl") || apiUrl),
    inlineSuggestions: c.get<boolean>("inlineSuggestions", true),
    checkOnType: c.get<boolean>("checkOnType", true),
    collisionWarnings: c.get<boolean>("collisionWarnings", true),
    shareActivity: c.get<boolean>("shareActivity", true),
  };
}

/** Repo scope for a document: hivemind.repo, else `repo/<workspace folder name>`. */
export function repoFor(uri?: vscode.Uri): string {
  const set = vscode.workspace.getConfiguration("hivemind", uri).get<string>("repo");
  if (set) return set.includes("/") ? set : `repo/${set}`;
  const folder = (uri && vscode.workspace.getWorkspaceFolder(uri)) ?? vscode.workspace.workspaceFolders?.[0];
  return folder ? `repo/${folder.name}` : "";
}

/** Workspace-relative path with forward slashes (what agents report to /api/activity). */
export function relPath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
}

export const baseName = (p: string) => path.posix.basename(p.replace(/\\/g, "/"));

/** Files we act on: real files in code languages, not output panes or settings. */
const SKIP_LANG = new Set(["plaintext", "log", "Log", "json", "jsonc", "markdown", "git-commit", "scminput"]);
export function isCodeDoc(doc: vscode.TextDocument): boolean {
  return doc.uri.scheme === "file" && !SKIP_LANG.has(doc.languageId) && doc.lineCount < 5000;
}
