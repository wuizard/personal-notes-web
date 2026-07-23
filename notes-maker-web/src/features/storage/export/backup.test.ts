import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import type { LocalFile, LocalNote } from "../types";
import { buildBackupZip } from "./export";
import { BackupError } from "./format";
import { applyBackup, importBackup, readBackup } from "./import";

/**
 * Export/import is the only recovery path the free tier has (docs/08 §8.6).
 * If it is broken, a user who loses their browser data loses everything —
 * there is no server copy. These tests are therefore not optional.
 */

function makeNote(over: Partial<LocalNote> = {}): LocalNote {
  const ts = 1_700_000_000_000;
  return {
    client_id: "019f0000-0000-7000-8000-000000000001",
    title: "Groceries",
    body: { type: "doc", content: [{ type: "paragraph" }] },
    body_text: "Oat milk",
    color: "mint",
    pinned: false,
    archived: false,
    labels: [],
    reminder: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    rev: 0,
    _base_rev: 0,
    _dirty: 1,
    ...over,
  };
}

function makeFile(noteId: string, over: Partial<LocalFile> = {}): LocalFile {
  const bytes = [1, 2, 3, 4, 5];
  return {
    id: "file-1",
    note_id: noteId,
    kind: "image",
    name: "photo.webp",
    mime: "image/webp",
    blob: new Blob([new Uint8Array(bytes)], { type: "image/webp" }),
    thumb: new Blob([new Uint8Array(bytes.slice(0, 2))], { type: "image/webp" }),
    width: 800,
    height: 600,
    bytes: bytes.length,
    created_at: 1_700_000_000_000,
    ...over,
  };
}

async function reset() {
  const db = getDb();
  await db.notes.clear();
  await db.files.clear();
  await db.meta.clear();
}

beforeEach(reset);

describe("backup round-trip", () => {
  it("restores notes and file bytes exactly", async () => {
    const db = getDb();
    const note = makeNote();
    await db.notes.add(note);
    await db.files.add(makeFile(note.client_id));

    const zip = await buildBackupZip();
    expect(zip.size).toBeGreaterThan(0);

    await reset();
    expect(await db.notes.count()).toBe(0);

    const result = await importBackup(zip, "merge");
    expect(result.notesAdded).toBe(1);
    expect(result.filesAdded).toBe(1);

    const restored = await db.notes.get(note.client_id);
    expect(restored).toMatchObject({ client_id: note.client_id, title: "Groceries", color: "mint" });

    // Binary fidelity matters most: a backup that silently corrupts an
    // attachment is worse than one that fails loudly.
    const file = await db.files.get("file-1");
    const bytes = new Uint8Array(await file!.blob.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4, 5]);
    expect(file!.name).toBe("photo.webp");
  });

  it("round-trips a non-image attachment, including its filename and mime", async () => {
    const db = getDb();
    const note = makeNote();
    await db.notes.add(note);
    await db.files.add(
      makeFile(note.client_id, {
        id: "file-pdf",
        kind: "pdf",
        name: "invoice 2026.pdf",
        mime: "application/pdf",
        blob: new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" }),
        thumb: undefined,
        width: undefined,
        height: undefined,
        bytes: 4,
      }),
    );

    const zip = await buildBackupZip();
    await reset();
    await importBackup(zip);

    const file = await getDb().files.get("file-pdf");
    expect(file?.kind).toBe("pdf");
    // The space in the name must survive even though the archive path is
    // sanitised.
    expect(file?.name).toBe("invoice 2026.pdf");
    expect(file?.mime).toBe("application/pdf");
    expect([...new Uint8Array(await file!.blob.arrayBuffer())]).toEqual([37, 80, 68, 70]);
  });

  it("keeps two attachments with the same filename separate", async () => {
    const db = getDb();
    const note = makeNote();
    await db.notes.add(note);
    await db.files.add(makeFile(note.client_id, { id: "a", name: "scan.pdf", kind: "pdf" }));
    await db.files.add(makeFile(note.client_id, { id: "b", name: "scan.pdf", kind: "pdf" }));

    const zip = await buildBackupZip();
    await reset();
    const result = await importBackup(zip);

    // Archive paths are prefixed with the id; without that one would overwrite
    // the other inside the zip and a file would be lost.
    expect(result.filesAdded).toBe(2);
    expect(await db.files.count()).toBe(2);
  });

  it("preserves tombstones so deletions survive a restore", async () => {
    const db = getDb();
    await db.notes.add(makeNote({ deleted_at: 1_700_000_500_000 }));

    const zip = await buildBackupZip();
    await reset();
    await importBackup(zip);

    expect((await db.notes.toCollection().first())?.deleted_at).toBe(1_700_000_500_000);
  });
});

