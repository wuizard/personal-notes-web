import Dexie, { type Table } from "dexie";
import type { LocalImage, LocalNote, MetaRow } from "./types";

/**
 * The local database — docs/08 §8.2.
 *
 * For free users this is the ONLY copy of their notes. Three rules follow, and
 * none of them are negotiable:
 *
 *   1. Migrations are additive only. Never drop a store, never rename a field
 *      in place, never transform destructively. A failed migration is data loss
 *      with no server to restore from.
 *   2. Export must keep working (see ./export).
 *   3. Eviction will happen to some users; detect it (see ./persistence).
 */
export class NotesDB extends Dexie {
  notes!: Table<LocalNote, string>;
  images!: Table<LocalImage, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("notesmaker");

    // Only the FIRST column is the primary key; the rest are secondary indexes.
    // `_dirty` is indexable only because it is stored as 0|1 — IndexedDB
    // silently refuses to index booleans.
    this.version(1).stores({
      notes: "client_id, updated_at, [archived+pinned], deleted_at, _dirty",
      images: "id, note_id",
      meta: "key",
    });
  }
}

/**
 * Dexie opens a real IndexedDB connection on construction, which does not exist
 * during SSR or in the Node build. A module-level `new NotesDB()` therefore
 * crashes `next build` while prerendering. Instantiate lazily, on the client
 * only, and let callers fail loudly if they somehow reach it on the server.
 */
let instance: NotesDB | null = null;

export function getDb(): NotesDB {
  if (typeof indexedDB === "undefined") {
    throw new Error(
      "getDb() called without IndexedDB — this must run in the browser. " +
        "Wrap the caller in a client component or an effect.",
    );
  }
  instance ??= new NotesDB();
  return instance;
}

/** True when local storage is usable at all. Private modes can disable it. */
export function isStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * Deletes everything. Used by "Reset local data" in Settings and by the
 * `replace` import path. Destructive and irreversible — callers must confirm.
 */
export async function wipeDatabase(): Promise<void> {
  const db = getDb();
  await db.delete();
  instance = null;
}
