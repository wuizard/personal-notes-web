"use client";

import { Archive, Pin, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { QuickCompose } from "./quick-compose";
import { EmptyNotes } from "./empty-notes";
import { useNotes } from "../hooks/use-notes";
import { setArchived, setPinned, trashNote } from "../repo/note-repo";
import type { LocalNote } from "@/features/storage";

/**
 * The list pane. Capture sits at its top — not centred in the page — so the
 * act of writing is anchored to the library it joins.
 */
export function NoteList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useTranslations();
  const notes = useNotes("active");

  return (
    <>
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-ink-subtle">
          <Search size={15} strokeWidth={1.75} aria-hidden />
          {t("nav.search")}
        </div>
        <QuickCompose onCreated={onSelect} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {notes === undefined ? (
          <div className="flex flex-col gap-2 p-1" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-[var(--card-border)] bg-surface-secondary"
              />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <EmptyNotes />
        ) : (
          <ul className="flex flex-col gap-1.5" role="list">
            {notes.map((note) => (
              <NoteListItem
                key={note.client_id}
                note={note}
                selected={note.client_id === selectedId}
                onSelect={onSelect}
                onRemoved={(id) => {
                  if (id === selectedId) onSelect(null);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function NoteListItem({
  note,
  selected,
  onSelect,
  onRemoved,
}: {
  note: LocalNote;
  selected: boolean;
  onSelect: (id: string) => void;
  onRemoved: (id: string) => void;
}) {
  const t = useTranslations();
  const preview = note.body_text.trim();

  // Archiving or trashing the note that is currently open must also close the
  // editor, or the pane is left showing something no longer in the list.
  const remove = async (action: () => Promise<void>) => {
    await action();
    onRemoved(note.client_id);
  };

  return (
    // `relative` + `group` so the actions can sit over the row instead of
    // nested inside the main button — a button inside a button is invalid HTML
    // and browsers resolve it unpredictably.
    <li className="group relative">
      <button
        type="button"
        onClick={() => onSelect(note.client_id)}
        aria-current={selected ? "true" : undefined}
        aria-label={note.title || preview || t("editor.openNote")}
        className={`w-full rounded-xl border p-3 pb-9 text-left transition-colors ${
          selected
            ? "border-accent ring-1 ring-accent"
            : "border-[var(--card-border)] hover:border-border"
        }`}
        style={{ background: `var(--note-${note.color})`, color: "var(--note-ink)" }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {note.title && (
              <h3 className="truncate text-[14px] font-semibold leading-snug">{note.title}</h3>
            )}
            {preview && (
              <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed opacity-75">
                {preview}
              </p>
            )}
          </div>
          {note.pinned && (
            <Pin size={13} strokeWidth={2} className="mt-0.5 shrink-0 opacity-50" aria-hidden />
          )}
        </div>
      </button>

      <div
        className="row-actions pointer-events-none absolute inset-x-2 bottom-1.5 flex items-center gap-0.5"
        style={{ color: "var(--note-ink)" }}
      >
        <button
          type="button"
          // Pin only reorders — the note stays in the list, so it must NOT
          // close the editor the way archive and delete do.
          onClick={() => void setPinned(note.client_id, !note.pinned)}
          aria-label={note.pinned ? t("note.actions.unpin") : t("note.actions.pin")}
          aria-pressed={note.pinned}
          className="pointer-events-auto grid size-7 place-items-center rounded-md opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          <Pin size={14} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void remove(() => setArchived(note.client_id, true))}
          aria-label={t("note.actions.archive")}
          className="pointer-events-auto grid size-7 place-items-center rounded-md opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          <Archive size={14} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void remove(() => trashNote(note.client_id))}
          aria-label={t("note.actions.delete")}
          className="pointer-events-auto grid size-7 place-items-center rounded-md opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </li>
  );
}
