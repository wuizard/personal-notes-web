import {unzip} from "fflate";
import {getDb} from "../db";
import {markHadNotes} from "../persistence";
import type {FileKind, LocalFile, LocalNote} from "../types";
import {
    BACKUP_FORMAT_VERSION,
    BackupError,
    type BackupFileMeta,
    type BackupImageMeta,
    type BackupManifest,
} from "./format";

/**
 * Import — docs/08 §8.6.
 *
 * The governing rule: **validate everything before writing anything.** A
 * corrupt or truncated file must leave the existing database untouched rather
 * than half-restored, because for a free user there is no server copy to
 * repair it from.
 */

export type ImportMode = "merge" | "replace";

export interface ImportResult {
  mode: ImportMode;
  notesAdded: number;
  notesUpdated: number;
  notesSkipped: number;
  filesAdded: number;
}

const decoder = new TextDecoder();

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, files) => (err ? reject(err) : resolve(files)));
  });
}

function parseJson<T>(files: Record<string, Uint8Array>, name: string, code: BackupError["code"]): T {
  const raw = files[name];
  if (!raw) throw new BackupError(`${name} is missing from the backup`, code);
  try {
    return JSON.parse(decoder.decode(raw)) as T;
  } catch {
    throw new BackupError(`${name} is not valid JSON`, "malformed");
  }
}

function isValidNote(n: unknown): n is LocalNote {
  if (!n || typeof n !== "object") return false;
  const note = n as Partial<LocalNote>;
  return (
    typeof note.client_id === "string" &&
    note.client_id.length > 0 &&
    typeof note.updated_at === "number" &&
    typeof note.created_at === "number"
  );
}

/** Fills in fields added after the backup was written, so old files still load. */
function normalise(note: LocalNote): LocalNote {
  return {
    ...note,
    title: note.title ?? "",
    body: note.body ?? { type: "doc", content: [] },
    body_text: note.body_text ?? "",
    color: note.color ?? "paper",
    pinned: Boolean(note.pinned),
    archived: Boolean(note.archived),
    labels: Array.isArray(note.labels) ? note.labels : [],
    reminder: note.reminder ?? null,
    deleted_at: note.deleted_at ?? null,
    rev: note.rev ?? 0,
    _base_rev: note._base_rev ?? 0,
    _dirty: 1,
  };
}

interface ValidatedBackup {
  manifest: BackupManifest;
  notes: LocalNote[];
  files: Array<{ meta: BackupFileMeta; blob: Blob; thumb?: Blob }>;
}

function toBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type });
}

