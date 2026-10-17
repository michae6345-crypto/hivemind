import type { Expert } from "../experts/types";
import type { Payout } from "./types";

async function transfer(expertId: string, amount: number): Promise<{ ok: boolean; error?: string }> {
  void expertId;
  void amount;
  return { ok: true };
}

export async function sendPayout(expert: Expert, payout: Payout): Promise<boolean> {
  const res = await transfer(expert.id, payout.amount);
  return res.ok;
}
