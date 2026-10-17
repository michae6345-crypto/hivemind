import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";

/**
 * The one-line installers, served as plain text from cli/install/ (the source of truth, next to the CLI):
 *   curl -fsSL https://hivemind-q17i.onrender.com/install.sh | sh
 *   irm https://hivemind-q17i.onrender.com/install.ps1 | iex
 * Routes: /install.sh and /install.ps1 (src/app/install.*), plus /api/install/<name>.
 * Render runs `next start` from the repo root, so cli/install is on disk at process.cwd().
 */
export const INSTALLERS = {
  "install.sh": "text/x-shellscript; charset=utf-8",
  "install.ps1": "text/plain; charset=utf-8",
} as const;
export type InstallerName = keyof typeof INSTALLERS;

export const isInstaller = (name: string): name is InstallerName => Object.hasOwn(INSTALLERS, name);

export async function serveInstaller(name: InstallerName): Promise<Response> {
  await connection(); // read at request time (cacheComponents is on), so a deploy is all it takes to update them
  let body: string;
  try {
    body = await readFile(join(process.cwd(), "cli", "install", name), "utf8");
  } catch {
    return new Response(`# ${name} is missing from this deploy\n`, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  // sh can't run CRLF (a Windows checkout with autocrlf); PowerShell doesn't mind either way.
  if (name.endsWith(".sh")) body = body.replace(/\r\n/g, "\n");
  return new Response(body, {
    headers: { "content-type": INSTALLERS[name], "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" },
  });
}
