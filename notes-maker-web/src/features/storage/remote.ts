import {fetchPage, sendMutations} from "@/features/sync/api";
import type {WireMutation} from "@/features/sync/types";

/**
 * Remote-data seam for the full-wipe flow — Phase 2 (docs/04).
 *
 * The wipe dialog (components/reset-panel.tsx) offers "keep or delete the
 * notes in your account" only when the count is non-zero, so these two
 * functions are the whole of that step.
 *
 * Neither throws. Being unable to reach the server must not stop someone
 * wiping their own device, so an unreachable API reads as "no remote data" —
 * exactly what these returned while they were stubs.
 */

const PAGE_SIZE = 200;
const MAX_PAGES = 50;
/** Matches the server's push cap (docs/04 §4.4). */
const MAX_BATCH = 100;

/** Every note the account holds server-side, tombstones excluded. */
async function listLiveRemoteIds(): Promise<string[]> {
  const ids: string[] = [];
  let cursor = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    const remote = await fetchPage(cursor, PAGE_SIZE);
    for (const note of remote.notes) {
      if (!note.deletedAt) ids.push(note.clientId);
    }
    cursor = remote.cursor;
    if (!remote.hasMore) break;
  }

  return ids;
}

export async function countRemoteNotes(uid: string): Promise<number> {
  // The ID token identifies the account server-side; uid is the caller's own
  // signed-in check, not something this request needs to carry.
  void uid;
  try {
    return (await listLiveRemoteIds()).length;
  } catch {
    return 0;
  }
}

export async function deleteRemoteNotes(uid: string): Promise<void> {
  void uid;
  try {
    const ids = await listLiveRemoteIds();

    for (let start = 0; start < ids.length; start += MAX_BATCH) {
      const mutations: WireMutation[] = ids.slice(start, start + MAX_BATCH).map((clientId, i) => ({
        seq: i,
        clientId,
        baseRev: 0,
        changedFields: [],
        // Purge, not trash. Someone asking to delete the notes in their
        // account means gone — not "moved somewhere they can still be read".
        purged: true,
      }));
      await sendMutations(mutations);
    }
  } catch {
    // Deliberately swallowed: the local wipe is what the user asked for and
    // has to proceed either way.
  }
}