/** Parses and fully validates a backup. Throws BackupError; writes nothing. */
export async function readBackup(file: File | Blob): Promise<ValidatedBackup> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BackupError("That file is not a readable .zip backup", "not_a_zip");
  }

  const manifest = parseJson<BackupManifest>(entries, "manifest.json", "missing_manifest");
  if (typeof manifest.format !== "number") {
    throw new BackupError("Backup manifest has no format version", "malformed");
  }
  // Forward compatibility must fail loudly: a newer file may contain fields
  // this build would silently drop, and dropping user data is worse than
  // refusing the import.
  if (manifest.format > BACKUP_FORMAT_VERSION) {
    throw new BackupError(
      `This backup was made by a newer version (format ${manifest.format}). Update the app first.`,
      "unsupported_version",
    );
  }

  const rawNotes = parseJson<unknown[]>(entries, "notes.json", "missing_notes");
  if (!Array.isArray(rawNotes)) throw new BackupError("notes.json is not a list", "malformed");

  const notes = rawNotes.filter(isValidNote).map(normalise);
  if (notes.length !== rawNotes.length) {
    throw new BackupError(
      `${rawNotes.length - notes.length} note(s) in this backup are unreadable`,
      "malformed",
    );
  }

  const files: ValidatedBackup["files"] = [];

  if (entries["files.json"]) {
    // ── v2 ──
    const meta = parseJson<BackupFileMeta[]>(entries, "files.json", "malformed");
    for (const item of meta) {
      const blob = entries[item.blob_file];
      if (!blob) {
        throw new BackupError(`Backup references a missing file (${item.name})`, "missing_image");
      }
      const thumbBytes = item.thumb_file ? entries[item.thumb_file] : undefined;
      files.push({
        meta: item,
        blob: toBlob(blob, item.mime || "application/octet-stream"),
        thumb: thumbBytes ? toBlob(thumbBytes, "image/webp") : undefined,
      });
    }
  } else if (entries["images.json"]) {
    // ── v1 ── every entry becomes a file of kind "image".
    const legacy = parseJson<BackupImageMeta[]>(entries, "images.json", "malformed");
    legacy.forEach((item, i) => {
      const blob = entries[item.blob_file];
      const thumb = entries[item.thumb_file];
      if (!blob || !thumb) {
        throw new BackupError(`Backup references a missing image (${item.id})`, "missing_image");
      }
      files.push({
        meta: {
          id: item.id,
          note_id: item.note_id,
          kind: "image",
          // v1 stored no filename.
          name: `image-${i + 1}.webp`,
          mime: "image/webp",
          bytes: item.bytes,
          created_at: item.created_at,
          width: item.width,
          height: item.height,
          blob_file: item.blob_file,
          thumb_file: item.thumb_file,
        },
        blob: toBlob(blob, "image/webp"),
        thumb: toBlob(thumb, "image/webp"),
      });
    });
  }

  return { manifest, notes, files };
}

/**
 * Applies a validated backup.
 *
 * merge (default) — adds unknown notes; on a client_id collision the copy with
 *   the later `updated_at` wins, so importing an old backup never clobbers
 *   newer local writing.
 * replace — clears notes and attachments first. Destructive; the UI confirms
 *   it. The `meta` table is deliberately preserved so the install marker and
 *   eviction history survive.
 */
export async function applyBackup(
  backup: ValidatedBackup,
  mode: ImportMode = "merge",
): Promise<ImportResult> {
  const db = getDb();
  const result: ImportResult = {
    mode,
    notesAdded: 0,
    notesUpdated: 0,
    notesSkipped: 0,
    filesAdded: 0,
  };

  await db.transaction("rw", db.notes, db.files, db.meta, async () => {
    if (mode === "replace") {
      await db.notes.clear();
      await db.files.clear();
    }

    const existing = new Map((await db.notes.toArray()).map((n) => [n.client_id, n]));

    const toPut: LocalNote[] = [];
    for (const note of backup.notes) {
      const current = existing.get(note.client_id);
      if (!current) {
        toPut.push(note);
        result.notesAdded++;
      } else if (note.updated_at > current.updated_at) {
        toPut.push(note);
        result.notesUpdated++;
      } else {
        result.notesSkipped++;
      }
    }
    if (toPut.length) await db.notes.bulkPut(toPut);

    const keptNoteIds = new Set((await db.notes.toArray()).map((n) => n.client_id));
    const rows: LocalFile[] = backup.files
      // Never import an attachment whose note did not survive the merge — it
      // would be unreachable and count against the user's quota forever.
      .filter(({ meta }) => keptNoteIds.has(meta.note_id))
      .map(({ meta, blob, thumb }) => ({
        id: meta.id,
        note_id: meta.note_id,
        kind: (meta.kind as FileKind) ?? "other",
        name: meta.name,
        mime: meta.mime,
        blob,
        thumb,
        width: meta.width,
        height: meta.height,
        bytes: meta.bytes,
        created_at: meta.created_at,
      }));

    if (rows.length) {
      await db.files.bulkPut(rows);
      result.filesAdded = rows.length;
    }
  });

  if (result.notesAdded + result.notesUpdated > 0) await markHadNotes();
  return result;
}

/** Convenience: validate then apply. */
export async function importBackup(file: File | Blob, mode: ImportMode = "merge") {
  return applyBackup(await readBackup(file), mode);
}
