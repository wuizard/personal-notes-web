"use client";

import { useLiveQuery } from "dexie-react-hooks";
import dynamic from "next/dynamic";
import {
  Archive,
  ArrowLeft,
  Check,
  ListChecks,
  NotepadText,
  Paperclip,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOTE_COLORS,
  type ChecklistItem,
  type NoteColor,
  type NoteDoc,
  type NoteKind,
} from "@/features/storage";
import { addFile } from "@/features/file/repo";
import { useFileInput } from "@/features/file/use-file-input";
import { AttachmentStrip } from "@/features/file/components/attachment-strip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { noteKind } from "../model/convert";
import {
  convertNoteKind,
  getNote,
  setArchived,
  setPinned,
  trashNote,
  updateNote,
} from "../repo/note-repo";
import { ChecklistEditor } from "./checklist-editor";

const RichTextEditor = dynamic(() => import("@/features/editor/rich-text-editor"), {
  ssr: false,
  loading: () => <div className="min-h-24" aria-busy="true" />,
});

const SAVE_DEBOUNCE_MS = 600;

interface Draft {
  title: string;
  doc: NoteDoc;
  checklist?: ChecklistItem[];
}

/**
 * The detail pane — docs/06 §6.4.
 *
 * There is no Save button: the note is written to IndexedDB as you type. The
 * only interesting part is *when* the write is flushed, and getting that wrong
 * is how note apps lose the last paragraph someone wrote.
 *
 * Stage C replaces the body <textarea> with Tiptap. The save machinery around
 * it is final.
 */
