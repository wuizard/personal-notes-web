"use client";

import { useTranslations } from "next-intl";

/**
 * Empty state — docs/06 §6.9. Illustration, a sentence, and the action that
 * fills it. Two pastel tones plus `line`, under 200×160 so it never dominates
 * the screen (docs/05 §5.10).
 */
export function EmptyNotes() {
  const t = useTranslations("note.empty");

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <svg width="152" height="120" viewBox="0 0 76 60" fill="none" aria-hidden>
        <rect
          x="9"
          y="12"
          width="40"
          height="40"
          rx="7"
          fill="var(--note-butter)"
          stroke="var(--border)"
          strokeWidth="1.5"
          transform="rotate(-7 29 32)"
        />
        <rect
          x="26"
          y="8"
          width="40"
          height="40"
          rx="7"
          fill="var(--note-mint)"
          stroke="var(--border)"
          strokeWidth="1.5"
          transform="rotate(6 46 28)"
        />
        <path
          d="M36 22h18M36 29h14M36 36h9"
          stroke="var(--ink-subtle)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".55"
        />
      </svg>

      <p className="text-[15px] font-medium">{t("title")}</p>
      <p className="max-w-[32ch] text-sm text-muted">{t("body")}</p>
    </div>
  );
}
