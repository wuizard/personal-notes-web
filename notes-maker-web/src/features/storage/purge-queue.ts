import {getDb} from "./db";
import {META} from "./types";

/**
 * The list of notes deleted forever here that the server has not been told
 * about yet.
 *
 * Trashing a note is easy to sync: the row survives with `deleted_at` set, so
 * it pushes like any other edit. Deleting forever removes the row, and a row
 * that no longer exists cannot carry a mutation — so without this queue the
 * next pull would receive the server's still-live tombstone and cheerfully
 * resurrect the note the user just destroyed.
 *
 * It is written unconditionally, by every caller that hard-deletes, rather
 * than only when sync is on. note-repo has no business knowing the plan, and
 * a free user who subscribes later should not have their pre-subscription
 * deletions come back.
 */

/**
 * Free users never drain this, so it is bounded rather than allowed to grow
 * for the life of an install. Overflow drops the oldest ids: the note is
 * already gone locally, and the worst case is that it lingers in another
 * device's trash until its own 30-day retention expires.
 */
const MAX_PENDING_PURGES = 500;

export async function readPendingPurges(): Promise<string[]> {
  const row = await getDb().meta.get(META.syncPendingPurges);
  return Array.isArray(row?.value) ? (row.value as string[]) : [];
}

export async function recordPurges(clientIds: string[]): Promise<void> {
  if (!clientIds.length) return;
  const db = getDb();
  await db.transaction("rw", db.meta, async () => {
    const row = await db.meta.get(META.syncPendingPurges);
    const existing = Array.isArray(row?.value) ? (row.value as string[]) : [];
    const merged = [...new Set([...existing, ...clientIds])];
    await db.meta.put({
      key: META.syncPendingPurges,
      value: merged.slice(-MAX_PENDING_PURGES),
    });
  });
}

/** Called after the server has acknowledged the purges. */
export async function clearPurges(clientIds: string[]): Promise<void> {
  if (!clientIds.length) return;
  const db = getDb();
  await db.transaction("rw", db.meta, async () => {
    const row = await db.meta.get(META.syncPendingPurges);
    const existing = Array.isArray(row?.value) ? (row.value as string[]) : [];
    const done = new Set(clientIds);
    await db.meta.put({
      key: META.syncPendingPurges,
      value: existing.filter((id) => !done.has(id)),
    });
  });
}
