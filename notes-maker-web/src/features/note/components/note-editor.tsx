"use client";

import {useLiveQuery} from "dexie-react-hooks";
import dynamic from "next/dynamic";
import {ArrowLeft, Bell, BellRing, Check, ListChecks, NotepadText, Paperclip,} from "lucide-react";
import {useTranslations} from "next-intl";
import {useCallback, useEffect, useRef, useState} from "react";
import {type ChecklistItem, NOTE_COLORS, type NoteColor, type NoteDoc, type NoteKind,} from "@/features/storage";
import {addFile} from "@/features/file/repo";
import {useFileInput} from "@/features/file/use-file-input";
import {AttachmentStrip} from "@/features/file/components/attachment-strip";
import {ConfirmDialog} from "@/shared/ui/confirm-dialog";
import {useToast} from "@/shared/ui/toast";
import {usePlan} from "@/features/plan/use-plan";
import {ConflictBanner} from "@/features/sync/components/conflict-banner";
import {isChecklistComplete, noteKind} from "../model/convert";
import {autoCompleteEnabled} from "../repo/completion";
import {clearReminder, convertNoteKind, getNote, setCompleted, setReminder, updateNote,} from "../repo/note-repo";
import {recordCapturePhrases} from "../repo/suggestions";
import {ChecklistEditor} from "./checklist-editor";
import {ReminderDialog} from "./reminder-dialog";

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
  const toast = useToast();
  const { plan } = usePlan();
  const note = useLiveQuery(() => getNote(noteId), [noteId]);
  // "Absent means enabled" — undefined only while the meta read is in
  // flight, and defaulting to on matches every other read of this setting.
  const autoComplete = useLiveQuery(() => autoCompleteEnabled(), []) ?? true;

  // Draft is null until the user types. Until then the rendered value is
  // derived straight from the stored note, which avoids initialising state in
  // an effect (and the cascading render that comes with it).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(true);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [editingReminder, setEditingReminder] = useState(false);

  // ── Completed flow — docs/10 §10.13a, Premium ──
  // The item id currently prompting "add a completion note?", or null.
  const [completePrompt, setCompletePrompt] = useState<string | null>(null);
  // The item id whose note the prompt sent the user to write, so the note
  // field's onBlur knows whether ITS commit is the one that should finally
  // settle the note as complete.
  const [pendingNoteItemId, setPendingNoteItemId] = useState<string | null>(null);
  // Controlled hand-off into ChecklistEditor's own note-editing UI.
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

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

  /** Settles the checklist as complete — the "skip" path, and where the
   *  "add a note" path lands too once that note is committed. */
  const finalizeComplete = useCallback(async () => {
    await setCompleted(noteId, true);
    toast.show({ message: t("checklist.completedToast") });
  }, [noteId, toast, t]);

  /** Fired once, the moment a checklist's last real item gets checked. */
  const handleJustCompleted = useCallback(
    (itemId: string | null) => {
      if (plan !== "premium") {
        toast.show({ message: t("checklist.upsell") });
        return;
      }
      if (!autoComplete) return; // feature turned off in Settings — leave it as a fully-checked list, no move.
      if (itemId) setCompletePrompt(itemId);
      else void finalizeComplete(); // no single item to attach a note to — just settle it.
    },
    [plan, autoComplete, finalizeComplete, toast, t],
  );

  // Detects two transitions in the saved note, reacting rather than
  // intercepting the checklist's own onChange — the write is debounced, so
  // `note.checklist` only reflects a change once it actually lands, and
  // reacting to the settled value means every write path (this editor, a
  // future sync pull, anything) is covered by one rule instead of several
  // copies of the same logic. Seeded on the first sighting of a real note so
  // opening an already-complete or already-settled note is never mistaken
  // for something "just happening" (docs/10 §10.13a).
  const seeded = useRef(false);
  const prevChecklist = useRef<ChecklistItem[]>([]);
  const prevCompleted = useRef(false);
  useEffect(() => {
    if (!note) return;
    const checklist = note.checklist ?? [];
    const completed = Boolean(note.completed_at);

    if (!seeded.current) {
      seeded.current = true;
      prevChecklist.current = checklist;
      prevCompleted.current = completed;
      return;
    }

    // Any item unchecked while marked complete auto-restores at the data
    // layer (note-repo.ts's updateNote) — this only announces it, regardless
    // of which caller triggered the write.
    if (prevCompleted.current && !completed) {
      toast.show({ message: t("checklist.uncompleted") });
    } else if (!completed) {
      const wasComplete = isChecklistComplete(prevChecklist.current);
      const nowComplete = isChecklistComplete(checklist);
      if (!wasComplete && nowComplete) {
        const wasChecked = new Map(prevChecklist.current.map((i) => [i.id, i.checked]));
        const justChecked = checklist.find((i) => i.checked && wasChecked.get(i.id) === false);
        handleJustCompleted(justChecked?.id ?? null);
      }
    }

    prevChecklist.current = checklist;
    prevCompleted.current = completed;
  }, [note, handleJustCompleted, t, toast]);

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
      {/* Only on a note a sync conflict forked off — docs/04 §4.5 rule 3. */}
      {note.conflict_of ? <ConflictBanner /> : null}

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
            title={t("editor.back")}
            className="grid size-9 place-items-center rounded-xl opacity-70 transition-opacity hover:opacity-100"
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
            onClick={() => setEditingReminder(true)}
            aria-label={t("reminders.set")}
            title={t("reminders.set")}
            aria-pressed={note.reminder !== null}
            className="grid size-9 place-items-center rounded-xl opacity-70 transition-opacity hover:opacity-100"
          >
            {note.reminder ? (
              <BellRing size={17} strokeWidth={1.75} className="text-accent" aria-hidden />
            ) : (
              <Bell size={17} strokeWidth={1.75} aria-hidden />
            )}
          </button>
          {kind === "checklist" ? (
            <>
              {/* Notes get this button in the editor toolbar; a checklist has
                  no formatting toolbar, so the attach affordance lives here. */}
              <button
                type="button"
                onClick={attach.openPicker}
                aria-label={t("editor.addFile")}
                title={t("editor.addFile")}
                className="grid size-9 place-items-center rounded-xl opacity-70 transition-opacity hover:opacity-100"
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
            editingNoteId={editingNoteId}
            onEditingNoteIdChange={setEditingNoteId}
            onNoteCommitted={(id) => {
              // Only the note the completion prompt sent the user to write
              // should settle the checklist — committing some other item's
              // note along the way must not trigger it.
              if (id !== pendingNoteItemId) return;
              setPendingNoteItemId(null);
              void finalizeComplete();
            }}
            onItemCommitted={(text) => void recordCapturePhrases([text]).catch(() => {})}
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
                title={t("editor.addFile")}
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
            title={t(`color.${c}`)}
            aria-pressed={note.color === c}
            // Visually 22px, but padded to a 44px touch target (docs/05 §5.9).
            className="grid size-11 place-items-center rounded-full"
          >
            <span
              className={`block size-[22px] rounded-full border border-[var(--card-border)] ${
                // A coloured ring can vanish against a similar pastel (accent
                // purple over periwinkle, white over paper); a dark stroke
                // plus a drop shadow stays legible against every swatch,
                // including "paper", in both themes.
                note.color === c
                  ? "shadow-[0_1px_4px_rgba(0,0,0,0.4)] ring-2 ring-foreground ring-offset-2 ring-offset-[var(--editor-surface)]"
                  : ""
              }`}
              style={{ background: `var(--note-${c})` }}
            />
          </button>
        ))}
      </div>

      {editingReminder && (
        <ReminderDialog
          reminder={note.reminder}
          onSave={(spec) => setReminder(noteId, spec)}
          onClear={() => clearReminder(noteId)}
          onClose={() => setEditingReminder(false)}
        />
      )}

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

      {/* Fires once, the moment the last item is checked (docs/10 §10.13a).
          Both paths settle the note as complete — "Skip" does it immediately,
          "Add a note" opens that item's note field first and settles once it
          commits (see onNoteCommitted above). */}
      {completePrompt && (
        <ConfirmDialog
          title={t("checklist.completePromptTitle")}
          body={t("checklist.completePromptBody")}
          confirmLabel={t("checklist.completePromptAdd")}
          cancelLabel={t("checklist.completePromptSkip")}
          onCancel={() => {
            setCompletePrompt(null);
            void finalizeComplete();
          }}
          onConfirm={() => {
            const itemId = completePrompt;
            setCompletePrompt(null);
            setPendingNoteItemId(itemId);
            setEditingNoteId(itemId);
          }}
        />
      )}
    </div>
  );
}
