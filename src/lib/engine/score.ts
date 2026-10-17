// Confidence math for memories. Each memory carries a Beta(α, β) posterior over "following this lesson is right".
// Prior Beta(1,1). Evidence for → α += w, evidence against → β += w. Pure functions — safe to import anywhere.

export type Rating = "helpful" | "harmful";

/** Evidence weight by role: leads/security 2.0, engineers 1.0, agent self-reports 0.3. */
export function roleWeight(role: string | null | undefined, actor?: string): number {
  if (actor?.startsWith("agent")) return 0.3;
  switch (role) {
    case "security":
    case "lead":
      return 2.0;
    case "agent":
      return 0.3;
    default:
      return 1.0;
  }
}

/** Posterior mean p = α / (α + β). */
export const posteriorMean = (alpha: number, beta: number) => alpha / (alpha + beta);

/**
 * Wilson score lower bound (Evan Miller, "How Not To Sort By Average Rating") on p = α/(α+β) with n = α+β−2
 * observations (n floored at 1 so fresh lessons are comparable). z = 1.96 → 95%. Used for pack ranking.
 */
export function wilsonLowerBound(alpha: number, beta: number, z = 1.96): number {
  const n = Math.max(alpha + beta - 2, 1);
  const p = posteriorMean(alpha, beta);
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

/** Apply one outcome to (α, β). */
export function bump(alpha: number, beta: number, rating: Rating, w = 1): { alpha: number; beta: number } {
  return rating === "helpful" ? { alpha: alpha + w, beta } : { alpha, beta: beta + w };
}

/** Optional time decay toward the prior: α ← 1 + (α−1)·0.5^(Δt/halfLife). Locked memories never decay. */
export function decay(x: number, ageDays: number, halfLifeDays = 60): number {
  return 1 + (x - 1) * Math.pow(0.5, ageDays / halfLifeDays);
}

const round = (x: number) => Math.round(x * 100) / 100;
export const fmtConfidence = (alpha: number, beta: number) =>
  `α=${round(alpha)} β=${round(beta)} p=${round(posteriorMean(alpha, beta))} wilson=${round(wilsonLowerBound(alpha, beta))}`;
