import { isInstaller, serveInstaller } from "@/lib/installers";

/** GET /api/install/install.sh | install.ps1 → the installer script (same as /install.sh, /install.ps1). */
export async function GET(_req: Request, { params }: { params: Promise<{ script: string }> }) {
  const { script } = await params;
  if (!isInstaller(script)) return new Response("not found\n", { status: 404 });
  return serveInstaller(script);
}
