import { uuidv7 } from "uuidv7";
import { getDb } from "@/features/storage/db";
import { estimateStorage, isQuotaCritical } from "@/features/storage/persistence";
import { MAX_FILE_BYTES, type LocalFile } from "@/features/storage/types";
import { processImage } from "@/features/image/pipeline";
import { classify } from "./kind";

/**
 * Attachment storage — docs/08 §8.4.
 *
 * Images are downscaled and re-encoded (see image/pipeline). Everything else
 * is stored byte-for-byte: a PDF or a video cannot be usefully re-encoded in a
 * browser, and silently degrading someone's document would be worse than the
 * bytes it saved.
 */

export class QuotaExceededError extends Error {
  constructor() {
    super("Storage is nearly full");
    this.name = "QuotaExceededError";
  }
}

export class FileTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super("File exceeds the per-file limit");
    this.name = "FileTooLargeError";
  }
}

export async function addFile(noteId: string, file: File): Promise<LocalFile> {
  if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(MAX_FILE_BYTES);

  // Checked before doing any work: refusing early is much friendlier than
  // decoding a 20MB video and then failing to store it. Text is never blocked
  // this way — only attachments (docs/06 §6.13).
  const estimate = await estimateStorage();
  if (isQuotaCritical(estimate)) throw new QuotaExceededError();

  const kind = classify(file.type, file.name);
  const now = Date.now();

  let record: LocalFile;

  if (kind === "image") {
    const processed = await processImage(file);
    record = {
      id: uuidv7(),
      note_id: noteId,
      kind,
      name: file.name || "image.webp",
      // The stored blob is the re-encoded one, so the recorded mime must
      // describe *that*, not the original upload.
      mime: processed.blob.type || "image/webp",
      blob: processed.blob,
      thumb: processed.thumb,
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
      created_at: now,
    };
  } else {
    record = {
      id: uuidv7(),
      note_id: noteId,
      kind,
      name: file.name || "file",
      mime: file.type || "application/octet-stream",
      blob: file,
      bytes: file.size,
      created_at: now,
    };
  }

  await getDb().files.add(record);
  return record;
}

export async function listFiles(noteId: string): Promise<LocalFile[]> {
  const files = await getDb().files.where("note_id").equals(noteId).toArray();
  return files.sort((a, b) => a.created_at - b.created_at);
}

export async function getFile(id: string): Promise<LocalFile | undefined> {
  return getDb().files.get(id);
}

export async function deleteFile(id: string): Promise<void> {
  await getDb().files.delete(id);
}

/** Removes every attachment belonging to a note. Used when emptying trash. */
export async function deleteFilesForNotes(noteIds: string[]): Promise<void> {
  if (!noteIds.length) return;
  await getDb().files.where("note_id").anyOf(noteIds).delete();
}
