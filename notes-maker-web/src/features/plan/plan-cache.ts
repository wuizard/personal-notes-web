import type { CachedPlan, PlanTier } from "./types";

/**
 * Local cache of the last-verified plan — docs/10 §10.13.
 *
 * Server-safe: no React import, so use-plan.ts (the client half) and any
 * server code can both reference the key/constant without dragging a hook
 * into the server graph (the same split as shared/app-color.ts vs
 * shared/use-app-color.ts).
 */

export const PLAN_CACHE_KEY = "nm-plan-cache";

/** Dispatched on `window` whenever the cache is written — use-plan.ts's
 *  useSyncExternalStore subscribes to this rather than the hook holding its
 *  own React state, so a write never has to call setState from inside an
 *  effect. */
export const PLAN_CHANGE_EVENT = "nm-plan-change";

/** How long a premium verdict survives without reconnecting — docs/10 §10.13. */
export const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export function getCachedPlan(): CachedPlan | null {
  try {
    const raw = localStorage.getItem(PLAN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPlan>;
    if (
      (parsed.tier !== "free" && parsed.tier !== "premium") ||
      typeof parsed.verifiedAt !== "number"
    ) {
      return null;
    }
    return { tier: parsed.tier, verifiedAt: parsed.verifiedAt };
  } catch {
    return null;
  }
}

export function setCachedPlan(tier: PlanTier, verifiedAt: number): void {
  try {
    localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify({ tier, verifiedAt }));
  } catch {
    // Private modes can refuse localStorage; the caller's in-memory state
    // still carries the verdict for this session.
  }
  window.dispatchEvent(new Event(PLAN_CHANGE_EVENT));
}

export function clearCachedPlan(): void {
  try {
    localStorage.removeItem(PLAN_CACHE_KEY);
  } catch {
    // Nothing to clear is equivalent to cleared.
  }
  window.dispatchEvent(new Event(PLAN_CHANGE_EVENT));
}

/**
 * Applies the offline grace window: a cached "premium" verdict older than
 * `GRACE_PERIOD_MS` can no longer be trusted without reverifying, so it
 * reads as "free" until the next successful check. A cached "free" verdict
 * never expires — there is no harm in continuing to withhold premium.
 *
 * `now` defaults rather than being read inline at call sites, the same
 * shape as note-repo.ts's `trashDaysLeft` — it keeps `Date.now()` out of
 * component render bodies while still letting tests pin a value.
 */
export function effectiveTier(cached: CachedPlan | null, now: number = Date.now()): PlanTier {
  if (!cached) return "free";
  if (cached.tier === "premium" && now - cached.verifiedAt > GRACE_PERIOD_MS) return "free";
  return cached.tier;
}
