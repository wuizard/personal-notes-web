"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {useTranslations} from "next-intl";
import {useToast} from "@/shared/ui/toast";
import {clearSuggestionHistory, setSuggestionsEnabled, suggestionsEnabled,} from "../repo/suggestions";

/**
 * The §10.2 escape hatch: suggestions can be turned off, and turning them off
 * clears the phrase history — a privacy promise, not a pause button.
 */
export function SuggestionsPanel() {
  const t = useTranslations("suggestions");
  const toast = useToast();
  const enabled = useLiveQuery(() => suggestionsEnabled(), []);

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-surface p-4 shadow-[var(--shadow-rest)]">
      <h2 className="text-[15px] font-semibold">{t("title")}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{t("explain")}</p>

      <label className="mt-3 flex items-center gap-2.5 text-[13.5px]">
        <input
          type="checkbox"
          checked={enabled ?? true}
          onChange={(e) => void setSuggestionsEnabled(e.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        {t("enable")}
      </label>

      {enabled && (
        <button
          type="button"
          onClick={async () => {
            await clearSuggestionHistory();
            toast.show({ message: t("cleared") });
          }}
          className="mt-3 rounded-xl border border-border px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-secondary"
        >
          {t("clear")}
        </button>
      )}
    </section>
  );
}
