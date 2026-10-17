import { serveInstaller } from "@/lib/installers";

/** irm https://hivemind-q17i.onrender.com/install.ps1 | iex */
export function GET() {
  return serveInstaller("install.ps1");
}
