"use client";

import dynamic from "next/dynamic";
import { Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { NOTE_COLORS, type NoteColor, type NoteDoc } from "@/features/storage";
import { usePersistencePrompt } from "@/features/storage/hooks/use-persistence-prompt";
import { addFile } from "@/features/file/repo";
import { useFileInput } from "@/features/file/use-file-input";
import { PendingAttachmentStrip } from "@/features/file/components/attachment-strip";
import { splitTitle } from "../model/body-text";
import { createNote } from "../repo/note-repo";

// Tiptap and ProseMirror are ~90KB gzipped. Loading them lazily keeps them off
// the initial bundle, which is what the docs/06 §6.10 budget is protecting —
// the note list must render before the editor is needed.
const RichTextEditor = dynamic(() => import("@/features/editor/rich-text-editor"), {
  ssr: false,
  loading: () => <div className="min-h-6" aria-busy="true" />,
});

const EMPTY_DOC: NoteDoc = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Capture, at the top of the list pane — docs/06 §6.2.
 *
 * Collapsed to a single line until touched, then expands in place into a rich
 * editor with formatting and an image button. It never opens a modal.
 */
export function QuickCompose({ onCreated }: { onCreated?: (id: string) => void }) {
  const t = useTranslations();
  const params = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const [doc, setDoc] = useState<NoteDoc>(EMPTY_DOC);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const { maybePrompt } = usePersistencePrompt();

  // Files can't be stored before the note exists (they key off note_id), so
  // they're held here and written immediately after the note is created.
  const attach = useFileInput(
    useCallback(async (files: File[]) => {
      setPending((current) => [...current, ...files]);
    }, []),
  );

  // Handed over from the landing swatches (/notes?color=mint), validated
  // against the palette so a hand-edited URL cannot write a bogus colour.
  const requested = params.get("color");
  const initialColor: NoteColor = NOTE_COLORS.includes(requested as NoteColor)
    ? (requested as NoteColor)
    : "paper";

  const hasContent = text.trim().length > 0 || pending.length > 0;

  function reset() {
    setDoc(EMPTY_DOC);
    setText("");
    setPending([]);
    setExpanded(false);
  }

  async function submit() {
    // An empty note is discarded silently — the user knows (docs/06 §6.2).
    if (!hasContent || busy) return;

    setBusy(true);
    try {
      // The first block becomes the title and is removed from the body.
      // Keeping it in both is what made a new note show its title twice.
      const { title, body } = splitTitle(doc);
      const note = await createNote({ title, body, color: initialColor });

      // Sequential rather than Promise.all: each image decodes a full-size
      // bitmap, and doing several at once is how a mid-range phone OOMs.
      for (const file of pending) {
        await addFile(note.client_id, file);
      }

      reset();
      onCreated?.(note.client_id);
      await maybePrompt();
    } finally {
      setBusy(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        data-compose-trigger
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-[var(--card-border)] bg-surface px-3 py-2.5 text-left text-[14px] text-ink-subtle shadow-[var(--shadow-rest)] transition-shadow hover:shadow-[var(--shadow-hover)]"
      >
        <span className="flex-1">{t("note.composePlaceholder")}</span>
        <Paperclip size={16} strokeWidth={1.75} aria-hidden />
      </button>
    );
  }

  return (
    <div
      onPaste={attach.onPaste}
      onDrop={attach.onDrop}
      onDragOver={attach.onDragOver}
      className="rounded-xl border border-[var(--card-border)] bg-surface p-2.5 shadow-[var(--shadow-rest)] focus-within:border-accent focus-within:ring-1 focus-within:ring-accent"
    >
      <RichTextEditor
        initialDoc={EMPTY_DOC}
        placeholder={t("note.composePlaceholder")}
        autoFocus
        onChange={(nextDoc, nextText) => {
          setDoc(nextDoc);
          setText(nextText);
        }}
        onSubmit={() => void submit()}
        showToolbar
        className="text-[14px] leading-6"
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

      <input {...attach.inputProps} />

      {pending.length > 0 && (
        <div className="mt-2.5">
          <PendingAttachmentStrip
            files={pending}
            onRemove={(i) => setPending((list) => list.filter((_, idx) => idx !== i))}
          />
        </div>
      )}

      {attach.error && (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[12.5px] text-danger-soft-foreground">
          {attach.error}
        </p>
      )}

      <div className="mt-2 flex items-center justify-end gap-2 border-t border-[var(--card-border)] pt-2">
        {initialColor !== "paper" && (
          <span
            className="mr-auto size-4 rounded-full border border-[var(--card-border)]"
            style={{ background: `var(--note-${initialColor})` }}
            aria-hidden
          />
        )}
        <button
          type="button"
          onClick={reset}
          className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-surface-secondary"
        >
          {t("note.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !hasContent}
          className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {t("note.save")}
        </button>
      </div>
    </div>
  );
}
