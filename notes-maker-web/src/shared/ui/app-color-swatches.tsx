"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { NOTE_COLORS } from "@/features/storage/types";
import { setAppColor } from "@/shared/use-app-color";

/**
 * Landing-page palette: each swatch sets the app-wide colour wash
 * (shared/app-color.ts) and drops the visitor straight into the app so the
 * choice is visible immediately. Client component because the choice is a
 * localStorage write — the page around it stays server-rendered for SEO.
 */
export function AppColorSwatches() {
  const t = useTranslations();
  const router = useRouter();

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
              onClick={() => {
                setAppColor(c);
                router.push("/notes");
              }}
              title={t("landing.useTheme", { color: t(`color.${c}`) })}
              aria-label={t("landing.useTheme", { color: t(`color.${c}`) })}
              // Visually 36px, padded to a 44px target (docs/05 §5.9).
              className="group grid size-11 place-items-center rounded-full"
            >
              <span
                className="block size-9 rounded-full border border-[var(--card-border)] transition-transform duration-150 group-hover:scale-110"
                style={{ background: `var(--note-${c})` }}
              />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
