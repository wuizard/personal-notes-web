"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { NOTE_COLORS, type NoteColor } from "@/features/storage";
import { usePersistencePrompt } from "@/features/storage/hooks/use-persistence-prompt";
import { docFromText } from "../model/body-text";
import { createNote } from "../repo/note-repo";

/**
 * Capture, at the top of the list pane.
 *
 * Stage C expands this in place into the full editor with a toolbar
 * (docs/06 §6.2). For now it creates the note and hands selection to the
 * detail pane, which is where the writing continues.
 */
export function QuickCompose({ onCreated }: { onCreated?: (id: string) => void }) {
  const t = useTranslations("note");
  const params = useSearchParams();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { maybePrompt } = usePersistencePrompt();

  // Handed over from the landing page swatches (/notes?color=mint). Validated
  // against the palette so a hand-edited URL cannot write a bogus colour.
  const requested = params.get("color");
  const initialColor: NoteColor = NOTE_COLORS.includes(requested as NoteColor)
    ? (requested as NoteColor)
    : "paper";

  async function submit() {
    const trimmed = text.trim();
    // An empty note is discarded silently — the user knows (docs/06 §6.2).
    if (!trimmed || busy) return;

    setBusy(true);
    try {
      const [first, ...rest] = trimmed.split("\n");
      const note = await createNote({
        title: first.slice(0, 200),
        body: docFromText(rest.join("\n")),
        color: initialColor,
      });
      setText("");
      onCreated?.(note.client_id);
      // Ask about persistence only after the first save, never on load.
      await maybePrompt();
    } finally {
      setBusy(false);
    }
  }

  return (
    // The ring lives on the card, not the textarea: a hard outline drawn
    // inside a bordered card reads as a rendering glitch, and the card is the
    // thing the user perceives as "the input".
    <div className="rounded-xl border border-[var(--card-border)] bg-surface p-2.5 shadow-[var(--shadow-rest)] focus-within:border-accent focus-within:shadow-[var(--shadow-hover)] focus-within:ring-1 focus-within:ring-accent">
      <label className="sr-only" htmlFor="quick-compose">
        {t("composePlaceholder")}
      </label>
      <textarea
        id="quick-compose"
        ref={inputRef}
        rows={text ? 3 : 1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={t("composePlaceholder")}
        className="w-full resize-none bg-transparent text-[14px] leading-6 outline-none placeholder:text-ink-subtle"
        style={initialColor !== "paper" ? { caretColor: `var(--accent)` } : undefined}
      />

      {text.trim() && (
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
            onClick={() => setText("")}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-surface-secondary"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {t("save")}
          </button>
        </div>
      )}
    </div>
  );
}
