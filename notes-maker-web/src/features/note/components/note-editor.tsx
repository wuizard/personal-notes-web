"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Archive, ArrowLeft, Check, Pin, PinOff, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { NOTE_COLORS, type NoteColor } from "@/features/storage";
import { docFromText, flattenDoc } from "../model/body-text";
import { getNote, setArchived, setPinned, trashNote, updateNote } from "../repo/note-repo";

const SAVE_DEBOUNCE_MS = 600;

interface Draft {
  title: string;
  body: string;
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

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void) | null>(null);

  const title = draft?.title ?? note?.title ?? "";
  const body = draft?.body ?? (note ? flattenDoc(note.body) : "");

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
          body: docFromText(next.body),
        }).then(() => setSaved(true));
      };

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
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

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ background: `var(--note-${note.color})`, color: "var(--note-ink)" }}
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
          onChange={(e) => schedule({ title: e.target.value, body })}
          onBlur={flush}
          placeholder={t("note.titlePlaceholder")}
          className="w-full bg-transparent text-[19px] font-semibold tracking-tight outline-none placeholder:opacity-40"
        />

        <label className="sr-only" htmlFor="note-body">
          {t("editor.bodyPlaceholder")}
        </label>
        <textarea
          id="note-body"
          value={body}
          onChange={(e) => schedule({ title, body: e.target.value })}
          onBlur={flush}
          placeholder={t("editor.bodyPlaceholder")}
          className="mt-3 min-h-64 w-full flex-1 resize-none bg-transparent text-[16px] leading-[1.65] outline-none placeholder:opacity-40"
        />
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
    </div>
  );
}
