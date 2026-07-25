"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useToast } from "@/shared/ui/toast";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { usePlan } from "@/features/plan/use-plan";
import type { LocalNote } from "@/features/storage";
import { useNotes } from "../hooks/use-notes";
import { setCompleted, trashNote } from "../repo/note-repo";
import { NoteRow, rowActionClass } from "./note-row";
import { EmptyState } from "./archive-view";

/**
 * Fully-checked checklists, settled here after the completion prompt —
 * docs/10 §10.13a. Premium: a free user sees the nav entry (an upgrade
 * surface, per docs/00 §0.6) but never anything actually in it, since
 * nothing can be marked complete without the plan.
 */
export function CompletedView() {
  const t = useTranslations();
  const { plan } = usePlan();
  const notes = useNotes("completed");
  const toast = useToast();
  // Same confirm-before-trash step as the main list (user request) — deleting
  // out of Completed is exactly as permanent-feeling as deleting anywhere else.
  const [confirmingDelete, setConfirmingDelete] = useState<LocalNote | null>(null);

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto p-4 md:p-6">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">{t("completed.title")}</h1>

      {plan !== "premium" ? (
        <EmptyState title={t("completed.lockedTitle")} body={t("completed.lockedBody")} />
      ) : notes === undefined ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-[var(--card-border)] bg-surface-secondary"
            />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState title={t("completed.emptyTitle")} body={t("completed.emptyBody")} />
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
                    aria-label={t("completed.restore")}
                    title={t("completed.restore")}
                    className={rowActionClass}
                    onClick={async () => {
                      await setCompleted(note.client_id, false);
                      toast.show({
                        message: t("completed.restored"),
                        actionLabel: t("note.undo"),
                        onAction: () => setCompleted(note.client_id, true),
                      });
                    }}
                  >
                    <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t("note.actions.delete")}
                    title={t("note.actions.delete")}
                    className={rowActionClass}
                    onClick={() => setConfirmingDelete(note)}
                  >
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                </>
              }
            />
          ))}
        </ul>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={t("note.deleteConfirmTitle")}
          body={t("note.deleteConfirmBody")}
          confirmLabel={t("note.deleteConfirmCta")}
          cancelLabel={t("note.cancel")}
          danger
          onCancel={() => setConfirmingDelete(null)}
          onConfirm={async () => {
            const note = confirmingDelete;
            setConfirmingDelete(null);
            await trashNote(note.client_id);
            toast.show({
              message: t("note.deleted"),
              actionLabel: t("note.undo"),
              onAction: () => import("../repo/note-repo").then((m) => m.restoreNote(note.client_id)),
            });
          }}
        />
      )}
    </div>
  );
}
