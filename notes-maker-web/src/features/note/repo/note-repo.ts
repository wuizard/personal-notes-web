import { uuidv7 } from "uuidv7";
import { getDb } from "@/features/storage/db";
import { markHadNotes } from "@/features/storage/persistence";
import type { ChecklistItem, LocalNote, NoteColor, NoteDoc, NoteKind } from "@/features/storage/types";
import { buildBodyText } from "../model/body-text";
import { checklistToDoc, docToChecklist, noteKind } from "../model/convert";

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
  kind?: NoteKind;
  checklist?: ChecklistItem[];
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
    kind: input.kind ?? "note",
    title: input.title ?? "",
    body,
    body_text: buildBodyText(body, input.checklist),
    ...(input.checklist ? { checklist: input.checklist } : {}),
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

/**
 * Switches a note between its two kinds — docs/10 §10.1.
 *
 * checklist → note is lossless (items become a bulleted list). note →
 * checklist flattens formatting to plain lines, which is why the UI confirms
 * before calling it with `to: "checklist"`.
 */
export async function convertNoteKind(clientId: string, to: NoteKind): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.notes, async () => {
    const existing = await db.notes.get(clientId);
    if (!existing || noteKind(existing) === to) return;

    let next: LocalNote;
    if (to === "note") {
      const body = checklistToDoc(existing.checklist ?? []);
      // Rest/spread rather than `checklist: undefined` — IndexedDB stores an
      // explicit undefined as a real value, and the absent-means-note contract
      // in types.ts expects the key to be gone.
      const { checklist: _dropped, ...rest } = existing;
      void _dropped;
      next = { ...rest, kind: "note", body, body_text: buildBodyText(body) };
    } else {
      const checklist = docToChecklist(existing.body);
      const body: NoteDoc = { type: "doc", content: [{ type: "paragraph" }] };
      next = {
        ...existing,
        kind: "checklist",
        body,
        checklist,
        body_text: buildBodyText(body, checklist),
      };
    }

    next.updated_at = now();
    next._dirty = 1;
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

/**
 * Counts toward the free-tier cap: live notes only, excluding trash — and
 * excluding checklists, which are uncapped on every tier (docs/10 §10.7).
 */
export async function countActiveNotes(): Promise<number> {
  const db = getDb();
  const all = await db.notes.toArray();
  return all.filter((n) => n.deleted_at === null && !n.archived && noteKind(n) === "note").length;
}

export async function searchNotes(query: string): Promise<LocalNote[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await listNotes("active");
  return all.filter(
    (n) => n.title.toLowerCase().includes(q) || n.body_text.toLowerCase().includes(q),
  );
}

/** Permanently deletes trashed notes and their attachments. Irreversible. */
export async function emptyTrash(): Promise<number> {
  const db = getDb();
  return db.transaction("rw", db.notes, db.files, async () => {
    const trashed = await db.notes.filter((n) => n.deleted_at !== null).toArray();
    const ids = trashed.map((n) => n.client_id);
    // Attachments must go in the same transaction — orphaned blobs would keep
    // consuming quota with nothing left to reach them.
    await db.files.where("note_id").anyOf(ids).delete();
    await db.notes.bulkDelete(ids);
    return ids.length;
  });
}
