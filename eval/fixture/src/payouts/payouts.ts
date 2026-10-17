import type { Expert } from "../experts/types";
import type { Payout } from "./types";

export function hourlyPayout(expert: Expert, hours: number): Payout {
  return { expertId: expert.id, amount: expert.hourlyRate * hours, memo: `${hours}h annotation` };
}

export function totalOwed(payouts: Payout[]): number {
  return payouts.reduce((sum, p) => sum + p.amount, 0);
}
