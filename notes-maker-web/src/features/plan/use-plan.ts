"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/use-auth";
import { checkRemotePlan } from "./remote";
import {
  clearCachedPlan,
  effectiveTier,
  getCachedPlan,
  PLAN_CHANGE_EVENT,
  setCachedPlan,
} from "./plan-cache";
import type { PlanTier } from "./types";

export interface PlanState {
  /** The plan the rest of the app should treat as active right now. */
  plan: PlanTier;
  /** True once the offline grace window has lapsed on a premium cache — the
   *  user was premium, but hasn't reconnected in over a week (docs/10 §10.13). */
  graceExpired: boolean;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(PLAN_CHANGE_EVENT, onChange);
  // Other tabs write the same key; "storage" keeps them in step.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PLAN_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The app-wide "data variable" for plan state — docs/10 §10.13.
 *
 * Signed out is always "free": premium requires an account (docs/10 §10.7).
 * Signed in, the plan comes from `checkRemotePlan` whenever the backend is
 * reachable (on mount and on every reconnect), cached locally so the verdict
 * survives being offline. A cached "premium" verdict keeps working offline
 * for up to a week; past that it reads as "free" until the next successful
 * check, because an unreachable backend cannot rule out a lapsed
 * subscription forever.
 *
 * Reads the cache through useSyncExternalStore rather than component state —
 * the write happens inside an async effect callback, and calling setState
 * synchronously from an effect body cascades a render (flagged by
 * react-hooks/set-state-in-effect, and already worked around the same way in
 * shared/use-app-color.ts and features/storage/components/storage-panel.tsx).
 *
 * A failed check (offline, or a transient error while nominally online)
 * never downgrades the cache itself — only the passive time-based grace
 * expiry in plan-cache.ts does that. One flaky request must not bounce a
 * paying user's ads back on.
 */
export function usePlan(): PlanState {
  const { user } = useAuth();
  const cached = useSyncExternalStore(subscribe, getCachedPlan, () => null);

  useEffect(() => {
    if (!user) {
      clearCachedPlan();
      return;
    }

    let cancelled = false;
    const uid = user.uid;

    async function verify() {
      try {
        const tier = await checkRemotePlan(uid);
        if (!cancelled) setCachedPlan(tier, Date.now());
      } catch {
        // Offline or the backend is unreachable — leave the existing cache
        // and its grace window in place rather than guessing.
      }
    }

    void verify();
    window.addEventListener("online", verify);
    return () => {
      cancelled = true;
      window.removeEventListener("online", verify);
    };
  }, [user]);

  const plan: PlanTier = user ? effectiveTier(cached) : "free";
  // effectiveTier only downgrades a cached "premium" to "free" once the
  // grace window has lapsed, so this comparison alone identifies that case.
  const graceExpired = Boolean(user && cached?.tier === "premium" && plan === "free");

  return { plan, graceExpired };
}