export function NoteEditor({
  noteId,
  onClose,
  showBack,
}: {
  noteId: string;
  onClose: () => void;
  showBack: boolean;
}) {
  const t = useTranslations();
  const note = useLiveQuery(() => getNote(noteId), [noteId]);

  // Draft is null until the user types. Until then the rendered value is
  // derived straight from the stored note, which avoids initialising state in
  // an effect (and the cascading render that comes with it).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(true);
  const [confirmConvert, setConfirmConvert] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void) | null>(null);

  // Sequential, not Promise.all: each image decodes a full-size bitmap, and
  // several at once is how a mid-range phone runs out of memory.
  const attach = useFileInput(
    useCallback(
      async (files: File[]) => {
        for (const file of files) await addFile(noteId, file);
      },
      [noteId],
    ),
  );

  const title = draft?.title ?? note?.title ?? "";

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const run = pending.current;
    pending.current = null;
    run?.();
  }, []);

  const schedule = useCallback(
    (next: Draft) => {
      setDraft(next);
      setSaved(false);

      pending.current = () => {
        void updateNote(noteId, {
          title: next.title.slice(0, 200),
          body: next.doc,
          ...(next.checklist ? { checklist: next.checklist } : {}),
        }).then(() => setSaved(true));
      };

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush, noteId],
  );

  // Convert between kinds — docs/10 §10.1. The pending draft is flushed first
  // so the conversion reads what the user just typed, and the draft is then
  // dropped so the next render derives cleanly from the converted row.
  const convert = useCallback(
    async (to: NoteKind) => {
      flush();
      await convertNoteKind(noteId, to);
      setDraft(null);
    },
    [flush, noteId],
  );

  // Flush on the events that actually precede a tab being killed.
  // `beforeunload` is deliberately absent: it does not fire reliably on mobile
  // Safari, which is precisely where the tab gets discarded (docs/06 §6.4).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      // Unmount is a flush point too — switching notes must not drop the
      // last few hundred milliseconds of typing.
      flush();
    };
  }, [flush]);

  if (note === undefined) {
    return <div className="flex-1 animate-pulse bg-surface-secondary/40" aria-busy="true" />;
  }
  if (note === null || note.deleted_at !== null) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted">{t("editor.none")}</p>
      </div>
    );
  }

  const kind = noteKind(note);

  return (
    <div
      onPaste={attach.onPaste}
      onDrop={attach.onDrop}
      onDragOver={attach.onDragOver}
      className="flex min-h-0 flex-1 flex-col"
      style={
        {
          background: `var(--note-${note.color})`,
          color: "var(--note-ink)",
          // Inherited by the sticky toolbar so it is opaque in the note's own
          // colour; a transparent sticky bar lets text scroll under it.
          "--editor-surface": `var(--note-${note.color})`,
        } as React.CSSProperties
      }
    >
      {/* toolbar */}
      <div className="flex items-center gap-1 border-b border-[var(--card-border)] px-2 py-2">
        {showBack && (
          <button
            type="button"
            onClick={() => {
              flush();
              onClose();
            }}
            aria-label={t("editor.back")}
            className="grid size-9 place-items-center rounded-xl opacity-70 hover:opacity-100"
          >
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden />
          </button>
        )}

        <span className="ml-1 flex items-center gap-1.5 text-[11.5px] opacity-55" aria-live="polite">
          {saved && <Check size={12} strokeWidth={2.5} aria-hidden />}
          {saved ? t("editor.saved") : t("editor.saving")}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          {kind === "checklist" ? (
            <>
              {/* Notes get this button in the editor toolbar; a checklist has
                  no formatting toolbar, so the attach affordance lives here. */}
              <button
                type="button"
                onClick={attach.openPicker}
                aria-label={t("editor.addFile")}
                className="grid size-9 place-items-center rounded-xl opacity-70 hover:opacity-100"
              >
                <Paperclip size={16} strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void convert("note")}
                aria-label={t("note.convertToNote")}
                title={t("note.convertToNote")}
                className="grid size-9 place-items-center rounded-xl opacity-70 hover:opacity-100"
              >
                <NotepadText size={17} strokeWidth={1.75} aria-hidden />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmConvert(true)}
              aria-label={t("note.convertToChecklist")}
              title={t("note.convertToChecklist")}
              className="grid size-9 place-items-center rounded-xl opacity-70 hover:opacity-100"
            >
              <ListChecks size={17} strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => void setPinned(noteId, !note.pinned)}
            aria-label={note.pinned ? t("note.actions.unpin") : t("note.actions.pin")}
            aria-pressed={note.pinned}
            className="grid size-9 place-items-center rounded-xl opacity-70 hover:opacity-100"
          >
            {note.pinned ? (
              <PinOff size={17} strokeWidth={1.75} aria-hidden />
            ) : (
              <Pin size={17} strokeWidth={1.75} aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              flush();
              void setArchived(noteId, true).then(onClose);
            }}
            aria-label={t("note.actions.archive")}
            className="grid size-9 place-items-center rounded-xl opacity-70 hover:opacity-100"
          >
            <Archive size={17} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              flush();
              void trashNote(noteId).then(onClose);
            }}
            aria-label={t("note.actions.delete")}
            className="grid size-9 place-items-center rounded-xl opacity-70 hover:opacity-100"
          >
            <Trash2 size={17} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>

      {/* fields */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        <label className="sr-only" htmlFor="note-title">
          {t("note.titlePlaceholder")}
        </label>
        <input
          id="note-title"
          value={title}
          onChange={(e) =>
            schedule({
              title: e.target.value,
              doc: draft?.doc ?? note.body,
              checklist: draft?.checklist ?? note.checklist,
            })
          }
          onBlur={flush}
          placeholder={t("note.titlePlaceholder")}
          className="w-full bg-transparent text-[19px] font-semibold tracking-tight outline-none placeholder:opacity-40"
        />

        {kind === "checklist" ? (
          <ChecklistEditor
            items={draft?.checklist ?? note.checklist ?? []}
            onChange={(items) =>
              schedule({ title, doc: draft?.doc ?? note.body, checklist: items })
            }
            className="mt-3 flex-1 text-[16px] leading-[1.65]"
          />
        ) : (
          <RichTextEditor
            // Remount when the note changes so Tiptap reloads its content —
            // the editor owns its document after mount and ignores prop changes.
            key={noteId}
            initialDoc={note.body}
            placeholder={t("editor.bodyPlaceholder")}
            onChange={(nextDoc) => schedule({ title, doc: nextDoc })}
            onBlur={flush}
            showToolbar
            toolbarPosition="top"
            className="mt-3 flex-1 text-[16px] leading-[1.65]"
            toolbarExtra={
              <button
                type="button"
                onClick={attach.openPicker}
                aria-label={t("editor.addFile")}
                className="grid size-7 place-items-center rounded-md opacity-60 transition-opacity hover:opacity-100"
              >
                <Paperclip size={14} strokeWidth={2} aria-hidden />
              </button>
            }
          />
        )}

        <input {...attach.inputProps} />

        <div className="mt-3">
          <AttachmentStrip noteId={noteId} />
        </div>

        {attach.error && (
          <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[12.5px] text-danger-soft-foreground">
            {attach.error}
          </p>
        )}
      </div>

      {/* colour picker */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--card-border)] px-4 py-3">
        {NOTE_COLORS.map((c: NoteColor) => (
          <button
            key={c}
            type="button"
            onClick={() => void updateNote(noteId, { color: c })}
            aria-label={t(`color.${c}`)}
            aria-pressed={note.color === c}
            // Visually 22px, but padded to a 44px touch target (docs/05 §5.9).
            className="grid size-11 place-items-center rounded-full"
          >
            <span
              className={`block size-[22px] rounded-full border border-[var(--card-border)] ${
                note.color === c ? "ring-2 ring-accent ring-offset-1" : ""
              }`}
              style={{ background: `var(--note-${c})` }}
            />
          </button>
        ))}
      </div>

      {/* note → checklist flattens formatting, so it asks first — the other
          direction is lossless and converts immediately (docs/10 §10.1). */}
      {confirmConvert && (
        <ConfirmDialog
          title={t("note.convertWarnTitle")}
          body={t("note.convertWarnBody")}
          confirmLabel={t("note.convertWarnCta")}
          cancelLabel={t("note.cancel")}
          onCancel={() => setConfirmConvert(false)}
          onConfirm={async () => {
            setConfirmConvert(false);
            await convert("checklist");
          }}
        />
      )}
    </div>
  );
}
