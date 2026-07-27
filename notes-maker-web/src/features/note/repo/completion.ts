import {getDb} from "@/features/storage/db";
import {META} from "@/features/storage/types";

/**
 * Settings for the Completed flow — docs/10 §10.13a, Premium.
 *
 * Mirrors suggestions.ts's absent-means-enabled polarity: a fresh install (or
 * anyone who's never touched this setting) gets the automation by default,
 * and turning it off is an explicit, remembered opt-out.
 */
export async function autoCompleteEnabled(): Promise<boolean> {
  const row = await getDb().meta.get(META.autoCompleteDisabled);
  return row?.value !== true;
}

export async function setAutoCompleteEnabled(enabled: boolean): Promise<void> {
  await getDb().meta.put({ key: META.autoCompleteDisabled, value: !enabled });
}
