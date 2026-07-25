"use client";

import { ArchiveRestore, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@/shared/ui/toast";
import { useNotes } from "../hooks/use-notes";
import { setArchived, trashNote } from "../repo/note-repo";
import { NoteRow, rowActionClass } from "./note-row";

export function ArchiveView() {
  const t = useTranslations();
  const notes = useNotes("archived");
  const toast = useToast();

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto p-4 md:p-6">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">{t("archive.title")}</h1>

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
        <EmptyState title={t("archive.emptyTitle")} body={t("archive.emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {notes.map((note) => (
            <NoteRow
              key={note.client_id}
              note={note}
              actions={
                <>
                  <button
                    type="button"
                    aria-label={t("archive.unarchive")}
                    title={t("archive.unarchive")}
                    className={rowActionClass}
                    onClick={async () => {
                      await setArchived(note.client_id, false);
                      toast.show({
                        message: t("note.unarchived"),
                        actionLabel: t("note.undo"),
                        onAction: () => setArchived(note.client_id, true),
                      });
                    }}
                  >
                    <ArchiveRestore size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t("note.actions.delete")}
                    title={t("note.actions.delete")}
                    className={rowActionClass}
                    onClick={async () => {
                      await trashNote(note.client_id);
                      toast.show({
                        message: t("note.deleted"),
                        actionLabel: t("note.undo"),
                        // Restoring returns it to the archive it came from,
                        // not to the active list.
                        onAction: async () => {
                          const { restoreNote } = await import("../repo/note-repo");
                          await restoreNote(note.client_id);
                        },
                      });
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-20 text-center">
      <svg width="120" height="95" viewBox="0 0 76 60" fill="none" aria-hidden>
        <rect
          x="9" y="12" width="40" height="40" rx="7"
          fill="var(--note-clay)" stroke="var(--border)" strokeWidth="1.5"
          transform="rotate(-7 29 32)"
        />
        <rect
          x="26" y="8" width="40" height="40" rx="7"
          fill="var(--note-sky)" stroke="var(--border)" strokeWidth="1.5"
          transform="rotate(6 46 28)"
        />
        <path
          d="M36 22h18M36 29h14M36 36h9"
          stroke="var(--ink-subtle)" strokeWidth="2" strokeLinecap="round" opacity=".5"
        />
      </svg>
      <p className="text-[15px] font-medium">{title}</p>
      <p className="max-w-[36ch] text-sm text-muted">{body}</p>
    </div>
  );
}
