import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../db";
import type { LocalImage, LocalNote } from "../types";
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

function makeImage(noteId: string, bytes: number[]): LocalImage {
  return {
    id: "img-1",
    note_id: noteId,
    blob: new Blob([new Uint8Array(bytes)], { type: "image/webp" }),
    thumb: new Blob([new Uint8Array(bytes.slice(0, 2))], { type: "image/webp" }),
    width: 800,
    height: 600,
    bytes: bytes.length,
    created_at: 1_700_000_000_000,
  };
}

async function reset() {
  const db = getDb();
  await db.notes.clear();
  await db.images.clear();
  await db.meta.clear();
}

beforeEach(reset);

describe("backup round-trip", () => {
  it("restores notes and image bytes exactly", async () => {
    const db = getDb();
    const note = makeNote();
    const image = makeImage(note.client_id, [1, 2, 3, 4, 5]);
    await db.notes.add(note);
    await db.images.add(image);

    const zip = await buildBackupZip();
    expect(zip.size).toBeGreaterThan(0);

    await reset();
    expect(await db.notes.count()).toBe(0);

    const result = await importBackup(zip, "merge");
    expect(result.notesAdded).toBe(1);
    expect(result.imagesAdded).toBe(1);

    const restored = await db.notes.get(note.client_id);
    expect(restored).toMatchObject({
      client_id: note.client_id,
      title: "Groceries",
      color: "mint",
      body_text: "Oat milk",
      created_at: note.created_at,
    });

    // Binary fidelity matters most: a backup that silently corrupts photos is
    // worse than one that fails loudly.
    const restoredImage = await db.images.get("img-1");
    const bytes = new Uint8Array(await restoredImage!.blob.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4, 5]);
    expect(restoredImage!.width).toBe(800);
  });

  it("preserves tombstones so deletions survive a restore", async () => {
    const db = getDb();
    await db.notes.add(makeNote({ deleted_at: 1_700_000_500_000 }));

    const zip = await buildBackupZip();
    await reset();
    await importBackup(zip);

    const restored = await db.notes.toCollection().first();
    expect(restored?.deleted_at).toBe(1_700_000_500_000);
  });
});

describe("merge semantics", () => {
  it("never overwrites a newer local note with an older backup", async () => {
    const db = getDb();
    await db.notes.add(makeNote({ title: "Old" }));
    const zip = await buildBackupZip();

    // Local edit lands after the backup was taken.
    await db.notes.put(makeNote({ title: "Newer local", updated_at: 1_700_000_999_000 }));

    const result = await importBackup(zip, "merge");
    expect(result.notesSkipped).toBe(1);
    expect(result.notesUpdated).toBe(0);

    const note = await db.notes.toCollection().first();
    expect(note?.title).toBe("Newer local");
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

  it("drops images whose note did not survive the merge", async () => {
    const db = getDb();
    const note = makeNote();
    await db.notes.add(note);
    await db.images.add(makeImage(note.client_id, [9, 9]));
    const zip = await buildBackupZip();

    await reset();
    // Import only the images half by validating then removing the note.
    const backup = await readBackup(zip);
    backup.notes = [];
    const result = await applyBackup(backup, "merge");

    // An orphaned image would be unreachable and count against quota forever.
    expect(result.imagesAdded).toBe(0);
    expect(await db.images.count()).toBe(0);
  });
});

describe("validation", () => {
  it("rejects a file that is not a zip and leaves the database untouched", async () => {
    const db = getDb();
    await db.notes.add(makeNote({ title: "Precious" }));

    const junk = new Blob([new Uint8Array([0, 1, 2, 3])]);
    await expect(importBackup(junk)).rejects.toThrow(BackupError);

    expect(await db.notes.count()).toBe(1);
    expect((await db.notes.toCollection().first())?.title).toBe("Precious");
  });

  it("refuses a backup from a newer format version", async () => {
    const { zip } = await import("fflate");
    const enc = new TextEncoder();
    const files = {
      "manifest.json": enc.encode(JSON.stringify({ format: 999, exported_at: 0, app: "x", counts: { notes: 0, images: 0 } })),
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
      "manifest.json": enc.encode(JSON.stringify({ format: 1, exported_at: 0, app: "x", counts: { notes: 1, images: 0 } })),
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
