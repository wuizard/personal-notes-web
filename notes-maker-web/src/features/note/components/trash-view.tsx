"use client";

import { RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useToast } from "@/shared/ui/toast";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useNotes } from "../hooks/use-notes";
import { deleteForever, emptyTrash, restoreNote, trashDaysLeft } from "../repo/note-repo";
import { NoteRow, rowActionClass } from "./note-row";
import { EmptyState } from "./archive-view";

export function TrashView() {
  const t = useTranslations();
  const notes = useNotes("trash");
  const toast = useToast();
  const [confirmingAll, setConfirmingAll] = useState(false);
  // Note id awaiting "delete forever" confirmation, or null.
  const [confirmingOne, setConfirmingOne] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t("trash.title")}</h1>
        {notes && notes.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmingAll(true)}
            className="ml-auto rounded-xl border border-border px-3 py-1.5 text-[13px] font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            {t("trash.emptyAction")}
          </button>
        )}
      </div>

      <p className="mb-4 text-[13px] text-muted">{t("trash.emptyBody")}</p>

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
        <EmptyState title={t("trash.emptyTitle")} body={t("trash.emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {notes.map((note) => (
            <NoteRow
              key={note.client_id}
              note={note}
              // deleted_at is always set for a row the trash filter returned.
              meta={t("trash.daysLeft", { count: trashDaysLeft(note.deleted_at ?? 0) })}
              actions={
                <>
                  <button
                    type="button"
                    aria-label={t("trash.restore")}
                    title={t("trash.restore")}
                    className={rowActionClass}
                    onClick={async () => {
                      await restoreNote(note.client_id);
                      toast.show({ message: t("note.restored") });
                    }}
                  >
                    <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t("trash.deleteForever")}
                    title={t("trash.deleteForever")}
                    className={rowActionClass}
                    onClick={() => setConfirmingOne(note.client_id)}
                  >
                    <X size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                </>
              }
            />
          ))}
        </ul>
      )}

      {/*
        The only actions in the app that confirm — docs/06 §6.5, docs/10 §10.8.
        Everything reversible is optimistic with undo, precisely so these
        dialogs still carry weight when they appear. A snackbar-undo would be
        wrong here: undo must only be offered for actions that CAN be undone.
      */}
      {confirmingAll && notes && (
        <ConfirmDialog
          title={t("trash.confirmTitle")}
          body={t("trash.confirmBody", { count: notes.length })}
          confirmLabel={t("trash.confirmCta")}
          cancelLabel={t("trash.cancel")}
          danger
          onCancel={() => setConfirmingAll(false)}
          onConfirm={async () => {
            await emptyTrash();
            setConfirmingAll(false);
            toast.show({ message: t("trash.emptied") });
          }}
        />
      )}

      {confirmingOne && (
        <ConfirmDialog
          title={t("trash.deleteForeverTitle")}
          body={t("trash.deleteForeverBody")}
          confirmLabel={t("trash.confirmCta")}
          cancelLabel={t("trash.cancel")}
          danger
          onCancel={() => setConfirmingOne(null)}
          onConfirm={async () => {
            await deleteForever(confirmingOne);
            setConfirmingOne(null);
            toast.show({ message: t("trash.deletedForever") });
          }}
        />
      )}
    </div>
  );
}
