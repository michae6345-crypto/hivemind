import { Vault } from "@/components/hm/vault";

// Client-rendered workbench (seed timestamps are computed in the browser).
export const instant = false;

export default function VaultPage() {
  return <Vault />;
}
