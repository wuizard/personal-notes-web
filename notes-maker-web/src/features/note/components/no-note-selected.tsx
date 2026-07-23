"use client";

import { useTranslations } from "next-intl";

/**
 * The editor pane before anything is open.
 *
 * A friendly note character rather than the brand mark: this is a warm, idle
 * moment, and repeating the logo here would just look like a loading state.
 * Built from the palette (docs/05 §5.10) — two pastel tones plus `line`, soft
 * round caps, nothing that reads as an error.
 *
 * The face is the whole trick: give a rectangle two dots and a curve and
 * people read it as friendly rather than empty.
 */
export function NoNoteSelected() {
  const t = useTranslations("editor");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <svg
        width="168"
        height="150"
        viewBox="0 0 112 100"
        fill="none"
        aria-hidden
        className="motion-safe:animate-[float_5s_ease-in-out_infinite]"
      >
        {/* back card, peeking */}
        <rect
          x="16" y="20" width="58" height="60" rx="12"
          fill="var(--note-butter)" stroke="var(--border)" strokeWidth="2"
          transform="rotate(-9 45 50)"
        />

        {/* front card — the character */}
        <g transform="rotate(6 66 52)">
          <rect
            x="38" y="22" width="58" height="60" rx="12"
            fill="var(--note-mint)" stroke="var(--border)" strokeWidth="2"
          />

          {/* eyes */}
          <circle cx="56" cy="46" r="3.1" fill="var(--ink-subtle)" />
          <circle cx="78" cy="46" r="3.1" fill="var(--ink-subtle)" />

          {/* smile */}
          <path
            d="M57 58c2.6 3.4 6.2 5.1 10 5.1s7.4-1.7 10-5.1"
            stroke="var(--ink-subtle)" strokeWidth="2.6" strokeLinecap="round"
          />

          {/* blush */}
          <ellipse cx="49.5" cy="54" rx="3.6" ry="2.4" fill="var(--note-blush)" opacity="0.9" />
          <ellipse cx="84.5" cy="54" rx="3.6" ry="2.4" fill="var(--note-blush)" opacity="0.9" />
        </g>

        {/* a pencil, resting against the cards */}
        <g transform="rotate(24 96 74)">
          <rect x="92" y="52" width="7" height="28" rx="3.5" fill="var(--note-periwinkle)" stroke="var(--border)" strokeWidth="1.6" />
          <path d="M92 78h7l-3.5 7z" fill="var(--ink-subtle)" opacity="0.55" />
        </g>

        {/* sparkles */}
        <path
          d="M22 12v7M18.5 15.5h7"
          stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.55"
        />
        <path
          d="M100 26v5M97.5 28.5h5"
          stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" opacity="0.4"
        />
      </svg>

      <p className="max-w-[28ch] text-center text-sm text-muted">{t("none")}</p>
    </div>
  );
}
