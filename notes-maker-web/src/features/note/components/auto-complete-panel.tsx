"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { autoCompleteEnabled, setAutoCompleteEnabled } from "../repo/completion";

/**
 * Settings → the Completed flow's on/off switch — docs/10 §10.13a, Premium.
 * Visible to every tier (it's an honest description of what the feature does
 * even if a free user can't act on it yet), mirroring suggestions-panel.tsx.
 */
export function AutoCompletePanel() {
  const t = useTranslations("checklist");
  const enabled = useLiveQuery(() => autoCompleteEnabled(), []);

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-surface p-4 shadow-[var(--shadow-rest)]">
      <h2 className="text-[15px] font-semibold">{t("autoCompleteTitle")}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{t("autoCompleteExplain")}</p>

      <label className="mt-3 flex items-center gap-2.5 text-[13.5px]">
        <input
          type="checkbox"
          checked={enabled ?? true}
          onChange={(e) => void setAutoCompleteEnabled(e.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        {t("autoCompleteEnable")}
      </label>
    </section>
  );
}
