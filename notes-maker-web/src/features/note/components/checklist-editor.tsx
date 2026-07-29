"use client";

import {ChevronRight, Plus, X} from "lucide-react";
import {useTranslations} from "next-intl";
import {useEffect, useMemo, useRef, useState} from "react";
import type {ChecklistItem} from "@/features/storage";
import {newChecklistItem} from "../model/convert";
import {suggestCompletion} from "../repo/suggestions";

/**
 * The checklist surface, shared by compose and the editor pane — docs/10 §10.1.
 *
 * Controlled: the caller owns the items and persists them; this component only
 * turns keystrokes into the next array. Checked items sink into a collapsed
 * "Completed (n)" section, Keep-style, so a long-lived list stays scannable.
 */
export function ChecklistEditor({
  items,
  onChange,
  autoFocus,
  className,
  editingNoteId,
  onEditingNoteIdChange,
  onNoteCommitted,
  onItemCommitted,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  autoFocus?: boolean;
  className?: string;
  /** Controlled override for which item's completion note is open for
   *  editing — lets NoteEditor pre-open one right after the "add a note?"
   *  completion prompt (docs/10 §10.13a). Omit for the normal uncontrolled
   *  behaviour (compose has no use for this). */
  editingNoteId?: string | null;
  onEditingNoteIdChange?: (id: string | null) => void;
  /** Fires when a note field is committed (blurred) — how the caller learns
   *  the prompted-for note is done, so it can finish settling the item. */
  onNoteCommitted?: (id: string) => void;
  /** Fires once per item text field, on blur, only when the text actually
   *  changed since the field was focused — how a caller feeds the
   *  Tab-completion history (docs/10 §10.2) from edits to an EXISTING note.
   *  Quick-compose omits this: it already records once at submit time, and
   *  passing this too would double-count every item. */
  onItemCommitted?: (text: string) => void;
}) {
  const t = useTranslations("checklist");
  const [showDone, setShowDone] = useState(false);
  // The id of the completed item currently showing its note as an editable
  // field, or null. Only one at a time — matches pendingFocus's single-slot
  // shape below. Uncontrolled unless the caller passes editingNoteId.
  const [internalEditingNote, setInternalEditingNote] = useState<string | null>(null);
  const editingNote = editingNoteId !== undefined ? editingNoteId : internalEditingNote;
  const setEditingNote = onEditingNoteIdChange ?? setInternalEditingNote;
  const root = useRef<HTMLDivElement>(null);
  // The id of the input to focus once the item it belongs to has rendered —
  // a new row's input does not exist yet on the click that creates it.
  const pendingFocus = useRef<string | null>(null);

  // Tab-completion ghost text — the id it belongs to plus the tail to append
  // on Tab. One slot, like editingNote above: only the focused row can have
  // an active suggestion. A request token guards against a slow lookup from
  // an earlier keystroke clobbering a newer one.
  const [ghost, setGhost] = useState<{ id: string; tail: string } | null>(null);
  const ghostToken = useRef(0);
  // Text an item's input held when it gained focus, keyed by item id — the
  // baseline onItemCommitted diffs against on blur.
  const focusText = useRef<Record<string, string>>({});

  function updateGhost(id: string, text: string) {
    const token = ++ghostToken.current;
    if (!text.trim()) {
      setGhost(null);
      return;
    }
    void suggestCompletion(text).then((tail) => {
      if (ghostToken.current !== token) return; // a newer keystroke won the race
      setGhost(tail ? { id, tail } : null);
    });
  }

  const ordered = useMemo(() => items.slice().sort((a, b) => a.order - b.order), [items]);
  const active = ordered.filter((i) => !i.checked);
  const done = ordered.filter((i) => i.checked);
  // A controlled editingNoteId pointing at a completed item forces the
  // section open — e.g. the completion prompt sending the user straight to a
  // note field they couldn't otherwise see (docs/10 §10.13a).
  const doneVisible = showDone || done.some((i) => i.id === editingNote);

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    root.current?.querySelector<HTMLInputElement>(`input[data-item-id="${id}"]`)?.focus();
  }, [items]);

  useEffect(() => {
    if (autoFocus) root.current?.querySelector("input")?.focus();
    // Mount-only: refocusing on later renders would steal the caret mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Every mutation goes out with `order` renumbered to the array position. */
  const emit = (next: ChecklistItem[]) =>
    onChange(next.map((item, order) => ({ ...item, order })));

  const setText = (id: string, text: string) =>
    emit(ordered.map((i) => (i.id === id ? { ...i, text } : i)));

  const toggle = (id: string) =>
    emit(ordered.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));

  // Stores exactly what was typed — no trimming here. Trimming on every
  // keystroke strips a trailing space the instant it's typed (the field is
  // controlled, so the next render shows the already-trimmed value and the
  // space silently never appears), which is why words ran together before
  // this was split from the commit step below.
  const setNote = (id: string, note: string) =>
    emit(ordered.map((i) => (i.id === id ? { ...i, note } : i)));

  /** Normalises on the way out of edit mode: trims, and empty clears the note. */
  const commitNote = (id: string) => {
    const item = ordered.find((i) => i.id === id);
    if (!item) return;
    const trimmed = (item.note ?? "").trim();
    if (trimmed === (item.note ?? "")) return;
    emit(ordered.map((i) => (i.id === id ? { ...i, note: trimmed || undefined } : i)));
  };

  const remove = (id: string) => emit(ordered.filter((i) => i.id !== id));

  const insertAfter = (id: string | null) => {
    const at = id ? ordered.findIndex((i) => i.id === id) : ordered.length - 1;
    const item = newChecklistItem(0);
    const next = ordered.slice();
    next.splice(at + 1, 0, item);
    pendingFocus.current = item.id;
    emit(next);
  };

  const onKeyDown = (e: React.KeyboardEvent, item: ChecklistItem) => {
    if (e.key === "Tab" && ghost?.id === item.id && ghost.tail) {
      e.preventDefault();
      setText(item.id, item.text + ghost.tail);
      setGhost(null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      insertAfter(item.id);
    } else if (e.key === "Backspace" && item.text === "") {
      // An empty row deletes itself and hands the caret back, so a checklist
      // can be typed straight through without touching the mouse.
      e.preventDefault();
      const at = active.findIndex((i) => i.id === item.id);
      pendingFocus.current = active[at - 1]?.id ?? null;
      remove(item.id);
    }
  };

  /**
   * The optional line under a completed item — docs/06's "completed part"
   * shows whatever note was attached when it was checked off. Not present
   * for active items; the note only means something once the task is done.
   */
  const noteLine = (item: ChecklistItem) => {
    if (editingNote === item.id) {
      return (
        <textarea
          autoFocus
          rows={1}
          // Grows to fit content on every mount/keystroke rather than
          // scrolling internally — a fixed single row would hide anything
          // typed past the first line.
          ref={(el) => {
            if (!el) return;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
          value={item.note ?? ""}
          onChange={(e) => {
            setNote(item.id, e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={() => {
            commitNote(item.id);
            setEditingNote(null);
            onNoteCommitted?.(item.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            } else if (e.key === "Enter" && e.altKey) {
              // Inserted by hand rather than left to the textarea's own
              // default action: a held modifier makes that default fire
              // inconsistently across browsers/hardware — sometimes no
              // newline appears at all, sometimes it appears and the field
              // still ends up committing right after. Owning the edit
              // outright removes that race entirely.
              e.preventDefault();
              const el = e.target as HTMLTextAreaElement;
              const { selectionStart, selectionEnd, value } = el;
              const next = `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`;
              setNote(item.id, next);
              // React resets the caret to the end when it rewrites a
              // controlled value; restore it once that commit lands.
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = selectionStart + 1;
              });
            } else if (e.key === "Enter") {
              // Plain Enter commits and closes.
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          placeholder={t("notePlaceholder")}
          className="ml-8 -mt-0.5 block w-[calc(100%-2rem)] resize-none overflow-hidden bg-transparent pb-1 text-[0.85em] italic text-muted outline-none placeholder:opacity-50"
        />
      );
    }

    if (item.note) {
      return (
        <button
          type="button"
          onClick={() => setEditingNote(item.id)}
          title={t("editNote")}
          className="ml-8 -mt-0.5 block max-w-[calc(100%-2rem)] whitespace-pre-line text-left text-[0.85em] italic text-muted underline decoration-dotted underline-offset-2 opacity-80 transition-opacity hover:opacity-100"
        >
          {item.note}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setEditingNote(item.id)}
        title={t("addNote")}
        className="ml-8 -mt-0.5 block pb-1 text-[0.85em] text-ink-subtle opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover/item:opacity-70"
      >
        + {t("addNote")}
      </button>
    );
  };

  const row = (item: ChecklistItem) => (
    <div key={item.id} className="group/item">
      <div className="flex items-center gap-2.5 py-0.5">
        <button
          type="button"
          onClick={() => toggle(item.id)}
          aria-label={item.checked ? t("uncheck") : t("check")}
          aria-pressed={item.checked}
          title={item.checked ? t("uncheck") : t("check")}
          className="grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <span
            className={`grid size-[17px] place-items-center rounded-[5px] border transition-colors ${
              item.checked
                ? "border-accent bg-accent text-accent-foreground"
                : "border-[var(--card-border)] bg-transparent"
            }`}
          >
            {item.checked && (
              <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                <path
                  d="M2.5 6.5 5 9l4.5-5.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </button>

        <div className="relative min-w-0 flex-1">
          {/* Ghost completion — non-interactive text sitting exactly behind
              the real input. The typed portion is invisible so it reserves
              the right amount of space; only the suggested tail shows,
              muted, past where the caret actually is. Tab accepts it. */}
          {!item.checked && ghost?.id === item.id && ghost.tail && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre py-0.5"
            >
              <span className="invisible">{item.text}</span>
              <span className="text-ink-subtle opacity-50">{ghost.tail}</span>
            </div>
          )}
          <input
            data-item-id={item.id}
            value={item.text}
            onChange={(e) => {
              setText(item.id, e.target.value);
              if (!item.checked) updateGhost(item.id, e.target.value);
            }}
            onKeyDown={(e) => onKeyDown(e, item)}
            onFocus={() => {
              focusText.current[item.id] = item.text;
            }}
            onBlur={() => {
              setGhost((g) => (g?.id === item.id ? null : g));
              const before = focusText.current[item.id];
              delete focusText.current[item.id];
              const text = item.text.trim();
              if (onItemCommitted && text && text !== before?.trim()) {
                onItemCommitted(item.text);
              }
            }}
            placeholder={t("itemPlaceholder")}
            className={`relative z-10 w-full bg-transparent py-0.5 outline-none placeholder:opacity-40 ${
              item.checked ? "line-through opacity-50" : ""
            }`}
          />
        </div>

        <button
          type="button"
          onClick={() => remove(item.id)}
          aria-label={t("removeItem")}
          title={t("removeItem")}
          className="grid size-6 shrink-0 place-items-center rounded-md opacity-0 transition-opacity hover:bg-black/5 focus-visible:opacity-100 group-hover/item:opacity-50 group-hover/item:hover:opacity-100 dark:hover:bg-white/10"
        >
          <X size={13} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {item.checked && noteLine(item)}
    </div>
  );

  return (
    <div ref={root} className={className}>
      {active.map(row)}

      <button
        type="button"
        onClick={() => insertAfter(active[active.length - 1]?.id ?? null)}
        className="mt-0.5 flex items-center gap-2.5 py-1 text-[0.92em] opacity-50 transition-opacity hover:opacity-90"
      >
        <span className="grid size-6 place-items-center">
          <Plus size={15} strokeWidth={2} aria-hidden />
        </span>
        {t("addItem")}
      </button>

      {done.length > 0 && (
        <div className="mt-2 border-t border-[var(--card-border)] pt-1.5">
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            aria-expanded={doneVisible}
            className="flex items-center gap-1 py-1 text-[0.88em] opacity-60 transition-opacity hover:opacity-100"
          >
            <ChevronRight
              size={14}
              strokeWidth={2}
              className={`transition-transform ${doneVisible ? "rotate-90" : ""}`}
              aria-hidden
            />
            {t("completed", { count: done.length })}
          </button>
          {doneVisible && done.map(row)}
        </div>
      )}
    </div>
  );
}
