import { uuidv7 } from "uuidv7";
import { getDb } from "@/features/storage/db";
import { markHadNotes } from "@/features/storage/persistence";
import type { LocalNote, NoteColor, NoteDoc } from "@/features/storage/types";
import { buildBodyText } from "../model/body-text";

/**
 * The only module that reads or writes notes.
 *
 * Components never touch Dexie directly (docs/01 §1.5). When Phase 2 adds a
 * server, this file changes and nothing above it learns that a network exists.
 */

export type NoteFilter = "active" | "archived" | "trash";

export interface CreateNoteInput {
  title?: string;
  body?: NoteDoc;
  color?: NoteColor;
}

function now() {
  return Date.now();
}

export async function createNote(input: CreateNoteInput = {}): Promise<LocalNote> {
  const db = getDb();
  const ts = now();
  const body = input.body ?? { type: "doc", content: [] };

  const note: LocalNote = {
    client_id: uuidv7(),
    title: input.title ?? "",
    body,
    body_text: buildBodyText(body),
    color: input.color ?? "paper",
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
  };

  await db.notes.add(note);
  // Records that this browser has held notes, so a later empty database can be
  // recognised as eviction rather than a fresh install (docs/08 §8.3).
  await markHadNotes();
  return note;
}

/** Fields a caller may change. Everything else is derived or managed here. */
export type NotePatch = Partial<
  Pick<LocalNote, "title" | "body" | "color" | "pinned" | "archived" | "checklist" | "reminder">
>;

export async function updateNote(clientId: string, patch: NotePatch): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.notes, async () => {
    const existing = await db.notes.get(clientId);
    if (!existing) return;

    const next: LocalNote = { ...existing, ...patch, updated_at: now(), _dirty: 1 };

    // body_text is always recomputed rather than accepted from the caller, so
    // it can never drift from the content it indexes.
    if (patch.body !== undefined || patch.checklist !== undefined) {
      next.body_text = buildBodyText(next.body, next.checklist);
    }

    await db.notes.put(next);
  });
}

/** Soft delete — moves to trash. Hard deletion only happens in emptyTrash. */
export async function trashNote(clientId: string): Promise<void> {
  const db = getDb();
  await db.notes.update(clientId, { deleted_at: now(), updated_at: now(), _dirty: 1 });
}

export async function restoreNote(clientId: string): Promise<void> {
  const db = getDb();
  await db.notes.update(clientId, { deleted_at: null, updated_at: now(), _dirty: 1 });
}

export async function setArchived(clientId: string, archived: boolean): Promise<void> {
  return updateNote(clientId, { archived });
}

export async function setPinned(clientId: string, pinned: boolean): Promise<void> {
  return updateNote(clientId, { pinned });
}

export async function getNote(clientId: string): Promise<LocalNote | undefined> {
  return getDb().notes.get(clientId);
}

/**
 * Lists notes for a view. Sorting happens in memory: the result set is bounded
 * by the free-tier cap, and a compound index cannot express
 * "pinned first, then newest" in one pass anyway.
 */
export async function listNotes(filter: NoteFilter = "active"): Promise<LocalNote[]> {
  const db = getDb();
  const all = await db.notes.toArray();

  const visible = all.filter((n) => {
    if (filter === "trash") return n.deleted_at !== null;
    if (n.deleted_at !== null) return false;
    return filter === "archived" ? n.archived : !n.archived;
  });

  return visible.sort((a, b) => {
    if (filter === "active" && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at - a.updated_at;
  });
}

/** Counts toward the free-tier cap: live notes only, excluding trash. */
export async function countActiveNotes(): Promise<number> {
  const db = getDb();
  const all = await db.notes.toArray();
  return all.filter((n) => n.deleted_at === null && !n.archived).length;
}

export async function searchNotes(query: string): Promise<LocalNote[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await listNotes("active");
  return all.filter(
    (n) => n.title.toLowerCase().includes(q) || n.body_text.toLowerCase().includes(q),
  );
}

/** Permanently deletes trashed notes and their images. Irreversible. */
export async function emptyTrash(): Promise<number> {
  const db = getDb();
  return db.transaction("rw", db.notes, db.images, async () => {
    const trashed = await db.notes.filter((n) => n.deleted_at !== null).toArray();
    const ids = trashed.map((n) => n.client_id);
    await db.images.where("note_id").anyOf(ids).delete();
    await db.notes.bulkDelete(ids);
    return ids.length;
  });
}
