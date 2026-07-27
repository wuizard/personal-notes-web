import type {CachedPlan, PlanTier} from "./types";

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

// getCachedPlan is used as useSyncExternalStore's getSnapshot (use-plan.ts),
// which requires a referentially STABLE return value when nothing has
// actually changed — React calls it on every render to decide whether a
// re-render is needed, via Object.is. Building a fresh `{ tier, verifiedAt }`
// object on every call (as this originally did) made every single call look
// like a change, which is precisely what caused the app-wide hangs: an
// infinite synchronous render loop, "The result of getSnapshot should be
// cached to avoid an infinite loop." use-app-color.ts's equivalent never hit
// this because it returns a primitive string, which Object.is compares by
// value; a plan verdict is a compound object, so it needs real memoization.
let lastRaw: string | null = null;
let lastParsed: CachedPlan | null = null;

export function getCachedPlan(): CachedPlan | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PLAN_CACHE_KEY);
  } catch {
    raw = null;
  }

  if (raw === lastRaw) return lastParsed;
  lastRaw = raw;

  if (!raw) return (lastParsed = null);

  try {
    const parsed = JSON.parse(raw) as Partial<CachedPlan>;
    if (
      (parsed.tier !== "free" && parsed.tier !== "premium") ||
      typeof parsed.verifiedAt !== "number"
    ) {
      return (lastParsed = null);
    }
    return (lastParsed = { tier: parsed.tier, verifiedAt: parsed.verifiedAt });
  } catch {
    return (lastParsed = null);
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
