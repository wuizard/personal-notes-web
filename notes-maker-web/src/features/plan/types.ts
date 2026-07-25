export type PlanTier = "free" | "premium";

/** What's persisted in localStorage — docs/10 §10.13. */
export interface CachedPlan {
  tier: PlanTier;
  /** epoch ms of the last successful backend verification. */
  verifiedAt: number;
}
