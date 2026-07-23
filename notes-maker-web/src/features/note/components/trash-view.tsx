"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useToast } from "@/shared/ui/toast";
import { useNotes } from "../hooks/use-notes";
import { emptyTrash, restoreNote } from "../repo/note-repo";
import { NoteRow, rowActionClass } from "./note-row";
import { EmptyState } from "./archive-view";

export function TrashView() {
  const t = useTranslations();
  const notes = useNotes("trash");
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t("trash.title")}</h1>
        {notes && notes.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
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
              actions={
                <button
                  type="button"
                  aria-label={t("trash.restore")}
                  className={rowActionClass}
                  onClick={async () => {
                    await restoreNote(note.client_id);
                    toast.show({ message: t("note.restored") });
                  }}
                >
                  <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
                </button>
              }
            />
          ))}
        </ul>
      )}

      {/*
        The ONE action in the app that confirms — docs/06 §6.5. Everything else
        is optimistic with undo, precisely so that this dialog still carries
        weight when it appears.
      */}
      {confirming && notes && (
        <ConfirmEmptyTrash
          count={notes.length}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            const removed = await emptyTrash();
            setConfirming(false);
            toast.show({ message: t("trash.emptied", { count: removed }) });
          }}
        />
      )}
    </div>
  );
}

function ConfirmEmptyTrash({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const t = useTranslations("trash");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="empty-trash-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-[var(--shadow-modal)]">
        <h2 id="empty-trash-title" className="text-[16px] font-semibold">
          {t("confirmTitle")}
        </h2>
        <p className="mt-2 text-[13.5px] text-muted">{t("confirmBody", { count })}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-secondary"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => void onConfirm()}
            className="rounded-xl bg-danger px-3.5 py-2 text-[13px] font-semibold text-danger-foreground transition-colors hover:opacity-90"
          >
            {t("confirmCta")}
          </button>
        </div>
      </div>
    </div>
  );
}
