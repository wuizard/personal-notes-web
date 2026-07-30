"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {useLocale, useTranslations} from "next-intl";
import {useCallback, useEffect, useRef} from "react";
import {useAuth} from "@/features/auth/use-auth";
import {usePlan} from "@/features/plan/use-plan";
import {isApiConfigured} from "@/shared/api/graphql";
import {backoffDelay, sync} from "./engine";
import {countDirty} from "./push";
import {getSyncStatus, setSyncStatus} from "./status";

/**
 * Drives the sync engine — docs/04 §4.6.
 *
 * Mount once, high in the tree. Everything else reads `useSyncStatus()`.
 *
 * Sync is the paid tier's defining feature and the free tier's defining
 * *absence*: a free user's notes never touch a server at all (docs/01 §1.0).
 * So this does nothing at all unless the account is signed in, premium, and
 * an API is configured — and `usePlan()` is the only place that verdict is
 * decided, cached grace window included.
 */

/** How stale a sync must be before regaining focus triggers another. */
const REFRESH_ON_FOCUS_AFTER_MS = 30_000;

/** The heartbeat while the tab is visible. */
const POLL_INTERVAL_MS = 60_000;

/** Settle time after a local edit, so a burst of typing is one sync. */
const WRITE_DEBOUNCE_MS = 2_000;

export function useSyncEngine(): void {
  const { user } = useAuth();
  const { plan } = usePlan();
  const t = useTranslations("sync");
  const locale = useLocale();

  const enabled = Boolean(user) && plan === "premium" && isApiConfigured();

  const conflictLabel = useCallback(
    (title: string, at: number) => {
      const when = new Date(at).toLocaleString(locale, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      return t("conflictedCopy", { title, when });
    },
    [t, locale],
  );

  // Dexie's own observer, rather than note-repo shouting about every write —
  // it already knows when the table changes, and this keeps the repo unaware
  // that a network exists (docs/01 §1.5).
  const queued = useLiveQuery(() => (enabled ? countDirty() : 0), [enabled]);

  // Keep the pill honest between syncs: a change queues instantly, even
  // though the push that clears it is a couple of seconds away.
  useEffect(() => {
    if (enabled && queued !== undefined) setSyncStatus({ queued });
  }, [enabled, queued]);

  // Held in a ref, not an effect dependency: a locale change must not tear
  // down and rebuild every timer and listener below. Written in its own
  // effect rather than during render, which is what react-hooks/refs forbids.
  const conflictLabelRef = useRef(conflictLabel);
  useEffect(() => {
    conflictLabelRef.current = conflictLabel;
  }, [conflictLabel]);

  useEffect(() => {
    if (!enabled) {
      setSyncStatus({ state: "disabled", error: null });
      return;
    }

    let cancelled = false;
    let retryTimer: number | undefined;
    let pollTimer: number | undefined;

    const clearRetry = () => {
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      retryTimer = undefined;
    };

    const run = async () => {
      if (cancelled) return;
      clearRetry();

      const outcome = await sync(conflictLabelRef.current);
      if (cancelled) return;

      // Only a reachability failure earns a retry. A refusal ("premium
      // required") would answer identically however long we wait, and a
      // disabled engine has nothing to retry against.
      if (!outcome.ok && getSyncStatus().state === "offline") {
        retryTimer = window.setTimeout(() => void run(), backoffDelay());
      }
    };

    // Timers are torn down when the tab hides and rebuilt when it returns,
    // rather than firing into a hidden tab and returning early. On mobile a
    // background heartbeat is a battery complaint (docs/04 §4.6).
    const startPolling = () => {
      pollTimer ??= window.setInterval(() => void run(), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      pollTimer = undefined;
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        stopPolling();
        clearRetry();
        return;
      }
      startPolling();
      const last = getSyncStatus().lastSyncedAt;
      if (last === null || Date.now() - last > REFRESH_ON_FOCUS_AFTER_MS) void run();
    };

    const onOnline = () => void run();

    void run();
    if (document.visibilityState === "visible") startPolling();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearRetry();
      stopPolling();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  // A local write schedules its own sync, so an edit reaches other devices in
  // seconds rather than waiting out the poll interval.
  useEffect(() => {
    if (!enabled || !queued) return;
    const timer = window.setTimeout(() => void sync(conflictLabelRef.current), WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, queued]);
}
