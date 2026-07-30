"use client";

import {GitBranch, X} from "lucide-react";
import {useTranslations} from "next-intl";
import {useState} from "react";

/**
 * Shown on a conflicted copy — docs/04 §4.7.
 *
 * Quiet, inline, and dismissible. Explicitly not a modal, and explicitly not
 * a merge UI: the two versions already both exist as ordinary notes, so
 * there is nothing to decide and nothing at risk. Anything more ceremonious
 * would make a rare, already-handled event feel like data loss.
 *
 * Dismissal is per-mount rather than persisted. The banner only appears on a
 * note that was forked by a conflict, which is rare enough that remembering
 * the dismissal across sessions would cost a schema field to save nobody a
 * second click.
 */
export function ConflictBanner() {
  const t = useTranslations("sync");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-2 border-b border-[var(--card-border)] px-3 py-2 text-[12.5px]">
      <GitBranch size={14} className="mt-0.5 shrink-0 opacity-70" aria-hidden />
      <p className="flex-1 opacity-80">{t("conflictBanner")}</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t("conflictDismiss")}
        title={t("conflictDismiss")}
        className="-m-1 shrink-0 rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
