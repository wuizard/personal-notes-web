"use client";

import dynamic from "next/dynamic";
import { ListChecks, NotepadText, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import {
  NOTE_COLORS,
  type ChecklistItem,
  type NoteColor,
  type NoteDoc,
} from "@/features/storage";
import { usePersistencePrompt } from "@/features/storage/hooks/use-persistence-prompt";
import { addFile } from "@/features/file/repo";
import { useFileInput } from "@/features/file/use-file-input";
import { PendingAttachmentStrip } from "@/features/file/components/attachment-strip";
import { useLiveQuery } from "dexie-react-hooks";
import { splitTitle } from "../model/body-text";
import { checklistToDoc, docToChecklist, newChecklistItem } from "../model/convert";
import { createNote } from "../repo/note-repo";
import { recordCapturePhrases, topSuggestions } from "../repo/suggestions";
import { ChecklistEditor } from "./checklist-editor";

// Tiptap and ProseMirror are ~90KB gzipped. Loading them lazily keeps them off
// the initial bundle, which is what the docs/06 §6.10 budget is protecting —
// the note list must render before the editor is needed.
const RichTextEditor = dynamic(() => import("@/features/editor/rich-text-editor"), {
  ssr: false,
  loading: () => <div className="min-h-6" aria-busy="true" />,
});

const EMPTY_DOC: NoteDoc = { type: "doc", content: [{ type: "paragraph" }] };

type Mode = "checklist" | "note";

/**
 * Capture, at the top of the list pane — docs/06 §6.2.
 *
 * Creates a CHECKLIST by default (docs/10 §10.1) — Keep's model inverted,
 * because quick to-dos are the dominant capture pattern. A note is one tap
 * away, and switching modes mid-compose converts what was already typed
 * rather than discarding it. It never opens a modal.
 */
export function QuickCompose({ onCreated }: { onCreated?: (id: string) => void }) {
  const t = useTranslations();
  const params = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>("checklist");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
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

  const itemsFilled = items.some((i) => i.text.trim().length > 0);
  const hasContent =
    mode === "checklist"
      ? itemsFilled || title.trim().length > 0 || pending.length > 0
      : text.trim().length > 0 || pending.length > 0;

  // One-tap suggestions from the user's own history — docs/10 §10.2. Shown
  // only while the capture surface is still empty; a chip pre-fills, never
  // auto-saves. useLiveQuery re-runs when the phrase table or setting change.
  const showSuggestions = expanded && mode === "checklist" && !hasContent;
  const suggestions = useLiveQuery(
    () => (showSuggestions ? topSuggestions() : Promise.resolve([] as string[])),
    [showSuggestions],
  );

  function applySuggestion(phrase: string) {
    setItems((current) => {
      const list = current.length ? current.slice() : [newChecklistItem(0)];
      const at = list.findIndex((i) => !i.text.trim());
      if (at === -1) list.push(newChecklistItem(list.length, phrase));
      else list[at] = { ...list[at], text: phrase };
      return list.map((item, order) => ({ ...item, order }));
    });
  }

  function open(next: Mode) {
    setMode(next);
    if (next === "checklist" && items.length === 0) setItems([newChecklistItem(0)]);
    setExpanded(true);
  }

  /** Converts what was typed so far instead of throwing it away. */
  function switchMode() {
    if (mode === "checklist") {
      const kept = items.filter((i) => i.text.trim().length > 0);
      const listDoc = checklistToDoc(kept);
      const heading = title.trim();
      const content = [
        ...(heading ? [{ type: "paragraph", content: [{ type: "text", text: heading }] }] : []),
        ...(listDoc.content ?? []),
      ];
      setDoc({ type: "doc", content: content.length ? content : [{ type: "paragraph" }] });
      setText([heading, ...kept.map((i) => i.text)].filter(Boolean).join("\n"));
      setTitle("");
      setMode("note");
    } else {
      const { title: extracted, body } = splitTitle(doc);
      const next = docToChecklist(body);
      setTitle(extracted);
      setItems(next.length ? next : [newChecklistItem(0)]);
      setMode("checklist");
    }
  }

  function reset() {
    setMode("checklist");
    setTitle("");
    setItems([]);
    setDoc(EMPTY_DOC);
    setText("");
    setPending([]);
    setExpanded(false);
  }

  async function submit() {
    // An empty capture is discarded silently — the user knows (docs/06 §6.2).
    if (!hasContent || busy) return;

    setBusy(true);
    try {
      let note;
      if (mode === "checklist") {
        const cleaned = items
          .filter((i) => i.text.trim().length > 0)
          .map((i, order) => ({ ...i, order }));
        note = await createNote({
          kind: "checklist",
          title: title.trim().slice(0, 200),
          checklist: cleaned,
          body: EMPTY_DOC,
          color: initialColor,
        });
        // Feeds the suggestion history (docs/10 §10.2). Fire-and-forget: a
        // failure here must never make a successful save look failed.
        void recordCapturePhrases(cleaned.map((i) => i.text)).catch(() => {});
      } else {
        // The first block becomes the title and is removed from the body.
        // Keeping it in both is what made a new note show its title twice.
        const { title: split, body } = splitTitle(doc);
        note = await createNote({ title: split, body, color: initialColor });
      }

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
      <div className="flex w-full items-center rounded-2xl border border-[var(--card-border)] bg-surface pr-1 shadow-[var(--shadow-rest)] transition-shadow hover:shadow-[var(--shadow-hover)]">
        <button
          type="button"
          data-compose-trigger
          onClick={() => open("checklist")}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-[14px] text-ink-subtle"
        >
          <ListChecks size={16} strokeWidth={1.75} aria-hidden />
          <span className="flex-1 truncate">{t("note.composeListPlaceholder")}</span>
        </button>
        <button
          type="button"
          onClick={() => open("note")}
          aria-label={t("note.composeNote")}
          title={t("note.composeNote")}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-secondary hover:text-foreground"
        >
          <NotepadText size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      onPaste={attach.onPaste}
      onDrop={attach.onDrop}
      onDragOver={attach.onDragOver}
      className="rounded-2xl border border-[var(--card-border)] bg-surface p-3 shadow-[var(--shadow-rest)] focus-within:border-accent focus-within:ring-1 focus-within:ring-accent"
    >
      {mode === "checklist" ? (
        <>
          <label className="sr-only" htmlFor="compose-title">
            {t("note.titlePlaceholder")}
          </label>
          <input
            id="compose-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("note.titlePlaceholder")}
            className="w-full bg-transparent px-1 text-[14px] font-semibold outline-none placeholder:opacity-40"
          />
          <ChecklistEditor
            items={items}
            onChange={setItems}
            autoFocus
            className="mt-1 text-[14px] leading-6"
          />
          {showSuggestions && (suggestions?.length ?? 0) > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestions?.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => applySuggestion(phrase)}
                  className="max-w-full truncate rounded-full bg-surface-secondary px-3 py-1 text-[12.5px] text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-foreground"
                >
                  {phrase}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <RichTextEditor
          initialDoc={doc}
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
              title={t("editor.addFile")}
              className="grid size-7 place-items-center rounded-md opacity-60 transition-opacity hover:opacity-100"
            >
              <Paperclip size={14} strokeWidth={2} aria-hidden />
            </button>
          }
        />
      )}

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

      <div className="mt-2 flex items-center gap-2 border-t border-[var(--card-border)] pt-2">
        <button
          type="button"
          onClick={switchMode}
          aria-label={mode === "checklist" ? t("note.composeNote") : t("note.composeList")}
          title={mode === "checklist" ? t("note.composeNote") : t("note.composeList")}
          className="grid size-7 place-items-center rounded-md opacity-60 transition-opacity hover:opacity-100"
        >
          {mode === "checklist" ? (
            <NotepadText size={15} strokeWidth={1.75} aria-hidden />
          ) : (
            <ListChecks size={15} strokeWidth={1.75} aria-hidden />
          )}
        </button>
        {mode === "checklist" && (
          <button
            type="button"
            onClick={attach.openPicker}
            aria-label={t("editor.addFile")}
            title={t("editor.addFile")}
            className="grid size-7 place-items-center rounded-md opacity-60 transition-opacity hover:opacity-100"
          >
            <Paperclip size={14} strokeWidth={2} aria-hidden />
          </button>
        )}
        {initialColor !== "paper" && (
          <span
            className="size-4 rounded-full border border-[var(--card-border)]"
            style={{ background: `var(--note-${initialColor})` }}
            aria-hidden
          />
        )}
        <button
          type="button"
          onClick={reset}
          className="ml-auto rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-surface-secondary"
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
