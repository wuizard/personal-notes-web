"use client";

import {useTranslations} from "next-intl";
import {useSyncStatus} from "../use-sync-status";

/**
 * The entire ambient surface of sync — docs/04 §4.7.
 *
 * Sync should be almost invisible. No spinners on note cards, no blocking
 * saves, no "are you sure, you have unsaved changes": saving is local and
 * instant, so there is no such state to warn about. This pill and the
 * Settings panel are the whole of it.
 *
 * When sync is off — free tier, signed out, or no API — the caller keeps
 * showing the local-storage pill instead. "Stored on this device" is a
 * promise, not a degraded state.
 */
export function SyncPill() {
  const t = useTranslations("sync");
  const { state, queued } = useSyncStatus();

  if (state === "disabled") return null;

  const dot =
    state === "idle" ? "bg-success" : state === "error" ? "bg-danger" : "bg-warning";

  const label =
    state === "syncing"
      ? t("syncing")
      : state === "offline"
        ? queued > 0
          ? t("offlineQueued", { count: queued })
          : t("offline")
        : state === "error"
          ? t("error")
          : queued > 0
            ? t("queued", { count: queued })
            : t("synced");

  return (
    <p
      className="hidden items-center gap-2 rounded-full border border-border bg-surface-tertiary px-3 py-1.5 text-xs text-muted lg:flex"
      // Sync moves on its own, so its changes have to be announced — but
      // politely: this must never interrupt what someone is typing.
      aria-live="polite"
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${dot} ${state === "syncing" ? "animate-pulse" : ""}`}
        aria-hidden
      />
      {label}
    </p>
  );
}
