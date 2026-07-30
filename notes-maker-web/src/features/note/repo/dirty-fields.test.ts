import {beforeEach, describe, expect, it} from "vitest";
import {getDb} from "@/features/storage/db";
import {readPendingPurges} from "@/features/storage/purge-queue";
import {convertNoteKind, createNote, deleteForever, trashNote, updateNote} from "./note-repo";

/**
 * `_dirty_fields` is what lets two devices edit the same note and both
 * survive (docs/04 §4.5 rule 1) — the server can only merge if it is told
 * which fields this device actually touched. Getting it wrong is silent: the
 * note still syncs, it just quietly overwrites someone else's edit.
 */

beforeEach(async () => {
  const db = getDb();
  await db.notes.clear();
  await db.files.clear();
  await db.meta.clear();
});

describe("dirty field tracking", () => {
  it("records the fields an edit touched", async () => {
    const note = await createNote({ title: "Groceries" });

    await updateNote(note.client_id, { color: "sky" });

    const stored = await getDb().notes.get(note.client_id);
    expect(stored?._dirty_fields).toEqual(["color"]);
    expect(stored?._dirty).toBe(1);
  });

  // A note can be edited many times between two syncs, and every one of
  // those fields is still unsent.
  it("accumulates across edits rather than replacing", async () => {
    const note = await createNote({ title: "Groceries" });

    await updateNote(note.client_id, { color: "sky" });
    await updateNote(note.client_id, { pinned: true });
    await updateNote(note.client_id, { color: "blush" });

    const stored = await getDb().notes.get(note.client_id);
    expect([...(stored?._dirty_fields ?? [])].sort()).toEqual(["color", "pinned"]);
  });

  // body_text is derived, not supplied, so nothing else would mark it.
  it("marks the plaintext mirror whenever its sources change", async () => {
    const note = await createNote({ title: "Groceries" });

    await updateNote(note.client_id, { body: { type: "doc", content: [] } });

    const stored = await getDb().notes.get(note.client_id);
    expect(stored?._dirty_fields).toContain("body");
    expect(stored?._dirty_fields).toContain("body_text");
  });

  it("marks a kind switch as the rewrite it is", async () => {
    const note = await createNote({
      kind: "checklist",
      checklist: [{ id: "a", text: "Milk", checked: false, order: 0 }],
    });

    await convertNoteKind(note.client_id, "note");

    const stored = await getDb().notes.get(note.client_id);
    expect([...(stored?._dirty_fields ?? [])].sort()).toEqual([
      "body",
      "body_text",
      "checklist",
      "kind",
    ]);
  });

  // Un-completing is enforced in the repo rather than by callers, so the repo
  // has to mark it too — otherwise the drop never reaches the other device.
  it("marks completed_at when a checklist stops being complete", async () => {
    const note = await createNote({
      kind: "checklist",
      checklist: [{ id: "a", text: "Milk", checked: true, order: 0 }],
    });
    await updateNote(note.client_id, { completed_at: Date.now() });
    await getDb().notes.update(note.client_id, { _dirty_fields: [] });

    await updateNote(note.client_id, {
      checklist: [{ id: "a", text: "Milk", checked: false, order: 0 }],
    });

    const stored = await getDb().notes.get(note.client_id);
    expect(stored?.completed_at).toBeNull();
    expect(stored?._dirty_fields).toContain("completed_at");
  });
});

describe("purge queue", () => {
  // Trashing rides on the surviving row; deleting forever has no row left to
  // ride on, so it has to be queued separately or the next pull resurrects
  // the note from the server's still-live tombstone.
  it("queues a delete-forever for the server", async () => {
    const note = await createNote({ title: "Groceries" });
    await trashNote(note.client_id);

    await deleteForever(note.client_id);

    expect(await readPendingPurges()).toEqual([note.client_id]);
    expect(await getDb().notes.get(note.client_id)).toBeUndefined();
  });

  it("does not queue a purge for an ordinary trash", async () => {
    const note = await createNote({ title: "Groceries" });

    await trashNote(note.client_id);

    expect(await readPendingPurges()).toEqual([]);
    expect((await getDb().notes.get(note.client_id))?.deleted_at).not.toBeNull();
  });
});
