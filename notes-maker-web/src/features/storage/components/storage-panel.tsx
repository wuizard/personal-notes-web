"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {AlertTriangle, Check, Download, HardDrive, Upload} from "lucide-react";
import {useFormatter, useTranslations} from "next-intl";
import {useCallback, useRef, useState} from "react";
import {
    BackupError,
    downloadBackup,
    estimateStorage,
    getDb,
    getLastExportAt,
    importBackup,
    type ImportMode,
    type ImportResult,
    isPersisted,
    isQuotaCritical,
    measureUserData,
    requestPersistence,
    type StorageEstimate,
} from "..";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Settings → Data — docs/06 §6.14.
 *
 * Because there is no account, this panel is where identity would normally
 * live, and it has to make the data situation legible: where notes are, how
 * much room they take, whether the browser can evict them, and how to get a
 * copy out.
 */
export function StoragePanel() {
  const t = useTranslations();
  const format = useFormatter();

  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const noteCount = useLiveQuery(
    async () => (await getDb().notes.toArray()).filter((n) => n.deleted_at === null).length,
    [],
  );
  const lastExport = useLiveQuery(() => getLastExportAt(), [refreshKey]);

  // navigator.storage is an external async source with no change event, so it
  // is read through useLiveQuery keyed on an explicit refresh counter. This
  // avoids a useEffect that calls setState, which triggers a cascading render
  // (and is flagged by react-hooks/set-state-in-effect).
  const estimate = useLiveQuery<StorageEstimate | undefined>(
    () => estimateStorage(),
    [refreshKey],
  );
  const persisted = useLiveQuery<boolean | undefined>(() => isPersisted(), [refreshKey]);

  // Re-runs whenever notes or files change, because it touches both tables.
  const userData = useLiveQuery(() => measureUserData(), [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function onExport() {
    setBusy("export");
    setError(null);
    setStatus(null);
    try {
      await downloadBackup();
      setStatus(t("backup.exported"));
      refresh();
    } catch {
      setError(t("backup.error.unknown"));
    } finally {
      setBusy(null);
    }
  }

  async function onImport(file: File) {
    setBusy("import");
    setError(null);
    setStatus(null);
    try {
      const result: ImportResult = await importBackup(file, mode);
      setStatus(
        t("backup.result", {
          added: result.notesAdded,
          updated: result.notesUpdated,
          skipped: result.notesSkipped,
        }),
      );
      refresh();
    } catch (err) {
      // BackupError carries a stable code so the copy can be translated; any
      // other throw is genuinely unexpected and gets the generic message.
      setError(
        err instanceof BackupError
          ? t(`backup.error.${err.code}`)
          : t("backup.error.unknown"),
      );
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const critical = estimate ? isQuotaCritical(estimate) : false;

  return (
    <div className="flex flex-col gap-6">
      {/* ── storage ── */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <HardDrive size={17} strokeWidth={1.75} aria-hidden />
          {t("storage.title")}
        </h2>

        <dl className="mt-4 flex flex-col gap-2.5 text-[13.5px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("nav.notes")}</dt>
            <dd className="tabular-nums">{noteCount ?? "—"}</dd>
          </div>
          {/*
            The user's own data, shown first and on its own.
            `estimate().usage` below is origin-wide — it counts the cached app
            bundle too, which dwarfs the notes and makes the figure read as if
            a single note were consuming megabytes.
          */}
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("storage.yourData")}</dt>
            <dd className="tabular-nums">
              {userData ? formatBytes(userData.total) : "—"}
            </dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              {t("storage.siteTotal")}
              <span className="mt-0.5 block max-w-[34ch] text-[11.5px] text-ink-subtle">
                {t("storage.siteTotalHint")}
              </span>
            </dt>
            <dd className="shrink-0 tabular-nums">
              {estimate?.supported && estimate.quota > 0
                ? t("storage.used", {
                    used: formatBytes(estimate.usage),
                    total: formatBytes(estimate.quota),
                  })
                : t("storage.unknown")}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t("storage.persistence")}</dt>
            <dd className="flex items-center gap-1.5">
              {persisted ? (
                <>
                  <Check size={14} strokeWidth={2.5} className="text-success" aria-hidden />
                  {t("storage.persistenceOn")}
                </>
              ) : (
                t("storage.persistenceOff")
              )}
            </dd>
          </div>
        </dl>

        {estimate?.supported && estimate.quota > 0 && (
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-tertiary"
            role="progressbar"
            aria-valuenow={Math.round(estimate.ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("storage.title")}
          >
            <div
              className={`h-full rounded-full ${critical ? "bg-warning" : "bg-accent"}`}
              style={{ width: `${Math.max(estimate.ratio * 100, 1)}%` }}
            />
          </div>
        )}

        {critical && (
          <p className="mt-3 flex gap-2 rounded-xl bg-warning-soft p-3 text-[13px] text-warning-soft-foreground">
            <AlertTriangle size={15} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
            {t("storage.quotaWarning")}
          </p>
        )}

        {persisted === false && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[13px] text-muted">{t("storage.persistenceExplain")}</p>
            <button
              type="button"
              onClick={async () => {
                await requestPersistence();
                refresh();
              }}
              className="mt-3 rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              {t("storage.protect")}
            </button>
          </div>
        )}
      </section>

      {/* ── backup ── */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-[15px] font-semibold">{t("backup.title")}</h2>
        <p className="mt-1.5 text-[13px] text-muted">{t("backup.explain")}</p>

        <p className="mt-3 text-[12.5px] text-ink-subtle">
          {t("backup.lastExport", {
            date: lastExport
              ? format.dateTime(new Date(lastExport), { dateStyle: "medium" })
              : t("backup.never"),
          })}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={busy !== null}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            <Download size={15} strokeWidth={2} aria-hidden />
            {busy === "export" ? t("backup.exporting") : t("backup.export")}
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-surface-secondary disabled:opacity-60"
          >
            <Upload size={15} strokeWidth={2} aria-hidden />
            {busy === "import" ? t("backup.importing") : t("backup.import")}
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
            }}
          />
        </div>

        <fieldset className="mt-4">
          <legend className="sr-only">{t("backup.import")}</legend>
          <div className="flex flex-col gap-2">
            {(["merge", "replace"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2.5 text-[13px]">
                <input
                  type="radio"
                  name="import-mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="accent-[var(--accent)]"
                />
                {t(`backup.mode.${m}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Live region: import/export finish asynchronously, and a screen
            reader user gets no other signal that anything happened. */}
        <div aria-live="polite" className="mt-3 empty:hidden">
          {status && (
            <p className="rounded-xl bg-success-soft p-3 text-[13px] text-success-soft-foreground">
              {status}
            </p>
          )}
          {error && (
            <p className="rounded-xl bg-danger-soft p-3 text-[13px] text-danger-soft-foreground">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
