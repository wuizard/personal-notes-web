"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {AlertTriangle, RefreshCw} from "lucide-react";
import {useFormatter, useLocale, useTranslations} from "next-intl";
import {useCallback, useState} from "react";
import {useAuth} from "@/features/auth/use-auth";
import {usePlan} from "@/features/plan/use-plan";
import {isApiConfigured} from "@/shared/api/graphql";
import {sync} from "../engine";
import {clearRejections, countDirty, readRejections} from "../push";
import {useSyncStatus} from "../use-sync-status";

/**
 * Settings → Sync — docs/04 §4.7.
 *
 * Deliberately small: last synced, what is queued, anything the server
 * refused, and a manual "sync now" for the moment someone does not believe
 * the pill. The escape hatch that would also belong here — reset local data —
 * already exists one panel over, in storage's reset panel.
 */
export function SyncPanel() {
  const t = useTranslations("sync");
  const format = useFormatter();
  const locale = useLocale();
  const { user } = useAuth();
  const { plan } = usePlan();
  const { state, lastSyncedAt, error } = useSyncStatus();

  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const queued = useLiveQuery(() => countDirty(), [refreshKey]);
  const rejections = useLiveQuery(() => readRejections(), [refreshKey]);

  const conflictLabel = useCallback(
    (title: string, at: number) =>
      t("conflictedCopy", {
        title,
        when: new Date(at).toLocaleString(locale, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }),
    [t, locale],
  );

  // Premium is the tier boundary itself, not an upsell surface — free users
  // get an explanation rather than a broken panel (docs/01 §1.0).
  if (!user || plan !== "premium") {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[15px] font-semibold">{t("title")}</h2>
        <p className="mt-1.5 text-[13px] text-muted">{t("unavailable")}</p>
      </section>
    );
  }

  if (!isApiConfigured()) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[15px] font-semibold">{t("title")}</h2>
        <p className="mt-1.5 text-[13px] text-muted">{t("notConfigured")}</p>
      </section>
    );
  }

  async function onSyncNow() {
    setBusy(true);
    try {
      await sync(conflictLabel);
    } finally {
      setBusy(false);
      setRefreshKey((k) => k + 1);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-[15px] font-semibold">{t("title")}</h2>

      <dl className="mt-3 space-y-2 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">{t("lastSynced")}</dt>
          <dd>
            {lastSyncedAt
              ? format.relativeTime(new Date(lastSyncedAt))
              : t("never")}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted">{t("queuedLabel")}</dt>
          <dd className="tabular-nums">{queued ?? 0}</dd>
        </div>
      </dl>

      {state === "error" && error ? (
        <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger-soft-foreground">
          {error}
        </p>
      ) : null}

      {rejections?.length ? (
        <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning-soft-foreground">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle size={14} aria-hidden />
            {t("rejectedTitle", { count: rejections.length })}
          </p>
          {/* The reason matters more than the id — "note cap reached" is
              something the user can act on, a UUID is not. */}
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {[...new Set(rejections.map((r) => r.reason))].map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={async () => {
              await clearRejections();
              setRefreshKey((k) => k + 1);
            }}
            className="mt-2 rounded-lg px-2 py-1 text-[12px] font-medium underline underline-offset-2"
          >
            {t("dismissRejected")}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onSyncNow}
        disabled={busy || state === "syncing"}
        className="mt-3 flex items-center gap-2 rounded-xl bg-surface-secondary px-3 py-2 text-[13px] font-medium transition-colors hover:bg-surface-tertiary disabled:opacity-60"
      >
        <RefreshCw size={14} className={busy || state === "syncing" ? "animate-spin" : ""} aria-hidden />
        {t("syncNow")}
      </button>
    </section>
  );
}
