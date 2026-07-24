"use client";

import { ChevronRight, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChecklistItem } from "@/features/storage";
import { newChecklistItem } from "../model/convert";

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
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const t = useTranslations("checklist");
  const [showDone, setShowDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // The id of the input to focus once the item it belongs to has rendered —
  // a new row's input does not exist yet on the click that creates it.
  const pendingFocus = useRef<string | null>(null);

  const ordered = useMemo(() => items.slice().sort((a, b) => a.order - b.order), [items]);
  const active = ordered.filter((i) => !i.checked);
  const done = ordered.filter((i) => i.checked);

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
    if (e.key === "Enter") {
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

  const row = (item: ChecklistItem) => (
    <div key={item.id} className="group/item flex items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={() => toggle(item.id)}
        aria-label={item.checked ? t("uncheck") : t("check")}
        aria-pressed={item.checked}
        className="grid size-6 shrink-0 place-items-center"
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

      <input
        data-item-id={item.id}
        value={item.text}
        onChange={(e) => setText(item.id, e.target.value)}
        onKeyDown={(e) => onKeyDown(e, item)}
        placeholder={t("itemPlaceholder")}
        className={`min-w-0 flex-1 bg-transparent py-0.5 outline-none placeholder:opacity-40 ${
          item.checked ? "line-through opacity-50" : ""
        }`}
      />

      <button
        type="button"
        onClick={() => remove(item.id)}
        aria-label={t("removeItem")}
        className="grid size-6 shrink-0 place-items-center rounded-md opacity-0 transition-opacity hover:bg-black/5 focus-visible:opacity-100 group-hover/item:opacity-50 group-hover/item:hover:opacity-100 dark:hover:bg-white/10"
      >
        <X size={13} strokeWidth={2} aria-hidden />
      </button>
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
            aria-expanded={showDone}
            className="flex items-center gap-1 py-1 text-[0.88em] opacity-60 transition-opacity hover:opacity-100"
          >
            <ChevronRight
              size={14}
              strokeWidth={2}
              className={`transition-transform ${showDone ? "rotate-90" : ""}`}
              aria-hidden
            />
            {t("completed", { count: done.length })}
          </button>
          {showDone && done.map(row)}
        </div>
      )}
    </div>
  );
}
