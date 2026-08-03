"use client";

import {useLocale, useTranslations} from "next-intl";
import {useId, useMemo, useState} from "react";
import type {LocalReminder} from "@/features/storage";
import {DEFAULT_REMINDER_TIME, type ReminderSpec} from "../model/reminder";

/**
 * Sets a daily/weekly reminder on a note — docs/10 §10.4 (free half).
 *
 * The honesty requirement from docs/00 §0.2 lives HERE, at the moment the
 * reminder is set: without a server, delivery is best-effort while the app is
 * open. Saying so plainly is also conversion trigger #4 (docs/00 §0.6).
 */
export function ReminderDialog({
  reminder,
  onSave,
  onClear,
  onClose,
}: {
  reminder: LocalReminder | null;
  onSave: (spec: ReminderSpec) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations("reminders");
  const locale = useLocale();
  const titleId = useId();

  const [repeat, setRepeat] = useState<"daily" | "weekly">(
    reminder?.repeat === "weekly" ? "weekly" : "daily",
  );
  const [time, setTime] = useState(reminder?.time ?? DEFAULT_REMINDER_TIME);
  const [weekday, setWeekday] = useState(reminder?.weekday ?? new Date().getDay());

  // Localized weekday names, Sunday-first to match Date#getDay indices.
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: "long" });
    // 2026-07-19 is a Sunday.
    return Array.from({ length: 7 }, (_, day) => format.format(new Date(2026, 6, 19 + day)));
  }, [locale]);

  async function save() {
    // Ask for notification permission on the user gesture that shows intent.
    // Denial is fine — the in-app overdue list still works.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        // Older Safari takes a callback; if even that shape fails, move on.
      }
    }
    await onSave({ repeat, time, weekday: repeat === "weekly" ? weekday : undefined });
    onClose();
  }

  const fieldClass =
    "w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-[var(--shadow-modal)]">
        <h2 id={titleId} className="text-[16px] font-semibold">
          {t("dialogTitle")}
        </h2>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-[12.5px] font-medium text-muted">
            <span id={`${titleId}-repeat`}>{t("repeatLabel")}</span>
            <div className="flex items-center gap-2">
              <span className={repeat === "daily" ? "text-foreground" : undefined}>
                {t("repeatDaily")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={repeat === "weekly"}
                aria-labelledby={`${titleId}-repeat`}
                onClick={() => setRepeat((r) => (r === "daily" ? "weekly" : "daily"))}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  repeat === "weekly" ? "bg-accent" : "bg-surface-secondary"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
                    repeat === "weekly" ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className={repeat === "weekly" ? "text-foreground" : undefined}>
                {t("repeatWeekly")}
              </span>
            </div>
          </div>

          {repeat === "weekly" && (
            <label className="flex flex-col gap-1 text-[12.5px] font-medium text-muted">
              {t("weekdayLabel")}
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                className={fieldClass}
              >
                {weekdays.map((name, day) => (
                  <option key={day} value={day}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-[12.5px] font-medium text-muted">
            {t("timeLabel")}
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value || DEFAULT_REMINDER_TIME)}
              className={fieldClass}
            />
          </label>
        </div>

        {/* The free-tier truth, stated where the promise is made. */}
        <p className="mt-3 rounded-xl bg-surface-secondary px-3 py-2 text-[12px] leading-relaxed text-muted">
          {t("bestEffortNote")}
        </p>

        <div className="mt-5 flex items-center gap-2">
          {reminder && (
            <button
              type="button"
              onClick={async () => {
                await onClear();
                onClose();
              }}
              className="rounded-xl px-3 py-2 text-[13px] font-medium text-danger transition-colors hover:bg-danger-soft"
            >
              {t("remove")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-secondary"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-xl bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
