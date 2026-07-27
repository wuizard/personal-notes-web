"use client";

import { useTranslations } from "next-intl";
import { NOTE_COLORS } from "@/features/storage/types";
import { setAppColor, useAppColor } from "@/shared/use-app-color";

/**
 * Landing-page palette: each swatch sets the app-wide colour wash
 * (shared/app-color.ts) and nothing else — it changes the theme in place,
 * it does not navigate. It previously also pushed to /notes, which read as
 * "pick a colour to start writing" rather than "pick a theme"; picking a
 * theme should not double as leaving the page you're picking it on.
 */
export function AppColorSwatches() {
  const t = useTranslations();
  const active = useAppColor();

  return (
    <>
      <p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-ink-subtle">
        {t("landing.themeLabel")}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1" aria-label={t("landing.themeLabel")}>
        {NOTE_COLORS.map((c) => (
          <li key={c}>
            <button
              type="button"
              onClick={() => setAppColor(c)}
              title={t("landing.useTheme", { color: t(`color.${c}`) })}
              aria-label={t("landing.useTheme", { color: t(`color.${c}`) })}
              aria-pressed={active === c}
              // Visually 36px, padded to a 44px target (docs/05 §5.9).
              className="group grid size-11 place-items-center rounded-full"
            >
              <span
                className={`block size-9 rounded-full border border-[var(--card-border)] transition-transform duration-150 group-hover:scale-110 ${
                  // Same dark-stroke-plus-shadow selected state as the top-bar
                  // picker (app-color-picker.tsx) — a coloured ring can vanish
                  // against a similarly-toned pastel, this doesn't.
                  active === c
                    ? "shadow-[0_1px_4px_rgba(0,0,0,0.4)] ring-2 ring-foreground ring-offset-2 ring-offset-background"
                    : ""
                }`}
                style={{ background: `var(--note-${c})` }}
              />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
