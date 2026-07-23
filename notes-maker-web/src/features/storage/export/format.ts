import type { LocalNote } from "../types";

/**
 * Backup file format — docs/08 §8.6.
 *
 * `version` is an integer and every future importer MUST keep reading older
 * values. A backup made today has to restore in three years, or the promise
 * behind "your data is yours" is empty.
 */
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupManifest {
  format: number;
  exported_at: number;
  app: string;
  counts: { notes: number; images: number };
}

export interface BackupImageMeta {
  id: string;
  note_id: string;
  width: number;
  height: number;
  bytes: number;
  created_at: number;
  /** Filenames inside images/ — the binaries live there, not in JSON. */
  blob_file: string;
  thumb_file: string;
}

export interface BackupPayload {
  manifest: BackupManifest;
  notes: LocalNote[];
  images: BackupImageMeta[];
}

export function backupFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `notesmaker-backup-${stamp}.zip`;
}

export class BackupError extends Error {
  constructor(
    message: string,
    /** Stable code so the UI can map it to translated copy. */
    readonly code:
      | "not_a_zip"
      | "missing_manifest"
      | "missing_notes"
      | "unsupported_version"
      | "missing_image"
      | "malformed",
  ) {
    super(message);
    this.name = "BackupError";
  }
}
