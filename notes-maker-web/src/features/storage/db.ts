import Dexie, { type Table } from "dexie";
import type {
  CapturePhrase,
  FileKind,
  LocalFile,
  LocalImage,
  LocalNote,
  MetaRow,
} from "./types";

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
  /** Superseded by `files` in v2. Declared so the store is never dropped. */
  images!: Table<LocalImage, string>;
  files!: Table<LocalFile, string>;
  capture_phrases!: Table<CapturePhrase, string>;
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

    /**
     * v2 — attachments generalised from images to arbitrary files.
     *
     * `images` is deliberately still declared. Dexie drops any store missing
     * from the latest version, and dropping the store that holds the only copy
     * of a user's photos is precisely what docs/08 §8.1 forbids.
     *
     * The upgrade MOVES rows rather than copying them: Dexie runs it in a
     * single transaction that rolls back entirely on failure, so there is no
     * partial state to recover from — and copying would double image storage
     * for exactly the users closest to their quota.
     */
    this.version(2)
      .stores({
        notes: "client_id, updated_at, [archived+pinned], deleted_at, _dirty",
        images: "id, note_id",
        files: "id, note_id, kind",
        meta: "key",
      })
      .upgrade(async (tx) => {
        const legacy = await tx.table<LocalImage, string>("images").toArray();
        if (!legacy.length) return;

        const migrated: LocalFile[] = legacy.map((image, i) => ({
          id: image.id,
          note_id: image.note_id,
          kind: "image" as FileKind,
          // v1 never stored a filename; synthesise a stable, sensible one.
          name: `image-${i + 1}.webp`,
          mime: image.blob.type || "image/webp",
          blob: image.blob,
          thumb: image.thumb,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          created_at: image.created_at,
        }));

        await tx.table<LocalFile, string>("files").bulkAdd(migrated);
        await tx.table("images").clear();
      });

    /**
     * v3 — capture-phrase history for quick-capture suggestions (docs/10
     * §10.2). Purely additive: a brand-new store, no upgrade callback, no
     * existing row touched.
     */
    this.version(3).stores({
      notes: "client_id, updated_at, [archived+pinned], deleted_at, _dirty",
      images: "id, note_id",
      files: "id, note_id, kind",
      capture_phrases: "text, last_used_at",
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
