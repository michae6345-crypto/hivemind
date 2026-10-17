import { serveInstaller } from "@/lib/installers";

/** curl -fsSL https://hivemind-q17i.onrender.com/install.sh | sh */
export function GET() {
  return serveInstaller("install.sh");
}
