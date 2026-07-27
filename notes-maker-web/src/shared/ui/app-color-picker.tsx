"use client";

import {Palette} from "lucide-react";
import {useTranslations} from "next-intl";
import {useState} from "react";
import {NOTE_COLORS, type NoteColor} from "@/features/storage/types";
import {setAppColor, useAppColor} from "@/shared/use-app-color";

/**
 * Top-bar palette: picks the app-wide colour wash (see shared/app-color.ts).
 * Same dropdown mechanics as AuthMenu — invisible backdrop, panel below.
 */
export function AppColorPicker() {
  const t = useTranslations();
  const active = useAppColor();
  const [open, setOpen] = useState(false);

  function pick(color: NoteColor | null) {
    setAppColor(color);
    setOpen(false);
  }

  const swatchClass = (selected: boolean) =>
    // A dark stroke plus a drop shadow reads against every swatch, including
    // white/"paper", in both themes — a coloured ring can vanish against a
    // similarly-toned pastel.
    `grid size-9 place-items-center rounded-full ${
      selected
        ? "shadow-[0_1px_4px_rgba(0,0,0,0.4)] ring-2 ring-foreground ring-offset-2 ring-offset-surface"
        : ""
    }`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("appColor.label")}
        title={t("appColor.label")}
        aria-expanded={open}
        className="grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
      >
        <Palette size={18} strokeWidth={1.75} aria-hidden />
      </button>

      {open && (
        <>
          {/* Invisible backdrop: any click outside closes the panel. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="group"
            aria-label={t("appColor.label")}
            className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-[var(--card-border)] bg-surface p-3 shadow-[var(--shadow-modal)]"
          >
            <p className="px-1 pb-2 text-[12px] font-medium text-muted">{t("appColor.label")}</p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => pick(null)}
                title={t("appColor.default")}
                aria-label={t("appColor.default")}
                aria-pressed={active === null}
                className={swatchClass(active === null)}
              >
                {/* The neutral canvas itself, so "no wash" reads as a colour
                    choice rather than an escape hatch. */}
                <span className="block size-7 rounded-full border border-[var(--card-border)] bg-[var(--app-wash-base)]" />
              </button>
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(c)}
                  title={t(`color.${c}`)}
                  aria-label={t(`color.${c}`)}
                  aria-pressed={active === c}
                  className={swatchClass(active === c)}
                >
                  <span
                    className="block size-7 rounded-full border border-[var(--card-border)]"
                    style={{ background: `var(--note-${c})` }}
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
