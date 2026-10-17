import { Vault } from "@/components/hm/vault";
import { PreviewRoot } from "@/components/hm/preview-root";

// Client-rendered workbench (seed timestamps are computed in the browser).
export const instant = false;

export default function VaultPage() {
  // The hosted preview build is a single static page; it switches views by URL hash.
  return process.env.NEXT_PUBLIC_HM_PREVIEW === "1" ? <PreviewRoot /> : <Vault />;
}
