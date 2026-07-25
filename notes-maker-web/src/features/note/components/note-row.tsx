"use client";

import { Pin } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { LocalNote } from "@/features/storage";
import { noteKind } from "../model/convert";

/**
 * One row in any note list — active, archive, or trash.
 *
 * Presentation only. The actions differ per view (archive shows Unarchive,
 * trash shows Restore) and are passed in, so the row itself never grows a
 * `variant` prop with a branch per screen.
 */
export function NoteRow({
  note,
  selected,
  onOpen,
  actions,
  highlight,
  meta,
}: {
  note: LocalNote;
  selected?: boolean;
  onOpen?: (id: string) => void;
  actions?: ReactNode;
  /** Search term to mark within the title and preview. */
  highlight?: string;
  /** Small line under the preview — e.g. the trash view's days-left counter. */
  meta?: ReactNode;
}) {
  const t = useTranslations("editor");
  const tChecklist = useTranslations("checklist");
  const preview = note.body_text.trim();
  const interactive = Boolean(onOpen);

  // Checklists render real checkbox glyphs instead of the plaintext preview,
  // with checked items collapsed to a count — the card mirrors the editor's
  // "Completed (n)" section (docs/10 §10.1).
  const isChecklist = noteKind(note) === "checklist";
  const items = isChecklist
    ? (note.checklist ?? []).filter((i) => i.text.trim().length > 0)
    : [];
  const openItems = items
    .filter((i) => !i.checked)
    .sort((a, b) => a.order - b.order);
  const doneCount = items.length - openItems.length;

  const content = (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        {note.title && (
          <h3 className="truncate text-[14px] font-semibold leading-snug">
            <Marked text={note.title} term={highlight} />
          </h3>
        )}
        {isChecklist ? (
          items.length > 0 && (
            <div className="mt-0.5 text-[12.5px] leading-relaxed opacity-75">
              {openItems.slice(0, 4).map((item) => (
                <p key={item.id} className="flex items-start gap-1.5">
                  <span
                    className="mt-[4.5px] size-[9px] shrink-0 rounded-[2.5px] border border-current opacity-60"
                    aria-hidden
                  />
                  <span className="truncate">
                    <Marked text={item.text} term={highlight} />
                  </span>
                </p>
              ))}
              {openItems.length > 4 && <p className="opacity-60">…</p>}
              {doneCount > 0 && (
                <p className="mt-0.5 opacity-60">
                  {tChecklist("completedFraction", { done: doneCount, total: items.length })}
                </p>
              )}
            </div>
          )
        ) : (
          preview && (
            // `whitespace-pre-line` keeps the line breaks that carry list
            // structure; without it "1. play\n2. fun" renders as one run of
            // words and the numbering reads as noise.
            <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[12.5px] leading-relaxed opacity-75">
              <Marked text={preview} term={highlight} />
            </p>
          )
        )}
        {meta && <p className="mt-1 text-[11.5px] opacity-55">{meta}</p>}
      </div>
      {note.pinned && (
        <Pin size={13} strokeWidth={2} className="mt-0.5 shrink-0 opacity-50" aria-hidden />
      )}
    </div>
  );

  const surface = {
    background: `var(--note-${note.color})`,
    color: "var(--note-ink)",
  } as const;

  return (
    // `group` drives the hover reveal of `.row-actions`; `relative` lets the
    // actions overlay the row rather than nest inside its button, which would
    // be invalid HTML.
    <li className="card-in group relative">
      {interactive ? (
        <button
          type="button"
          onClick={() => onOpen?.(note.client_id)}
          aria-current={selected ? "true" : undefined}
          aria-label={note.title || preview || t("openNote")}
          className={`w-full rounded-2xl border p-3.5 text-left shadow-[var(--shadow-rest)] transition-shadow hover:shadow-[var(--shadow-hover)] ${
            actions ? "pb-9" : ""
          } ${
            selected ? "border-accent ring-1 ring-accent" : "border-[var(--card-border)]"
          }`}
          style={surface}
        >
          {content}
        </button>
      ) : (
        <div
          className={`w-full rounded-2xl border border-[var(--card-border)] p-3.5 shadow-[var(--shadow-rest)] ${
            actions ? "pb-9" : ""
          }`}
          style={surface}
        >
          {content}
        </div>
      )}

      {actions && (
        <div
          className="row-actions pointer-events-none absolute inset-x-2 bottom-1.5 flex items-center gap-0.5"
          style={{ color: "var(--note-ink)" }}
        >
          {actions}
        </div>
      )}
    </li>
  );
}

/** Shared styling for the small icon buttons that sit in a row's action strip. */
export const rowActionClass =
  "pointer-events-auto grid size-7 place-items-center rounded-md opacity-60 transition-opacity hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10";

/**
 * Marks occurrences of `term` inside `text`.
 *
 * Splits on a case-insensitive match rather than injecting HTML — building
 * this with dangerouslySetInnerHTML would make every note title an XSS vector
 * against its own author.
 */
function Marked({ text, term }: { text: string; term?: string }) {
  const needle = term?.trim();
  if (!needle) return <>{text}</>;

  const parts: ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let from = 0;

  for (;;) {
    const at = lowerText.indexOf(lowerNeedle, from);
    if (at === -1) break;
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark
        key={at}
        className="rounded-[3px] bg-[color:var(--accent-soft)] px-0.5 text-[color:var(--accent-soft-foreground)]"
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));

  return <>{parts}</>;
}
