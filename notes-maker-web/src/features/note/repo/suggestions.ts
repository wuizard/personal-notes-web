import {getDb} from "@/features/storage/db";
import {type CapturePhrase, META} from "@/features/storage/types";

/**
 * Quick-capture suggestions — docs/10 §10.2.
 *
 * ENTIRELY local: frequency × recency over the user's own past entries,
 * stored in the `capture_phrases` table. No ML, no server, nothing leaves
 * the device — this is the local-first privacy story doing real work.
 */

/** Simple v1 scoring: count × 0.5^(age / half-life). Tunable later. */
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_PHRASE_LENGTH = 120;

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function suggestionsEnabled(): Promise<boolean> {
  const row = await getDb().meta.get(META.suggestionsDisabled);
  return row?.value !== true;
}

export async function setSuggestionsEnabled(enabled: boolean): Promise<void> {
  const db = getDb();
  await db.meta.put({ key: META.suggestionsDisabled, value: !enabled });
  // Turning suggestions off also clears the history — the setting is a
  // privacy promise, not a pause button (docs/10 §10.2).
  if (!enabled) await db.capture_phrases.clear();
}

/** Called on every capture with the texts the user just saved. */
export async function recordCapturePhrases(texts: string[]): Promise<void> {
  const db = getDb();
  if (!(await suggestionsEnabled())) return;

  const at = Date.now();
  await db.transaction("rw", db.capture_phrases, async () => {
    for (const raw of texts) {
      const display = raw.trim().replace(/\s+/g, " ");
      const text = normalize(display);
      if (!text || text.length > MAX_PHRASE_LENGTH) continue;
      const existing = await db.capture_phrases.get(text);
      await db.capture_phrases.put({
        text,
        display,
        count: (existing?.count ?? 0) + 1,
        last_used_at: at,
      });
    }
  });
}

/** Top phrases by count × recency-decay. Empty when disabled or unused. */
export async function topSuggestions(limit = 3): Promise<string[]> {
  const db = getDb();
  if (!(await suggestionsEnabled())) return [];

  const at = Date.now();
  const score = (p: CapturePhrase) =>
    p.count * Math.pow(0.5, Math.max(0, at - p.last_used_at) / HALF_LIFE_MS);

  const all = await db.capture_phrases.toArray();
  return all
    .filter((p) => p.count > 1) // a phrase typed once is history, not a habit
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
    .map((p) => p.display);
}

export async function clearSuggestionHistory(): Promise<void> {
  await getDb().capture_phrases.clear();
}

/**
 * Inline Tab-completion for checklist items: the tail text to append to
 * `prefix` so it reads as the best-matching past phrase, or `null` for no
 * match. Unlike topSuggestions(), a phrase used only once still qualifies —
 * this is Tab-to-accept, not an always-visible chip, so there is no passive
 * clutter cost to matching on a single prior use.
 *
 * Matches against `display` (not the pre-normalized `text` column) so the
 * returned tail's length lines up exactly with what the user actually typed,
 * whitespace and all — comparing against the normalized column would risk an
 * off-by-some-whitespace slice if the user's in-progress text has irregular
 * spacing that `text` already collapsed away.
 */
export async function suggestCompletion(prefix: string): Promise<string | null> {
  const db = getDb();
  if (!prefix || !(await suggestionsEnabled())) return null;

  const at = Date.now();
  const score = (p: CapturePhrase) =>
    p.count * Math.pow(0.5, Math.max(0, at - p.last_used_at) / HALF_LIFE_MS);

  const lower = prefix.toLowerCase();
  const all = await db.capture_phrases.toArray();
  const best = all
    .filter((p) => p.display.length > prefix.length && p.display.toLowerCase().startsWith(lower))
    .sort((a, b) => score(b) - score(a))[0];

  return best ? best.display.slice(prefix.length) : null;
}
