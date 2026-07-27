import {zip} from "fflate";
import {getDb} from "../db";
import {setLastExportAt} from "../persistence";
import {BACKUP_FORMAT_VERSION, type BackupFileMeta, backupFilename, type BackupManifest,} from "./format";

/**
 * Export — docs/08 §8.6.
 *
 * The safety net for the entire free tier, and free on purpose: holding
 * someone's notes hostage in a browser that might evict them is indefensible
 * (docs/00 §0.2).
 */

const encoder = new TextEncoder();

function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // level 6 rather than 9: attachments are already compressed (WebP, PDF,
    // video), so maximum effort buys almost nothing and noticeably janks a
    // large library.
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/** Keeps archive paths unique and safe regardless of the original filename. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
}

export async function buildBackupZip(): Promise<Blob> {
  const db = getDb();
  const [notes, attachments] = await Promise.all([db.notes.toArray(), db.files.toArray()]);

  const entries: Record<string, Uint8Array> = {};
  const fileMeta: BackupFileMeta[] = [];

  for (const file of attachments) {
    // Prefixing with the id guarantees uniqueness — two notes can legitimately
    // both attach "scan.pdf".
    const blobPath = `files/${file.id}-${safeName(file.name)}`;
    entries[blobPath] = new Uint8Array(await file.blob.arrayBuffer());

    let thumbPath: string | undefined;
    if (file.thumb) {
      thumbPath = `files/${file.id}-thumb.webp`;
      entries[thumbPath] = new Uint8Array(await file.thumb.arrayBuffer());
    }

    fileMeta.push({
      id: file.id,
      note_id: file.note_id,
      kind: file.kind,
      name: file.name,
      mime: file.mime,
      bytes: file.bytes,
      created_at: file.created_at,
      width: file.width,
      height: file.height,
      blob_file: blobPath,
      thumb_file: thumbPath,
    });
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT_VERSION,
    exported_at: Date.now(),
    app: "notes-maker",
    counts: { notes: notes.length, files: attachments.length },
  };

  entries["manifest.json"] = encoder.encode(JSON.stringify(manifest, null, 2));
  entries["notes.json"] = encoder.encode(JSON.stringify(notes));
  entries["files.json"] = encoder.encode(JSON.stringify(fileMeta));

  const packed = await zipAsync(entries);
  // Copy into a fresh ArrayBuffer: fflate may hand back a view over a larger
  // pooled buffer, and Blob would otherwise capture the surplus bytes.
  return new Blob([packed.slice().buffer as ArrayBuffer], { type: "application/zip" });
}

/** Builds the backup and hands it to the browser as a download. */
export async function downloadBackup(): Promise<void> {
  const blob = await buildBackupZip();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFilename();
    document.body.append(a);
    a.click();
    a.remove();
    await setLastExportAt(Date.now());
  } finally {
    // Revoking synchronously can cancel the download in some browsers; one
    // task later is enough for the click to have been handled.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