describe("merge semantics", () => {
  it("never overwrites a newer local note with an older backup", async () => {
    const db = getDb();
    await db.notes.add(makeNote({ title: "Old" }));
    const zip = await buildBackupZip();

    await db.notes.put(makeNote({ title: "Newer local", updated_at: 1_700_000_999_000 }));

    const result = await importBackup(zip, "merge");
    expect(result.notesSkipped).toBe(1);
    expect((await db.notes.toCollection().first())?.title).toBe("Newer local");
  });

  it("updates when the backup copy is newer", async () => {
    const db = getDb();
    await db.notes.add(makeNote({ title: "From backup", updated_at: 1_700_000_999_000 }));
    const zip = await buildBackupZip();

    await db.notes.put(makeNote({ title: "Stale local", updated_at: 1_700_000_001_000 }));

    const result = await importBackup(zip, "merge");
    expect(result.notesUpdated).toBe(1);
    expect((await db.notes.toCollection().first())?.title).toBe("From backup");
  });

  it("replace mode clears existing notes first", async () => {
    const db = getDb();
    await db.notes.add(makeNote({ title: "In backup" }));
    const zip = await buildBackupZip();

    await db.notes.add(
      makeNote({ client_id: "019f0000-0000-7000-8000-00000000ffff", title: "Local only" }),
    );
    expect(await db.notes.count()).toBe(2);

    await importBackup(zip, "replace");
    const all = await db.notes.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("In backup");
  });

  it("drops attachments whose note did not survive the merge", async () => {
    const db = getDb();
    const note = makeNote();
    await db.notes.add(note);
    await db.files.add(makeFile(note.client_id));
    const zip = await buildBackupZip();

    await reset();
    const backup = await readBackup(zip);
    backup.notes = [];
    const result = await applyBackup(backup, "merge");

    // An orphaned attachment would be unreachable and count against quota
    // forever.
    expect(result.filesAdded).toBe(0);
    expect(await db.files.count()).toBe(0);
  });
});

describe("backward compatibility", () => {
  it("imports a v1 backup, turning its images into files", async () => {
    const { zip } = await import("fflate");
    const enc = new TextEncoder();
    const note = makeNote();

    // A format-1 archive as the previous release wrote it: images.json plus
    // images/ paths, and no files.json.
    const files = {
      "manifest.json": enc.encode(
        JSON.stringify({ format: 1, exported_at: 0, app: "notes-maker", counts: { notes: 1, images: 1 } }),
      ),
      "notes.json": enc.encode(JSON.stringify([note])),
      "images.json": enc.encode(
        JSON.stringify([
          {
            id: "legacy-1",
            note_id: note.client_id,
            width: 800,
            height: 600,
            bytes: 3,
            created_at: 1_700_000_000_000,
            blob_file: "images/legacy-1-full.webp",
            thumb_file: "images/legacy-1-thumb.webp",
          },
        ]),
      ),
      "images/legacy-1-full.webp": new Uint8Array([9, 9, 9]),
      "images/legacy-1-thumb.webp": new Uint8Array([9]),
    };

    const packed: Uint8Array = await new Promise((res, rej) =>
      zip(files, (e, d) => (e ? rej(e) : res(d))),
    );

    const result = await importBackup(new Blob([packed.slice().buffer as ArrayBuffer]));
    expect(result.notesAdded).toBe(1);
    expect(result.filesAdded).toBe(1);

    const file = await getDb().files.get("legacy-1");
    expect(file?.kind).toBe("image");
    expect([...new Uint8Array(await file!.blob.arrayBuffer())]).toEqual([9, 9, 9]);
  });
});

describe("validation", () => {
  it("rejects a file that is not a zip and leaves the database untouched", async () => {
    const db = getDb();
    await db.notes.add(makeNote({ title: "Precious" }));

    await expect(importBackup(new Blob([new Uint8Array([0, 1, 2, 3])]))).rejects.toThrow(BackupError);

    expect(await db.notes.count()).toBe(1);
    expect((await db.notes.toCollection().first())?.title).toBe("Precious");
  });

  it("refuses a backup from a newer format version", async () => {
    const { zip } = await import("fflate");
    const enc = new TextEncoder();
    const files = {
      "manifest.json": enc.encode(
        JSON.stringify({ format: 999, exported_at: 0, app: "x", counts: { notes: 0, files: 0 } }),
      ),
      "notes.json": enc.encode("[]"),
    };
    const packed: Uint8Array = await new Promise((res, rej) =>
      zip(files, (e, d) => (e ? rej(e) : res(d))),
    );

    await expect(
      importBackup(new Blob([packed.slice().buffer as ArrayBuffer])),
    ).rejects.toMatchObject({ code: "unsupported_version" });
  });

  it("refuses a backup whose notes.json is malformed", async () => {
    const { zip } = await import("fflate");
    const enc = new TextEncoder();
    const files = {
      "manifest.json": enc.encode(
        JSON.stringify({ format: 2, exported_at: 0, app: "x", counts: { notes: 1, files: 0 } }),
      ),
      "notes.json": enc.encode(JSON.stringify([{ nope: true }])),
    };
    const packed: Uint8Array = await new Promise((res, rej) =>
      zip(files, (e, d) => (e ? rej(e) : res(d))),
    );

    await expect(
      importBackup(new Blob([packed.slice().buffer as ArrayBuffer])),
    ).rejects.toMatchObject({ code: "malformed" });
  });
});
