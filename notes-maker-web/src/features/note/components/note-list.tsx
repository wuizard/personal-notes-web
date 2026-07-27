"use client";

import {Archive, Pin, Search, Trash2, X} from "lucide-react";
import {useTranslations} from "next-intl";
import {useCallback, useDeferredValue, useMemo, useState} from "react";
import {useHotkeys} from "@/shared/hooks/use-hotkeys";
import {useToast} from "@/shared/ui/toast";
import {ConfirmDialog} from "@/shared/ui/confirm-dialog";
import type {LocalNote} from "@/features/storage";
import {QuickCompose} from "./quick-compose";
import {EmptyNotes} from "./empty-notes";
import {NoteRow, rowActionClass} from "./note-row";
import {useNotes} from "../hooks/use-notes";
import {restoreNote, setArchived, setPinned, trashNote} from "../repo/note-repo";

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
  const toast = useToast();
  const notes = useNotes("active");
  const [query, setQuery] = useState("");

  // Filtering runs against an already-loaded array, so `useDeferredValue`
  // gives the debounce for free: typing stays responsive and the list catches
  // up, with no timer to cancel and no stale-result race.
  const deferredQuery = useDeferredValue(query);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q || !notes) return notes;
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.body_text.toLowerCase().includes(q),
    );
  }, [notes, deferredQuery]);

  const searching = deferredQuery.trim().length > 0;

  // ── actions, shared by the row buttons and the keyboard shortcuts ──

  const archive = useCallback(
    async (note: LocalNote) => {
      await setArchived(note.client_id, true);
      if (note.client_id === selectedId) onSelect(null);
      toast.show({
        message: t("note.archived"),
        actionLabel: t("note.undo"),
        onAction: () => setArchived(note.client_id, false),
      });
    },
    [selectedId, onSelect, toast, t],
  );

  // The only optimistic-with-undo action in this list that also confirms —
  // deliberately, at the user's request: undo alone wasn't reassuring enough
  // for a delete, even though it's fully reversible for 30 days.
  const [confirmingDelete, setConfirmingDelete] = useState<LocalNote | null>(null);

  const remove = useCallback(
    async (note: LocalNote) => {
      await trashNote(note.client_id);
      if (note.client_id === selectedId) onSelect(null);
      toast.show({
        message: t("note.deleted"),
        actionLabel: t("note.undo"),
        onAction: () => restoreNote(note.client_id),
      });
    },
    [selectedId, onSelect, toast, t],
  );

  const togglePin = useCallback(
    (note: LocalNote) => void setPinned(note.client_id, !note.pinned),
    [],
  );

  // ── shortcuts — docs/06 §6.6 ──
  //
  // In a master-detail layout, moving the selection *is* opening the note, so
  // j/k double as navigation. The separate `Enter` from the spec would have
  // nothing left to do.
  const hotkeys = useMemo(() => {
    const list = visible ?? [];
    const index = list.findIndex((n) => n.client_id === selectedId);
    const current = index >= 0 ? list[index] : undefined;

    const step = (delta: number) => {
      if (!list.length) return;
      // From no selection, j starts at the top and k at the bottom.
      const next = index === -1 ? (delta > 0 ? 0 : list.length - 1) : index + delta;
      const clamped = Math.max(0, Math.min(list.length - 1, next));
      onSelect(list[clamped].client_id);
    };

    return {
      j: () => step(1),
      k: () => step(-1),
      e: () => current && void archive(current),
      "#": () => current && setConfirmingDelete(current),
      p: () => current && togglePin(current),
    };
  }, [visible, selectedId, onSelect, archive, togglePin]);

  useHotkeys(hotkeys);

  return (
    <>
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
          <Search size={15} strokeWidth={1.75} className="shrink-0 text-ink-subtle" aria-hidden />
          <label className="sr-only" htmlFor="note-search">
            {t("nav.search")}
          </label>
          <input
            id="note-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            placeholder={t("nav.search")}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-subtle"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("note.cancel")}
              title={t("note.cancel")}
              className="shrink-0 rounded-md p-0.5 text-ink-subtle transition-colors hover:text-foreground"
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>

        {/* Composing while a filter is active would create a note the user
            immediately cannot see. */}
        {!searching && <QuickCompose onCreated={onSelect} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {visible === undefined ? (
          <div className="flex flex-col gap-2 p-1" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-[var(--card-border)] bg-surface-secondary"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          searching ? (
            <p className="px-3 py-10 text-center text-sm text-muted">
              {t("search.noResults", { query: deferredQuery.trim() })}
            </p>
          ) : (
            <EmptyNotes />
          )
        ) : (
          <ul className="flex flex-col gap-1.5" role="list">
            {visible.map((note) => (
              <NoteRow
                key={note.client_id}
                note={note}
                selected={note.client_id === selectedId}
                onOpen={onSelect}
                highlight={deferredQuery}
                actions={
                  <>
                    <button
                      type="button"
                      // Pin only reorders — it must not close the editor the
                      // way archive and delete do.
                      onClick={() => togglePin(note)}
                      aria-label={note.pinned ? t("note.actions.unpin") : t("note.actions.pin")}
                      title={note.pinned ? t("note.actions.unpin") : t("note.actions.pin")}
                      aria-pressed={note.pinned}
                      className={rowActionClass}
                    >
                      <Pin size={14} strokeWidth={1.75} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={t("note.actions.archive")}
                      title={t("note.actions.archive")}
                      className={rowActionClass}
                      onClick={() => void archive(note)}
                    >
                      <Archive size={14} strokeWidth={1.75} aria-hidden />
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
      </div>

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
            await remove(note);
          }}
        />
      )}
    </>
  );
}
