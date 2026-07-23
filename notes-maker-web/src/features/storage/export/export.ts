import { zip } from "fflate";
import { getDb } from "../db";
import { setLastExportAt } from "../persistence";
import {
  BACKUP_FORMAT_VERSION,
  backupFilename,
  type BackupImageMeta,
  type BackupManifest,
} from "./format";

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
    // level 6 rather than 9: images are already WebP-compressed, so maximum
    // effort buys almost nothing and noticeably janks a large library.
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

export async function buildBackupZip(): Promise<Blob> {
  const db = getDb();
  const [notes, images] = await Promise.all([db.notes.toArray(), db.images.toArray()]);

  const files: Record<string, Uint8Array> = {};
  const imageMeta: BackupImageMeta[] = [];

  for (const img of images) {
    const blobFile = `images/${img.id}-full.webp`;
    const thumbFile = `images/${img.id}-thumb.webp`;
    files[blobFile] = new Uint8Array(await img.blob.arrayBuffer());
    files[thumbFile] = new Uint8Array(await img.thumb.arrayBuffer());
    imageMeta.push({
      id: img.id,
      note_id: img.note_id,
      width: img.width,
      height: img.height,
      bytes: img.bytes,
      created_at: img.created_at,
      blob_file: blobFile,
      thumb_file: thumbFile,
    });
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT_VERSION,
    exported_at: Date.now(),
    app: "notes-maker",
    counts: { notes: notes.length, images: images.length },
  };

  files["manifest.json"] = encoder.encode(JSON.stringify(manifest, null, 2));
  files["notes.json"] = encoder.encode(JSON.stringify(notes));
  files["images.json"] = encoder.encode(JSON.stringify(imageMeta));

  const packed = await zipAsync(files);
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
