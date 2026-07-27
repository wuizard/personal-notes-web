import {uuidv7} from "uuidv7";
import {getDb} from "@/features/storage/db";
import {markHadNotes} from "@/features/storage/persistence";
import type {ChecklistItem, LocalNote, NoteColor, NoteDoc, NoteKind} from "@/features/storage/types";
import {buildBodyText} from "../model/body-text";
import {checklistToDoc, docToChecklist, isChecklistComplete, noteKind} from "../model/convert";
import {currentTimezone, nextOccurrence, type ReminderSpec} from "../model/reminder";

/**
 * The only module that reads or writes notes.
 *
 * Components never touch Dexie directly (docs/01 §1.5). When Phase 2 adds a
 * server, this file changes and nothing above it learns that a network exists.
 */

export type NoteFilter = "active" | "archived" | "trash" | "completed";

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
  Pick<
    LocalNote,
    "title" | "body" | "color" | "pinned" | "archived" | "checklist" | "reminder" | "completed_at"
  >
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

    // A note marked complete stops being complete the instant any item is
    // unchecked — enforced here, not per-caller, so it can never be forgotten
    // (docs/10 §10.13a). The UI reacts to the drop by watching completed_at.
    if (patch.checklist !== undefined && next.completed_at && !isChecklistComplete(next.checklist ?? [])) {
      next.completed_at = null;
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

/**
 * Settles a fully-checked checklist into (or out of) the Completed section —
 * docs/10 §10.13a, Premium. The caller (NoteEditor) decides whether this may
 * happen at all — plan tier and the auto-complete setting — this function
 * just writes the timestamp.
 */
export async function setCompleted(clientId: string, completed: boolean): Promise<void> {
  return updateNote(clientId, { completed_at: completed ? now() : null });
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
    if (filter === "archived") return n.archived;
    if (n.archived) return false;
    // Completed is its own view, carved out of "active" — docs/10 §10.13a.
    // An archived checklist stays in Archive rather than Completed; the
    // check above already sent it there.
    if (filter === "completed") return Boolean(n.completed_at);
    return !n.completed_at;
  });

  return visible.sort((a, b) => {
    if (filter === "active" && a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at - a.updated_at;
  });
}

/**
 * The combined free/paid item cap — notes and checklists together, docs/10
 * §10.13b (amends §10.7: checklists were originally uncapped, but the
 * product decision is now a single combined limit for the free tier).
 * Archived and trashed items don't count — archiving is decluttering, not
 * deletion, and must stay a legitimate way to make room (docs/00 §0.6:
 * capping creation is acceptable, holding existing data hostage is not).
 */
export const FREE_ITEM_CAP = 5;
export const PREMIUM_ITEM_CAP = 100;

/** Counts toward the tier cap: live, non-archived notes AND checklists. */
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

/** Sets (or replaces) a note's recurring reminder — docs/10 §10.4. */
export async function setReminder(clientId: string, spec: ReminderSpec): Promise<void> {
  return updateNote(clientId, {
    reminder: {
      remind_at: nextOccurrence(spec),
      repeat: spec.repeat,
      state: "scheduled",
      fired_at: null,
      time: spec.time,
      weekday: spec.repeat === "weekly" ? spec.weekday ?? new Date().getDay() : undefined,
      tz: currentTimezone(),
    },
  });
}

export async function clearReminder(clientId: string): Promise<void> {
  return updateNote(clientId, { reminder: null });
}

/**
 * "Done for today" on a due reminder: rolls remind_at to the next occurrence.
 * Legacy one-shot reminders (repeat "none"/"monthly", pre-docs/10) are
 * dismissed outright since there is no wall-clock spec to roll forward.
 */
export async function dismissReminderOccurrence(clientId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.notes, async () => {
    const note = await db.notes.get(clientId);
    const r = note?.reminder;
    if (!note || !r) return;

    const reminder =
      r.repeat === "daily" || r.repeat === "weekly"
        ? {
            ...r,
            remind_at: nextOccurrence({ repeat: r.repeat, time: r.time, weekday: r.weekday }),
            state: "scheduled" as const,
            fired_at: now(),
          }
        : { ...r, state: "dismissed" as const, fired_at: now() };

    await db.notes.put({ ...note, reminder, updated_at: now(), _dirty: 1 });
  });
}

/** Marks the current occurrence as notified WITHOUT rolling it forward. */
export async function markReminderNotified(clientId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.notes, async () => {
    const note = await db.notes.get(clientId);
    if (!note?.reminder) return;
    await db.notes.put({ ...note, reminder: { ...note.reminder, fired_at: now() } });
  });
}

/** Live notes (not trashed) that carry a reminder, soonest occurrence first. */
export async function listReminderNotes(): Promise<LocalNote[]> {
  const db = getDb();
  const all = await db.notes.toArray();
  return all
    .filter((n) => n.deleted_at === null && n.reminder !== null)
    .sort((a, b) => (a.reminder?.remind_at ?? 0) - (b.reminder?.remind_at ?? 0));
}

/** Trash retention — docs/10 §10.8. After this, purge is automatic. */
export const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Whole days before a trashed note is purged. Never negative. */
export function trashDaysLeft(deletedAt: number, at = Date.now()): number {
  return Math.max(0, Math.ceil((deletedAt + TRASH_RETENTION_MS - at) / (24 * 60 * 60 * 1000)));
}

/**
 * Deletes trashed notes past retention, with their attachments. Runs
 * opportunistically on app open (docs/10 §10.8) — with no server, opening the
 * app is the only moment local code is guaranteed to execute.
 */
export async function purgeExpiredTrash(): Promise<number> {
  const db = getDb();
  const cutoff = now() - TRASH_RETENTION_MS;
  return db.transaction("rw", db.notes, db.files, async () => {
    const expired = await db.notes
      .filter((n) => n.deleted_at !== null && n.deleted_at < cutoff)
      .toArray();
    if (!expired.length) return 0;
    const ids = expired.map((n) => n.client_id);
    await db.files.where("note_id").anyOf(ids).delete();
    await db.notes.bulkDelete(ids);
    return ids.length;
  });
}

/**
 * Permanently deletes ONE trashed note, now. Irreversible — the UI must
 * confirm first (docs/10 §10.8: a snackbar-undo is wrong for an action that
 * cannot be undone).
 */
export async function deleteForever(clientId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.notes, db.files, async () => {
    await db.files.where("note_id").equals(clientId).delete();
    await db.notes.delete(clientId);
  });
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
