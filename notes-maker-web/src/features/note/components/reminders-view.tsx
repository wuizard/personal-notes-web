"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {Bell, Check} from "lucide-react";
import {useLocale, useTranslations} from "next-intl";
import {useRouter} from "@/i18n/navigation";
import type {LocalNote} from "@/features/storage";
import {isDue} from "../model/reminder";
import {dismissReminderOccurrence, listReminderNotes} from "../repo/note-repo";
import {NoteRow, rowActionClass} from "./note-row";

/**
 * The Reminders screen — docs/10 §10.4, the free (local) half.
 *
 * Due reminders first, upcoming after. "Done" rolls a recurring reminder to
 * its next occurrence rather than deleting it. The banner at the top repeats
 * the best-effort truth from the set-reminder dialog.
 */
export function RemindersView() {
  const t = useTranslations("reminders");
  const locale = useLocale();
  const router = useRouter();
  const notes = useLiveQuery(() => listReminderNotes(), []);

  const open = (id: string) => router.push({ pathname: "/notes", query: { note: id } });

  const due = (notes ?? []).filter((n) => n.reminder && isDue(n.reminder));
  const upcoming = (notes ?? []).filter((n) => n.reminder && !isDue(n.reminder));

  const describe = (note: LocalNote) => {
    const r = note.reminder;
    if (!r) return "";
    const when = new Intl.DateTimeFormat(locale, {
      weekday: r.repeat === "weekly" ? "long" : undefined,
      hour: "2-digit",
      minute: "2-digit",
    }).format(r.remind_at);
    return `${r.repeat === "weekly" ? t("repeatWeekly") : t("repeatDaily")} · ${when}`;
  };

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto p-4 md:p-6">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">{t("title")}</h1>

      <p className="mb-4 rounded-xl bg-surface-secondary px-3 py-2 text-[12.5px] leading-relaxed text-muted">
        {t("bestEffortNote")}
      </p>

      {notes === undefined ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-[var(--card-border)] bg-surface-secondary"
            />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
            <Bell size={24} strokeWidth={1.75} aria-hidden />
          </span>
          <p className="text-[15px] font-medium">{t("emptyTitle")}</p>
          <p className="max-w-[38ch] text-sm text-muted">{t("emptyBody")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {due.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                {t("dueSection")}
              </h2>
              <ul className="flex flex-col gap-2" role="list">
                {due.map((note) => (
                  <NoteRow
                    key={note.client_id}
                    note={note}
                    onOpen={open}
                    meta={describe(note)}
                    actions={
                      <button
                        type="button"
                        aria-label={t("done")}
                        title={t("done")}
                        className={rowActionClass}
                        onClick={() => void dismissReminderOccurrence(note.client_id)}
                      >
                        <Check size={14} strokeWidth={2} aria-hidden />
                      </button>
                    }
                  />
                ))}
              </ul>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                {t("upcomingSection")}
              </h2>
              <ul className="flex flex-col gap-2" role="list">
                {upcoming.map((note) => (
                  <NoteRow key={note.client_id} note={note} onOpen={open} meta={describe(note)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
