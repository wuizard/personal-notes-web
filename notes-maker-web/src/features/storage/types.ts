/**
 * Local data model — docs/02 §2.0 and docs/08 §8.2.
 *
 * Fields exist here that v1 never reads (`rev`, `_base_rev`, `_dirty`) because
 * adding a column to an IndexedDB store that already holds user rows is a
 * migration, and migrations on the only copy of someone's notes are exactly
 * what docs/08 §8.1 forbids. They cost nothing now and turn the Phase 2
 * upgrade into an ordinary upload (docs/08 §8.7).
 */

export const NOTE_COLORS = [
  "paper",
  "blush",
  "peach",
  "butter",
  "sage",
  "mint",
  "sky",
  "periwinkle",
  "lilac",
  "clay",
] as const;

export type NoteColor = (typeof NOTE_COLORS)[number];

export type RepeatRule = "none" | "daily" | "weekly" | "monthly";
export type ReminderState = "scheduled" | "fired" | "dismissed";

export interface LocalReminder {
  remind_at: number; // epoch ms, absolute
  repeat: RepeatRule;
  state: ReminderState;
  fired_at: number | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  order: number;
}

/** Tiptap / ProseMirror document. Kept loose until Stage C introduces Tiptap. */
export interface NoteDoc {
  type: "doc";
  content?: unknown[];
}

export interface LocalNote {
  /** UUIDv7 — client-generated, sorts by creation time, and the Phase 2 idempotency key. */
  client_id: string;

  title: string;
  body: NoteDoc;
  /** Flattened plaintext for local search. Derived; never authored directly. */
  body_text: string;
  checklist?: ChecklistItem[];

  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  labels: string[];
  reminder: LocalReminder | null;

  created_at: number;
  updated_at: number;
  /** Tombstone. Trash in v1; sync correctness in Phase 2. */
  deleted_at: number | null;

  // ── Phase 2 sync fields, unused in v1 ──
  rev: number;
  _base_rev: number;
  /** 0|1 rather than boolean: IndexedDB cannot index booleans (docs/08 §8.2). */
  _dirty: 0 | 1;
}

/** Legacy v1 shape. Kept so the v2 migration and old backups still type-check. */
export interface LocalImage {
  id: string;
  note_id: string;
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
  bytes: number;
  created_at: number;
}

/**
 * How an attachment can be shown. Anything not previewable still stores and
 * downloads fine — it just gets a typed placeholder instead of a preview.
 */
export type FileKind = "image" | "video" | "pdf" | "markdown" | "other";

/**
 * Any attachment on a note — docs/08 §8.4.
 *
 * Supersedes `LocalImage`. Images keep a downscaled `blob` plus a `thumb`;
 * every other kind stores the original bytes untouched, because nothing else
 * can be usefully re-encoded in a browser.
 */
export interface LocalFile {
  id: string;
  note_id: string;
  kind: FileKind;
  /** Original filename, shown in the UI and used for download. */
  name: string;
  mime: string;
  blob: Blob;
  /** Images only — the ~400px preview. */
  thumb?: Blob;
  width?: number;
  height?: number;
  bytes: number;
  created_at: number;
}

/**
 * Per-file ceiling.
 *
 * The free tier's only storage is the browser's quota, and on iOS Safari that
 * is often ~1GB or less. One uncapped video could take a large share of it,
 * and a near-full origin is exactly when browsers evict — losing the user's
 * notes, not just the file (docs/08 §8.3).
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Keys used in the `meta` table. Centralised so they cannot drift. */
export const META = {
  /** Written on very first run; used to tell eviction from a fresh install. */
  install: "install",
  schemaVersion: "schemaVersion",
  lastExportAt: "lastExportAt",
  persistencePrompted: "persistencePrompted",
  backupNudgedAt: "backupNudgedAt",
} as const;

export interface InstallMeta {
  installedAt: number;
  /** Set true the first time a note is created — the eviction signal. */
  everHadNotes: boolean;
}
