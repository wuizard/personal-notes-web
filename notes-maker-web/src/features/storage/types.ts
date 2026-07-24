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

/**
 * A recurring reminder — docs/10 §10.4.
 *
 * The source of truth is WALL-CLOCK time plus an IANA timezone (`time`,
 * `weekday`, `tz`), never a UTC instant: "start of my day" must survive DST
 * and travel. `remind_at` is a derived cache of the next occurrence as an
 * epoch instant, recomputed locally, kept so the overdue list can compare
 * against Date.now() without timezone math. The wall-clock fields are optional
 * because rows written before docs/10 carried only `remind_at`.
 */
export interface LocalReminder {
  remind_at: number; // epoch ms — derived next occurrence, see above
  repeat: RepeatRule;
  state: ReminderState;
  fired_at: number | null;
  /** "HH:mm", user's local wall clock. */
  time?: string;
  /** 0 (Sunday) – 6 (Saturday). Weekly only. */
  weekday?: number;
  /** IANA zone captured when the reminder was set, for Phase 2 server-side computation. */
  tz?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  order: number;
}

/**
 * Checklists are a first-class capture type (docs/10 §10.1), not a note
 * decoration. `kind` is optional because rows written before it existed have
 * no value — absent means "note", and normalising old rows in place would be
 * a migration on the only copy of someone's data (docs/08 §8.1).
 */
export type NoteKind = "note" | "checklist";

/** Tiptap / ProseMirror document. Kept loose until Stage C introduces Tiptap. */
export interface NoteDoc {
  type: "doc";
  content?: unknown[];
}

export interface LocalNote {
  /** UUIDv7 — client-generated, sorts by creation time, and the Phase 2 idempotency key. */
  client_id: string;

  /** Absent on rows created before checklists existed — read via noteKind(). */
  kind?: NoteKind;
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

/**
 * One row per distinct capture phrase — docs/10 §10.2. Entirely local: this
 * table is the entire "smart suggestions" feature, and nothing in it ever
 * leaves the device.
 */
export interface CapturePhrase {
  /** Normalized (trimmed, single-spaced, lowercased) — the primary key. */
  text: string;
  /** As the user last typed it — what a suggestion chip displays. */
  display: string;
  count: number;
  last_used_at: number;
}

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
  /** `true` disables capture suggestions (docs/10 §10.2). Absent means enabled. */
  suggestionsDisabled: "suggestionsDisabled",
} as const;

export interface InstallMeta {
  installedAt: number;
  /** Set true the first time a note is created — the eviction signal. */
  everHadNotes: boolean;
}
