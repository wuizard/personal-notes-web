import {getDb} from "@/features/storage/db";
import {META} from "@/features/storage/types";
import type {LocalNote, NoteColor, NoteKind} from "@/features/storage/types";
import {fetchPage} from "./api";
import {parseReminder, type RemoteContent, type RemoteNote} from "./types";

/** Pages are bounded server-side too; this is the request size, not a cap. */
const PAGE_SIZE = 200;

/**
 * A hard stop on one pull, so a server that always reports hasMore cannot
 * spin forever. At this page size it is far more data than the 100-item plan
 * cap allows, so reaching it means something is wrong, not that someone has a
 * lot of notes.
 */
const MAX_PAGES = 50;

export interface PullOutcome {
  /** Notes written, deleted, or deliberately skipped as locally-dirty. */
  received: number;
  skippedDirty: number;
}

export async function readCursor(): Promise<string> {
  const row = await getDb().meta.get(META.syncCursor);
  return typeof row?.value === "string" ? row.value : "";
}

async function writeCursor(cursor: string): Promise<void> {
  await getDb().meta.put({ key: META.syncCursor, value: cursor });
}

/**
 * Drains every page the server has for us, applying each before asking for
 * the next. The cursor is only advanced after a page is fully applied, so an
 * interrupted pull resumes rather than skipping.
 */
export async function pull(): Promise<PullOutcome> {
  const outcome: PullOutcome = { received: 0, skippedDirty: 0 };
  let cursor = await readCursor();

  for (let page = 0; page < MAX_PAGES; page++) {
    const remote = await fetchPage(cursor, PAGE_SIZE);

    for (const note of remote.notes) {
      const applied = await applyRemoteNote(note);
      if (applied) outcome.received++;
      else outcome.skippedDirty++;
    }

    cursor = remote.cursor;
    await writeCursor(cursor);
    if (!remote.hasMore) break;
  }

  return outcome;
}

/**
 * Applies one server note locally. Returns false when the local copy was left
 * alone because it has unsent edits.
 *
 * The rule that matters: a note with local changes is never overwritten, not
 * even by a tombstone. A note deleted on one device and edited on another
 * comes back rather than vanishing — nobody is upset that their note
 * reappeared, and people are very upset when work disappears (docs/04 §4.3).
 * The local edits then push normally, and the server decides.
 *
 * Nor is `_base_rev` advanced for a dirty note. It records the revision those
 * edits were made against, and moving it to the server's newer revision would
 * tell the server the edits already account for changes they have never seen —
 * turning a merge into a silent clobber.
 */
export async function applyRemoteNote(remote: RemoteNote): Promise<boolean> {
  const db = getDb();

  return db.transaction("rw", db.notes, db.files, async () => {
    const local = await db.notes.get(remote.clientId);

    if (local?._dirty) return false;

    if (remote.purged) {
      // Deleted forever elsewhere. Unlike a trash tombstone there is nothing
      // to restore, so the row goes rather than sitting in Trash as an empty
      // shell.
      await db.files.where("note_id").equals(remote.clientId).delete();
      await db.notes.delete(remote.clientId);
      return true;
    }

    await db.notes.put(toLocalNote(remote, local));
    return true;
  });
}

function toLocalNote(remote: RemoteNote, local: LocalNote | undefined): LocalNote {
  const content = parseContent(remote.content);

  return {
    client_id: remote.clientId,
    kind: (remote.kind as NoteKind | null) ?? undefined,
    title: content.title ?? "",
    body: content.body ?? { type: "doc", content: [] },
    body_text: content.body_text ?? "",
    ...(content.checklist ? { checklist: content.checklist } : {}),
    color: ((remote.color as NoteColor | null) ?? "paper") as NoteColor,
    pinned: remote.pinned,
    archived: remote.archived,
    labels: remote.labels ?? [],
    reminder: parseReminder(remote.reminder),
    completed_at: remote.completedAt ? Date.parse(remote.completedAt) : null,
    created_at: Date.parse(remote.createdAt),
    // The server's clock, not this device's — a note edited on a phone with a
    // wrong clock would otherwise sort into the wrong place everywhere.
    updated_at: Date.parse(remote.updatedAt),
    deleted_at: remote.deletedAt ? Date.parse(remote.deletedAt) : null,
    rev: remote.rev,
    _base_rev: remote.rev,
    _dirty: 0,
    _dirty_fields: [],
    // A conflicted copy is a purely local artefact; the server has never
    // heard of it. Preserve the marker if this row happens to be one.
    ...(local?.conflict_of ? { conflict_of: local.conflict_of } : {}),
  };
}

function parseContent(raw: string): Partial<RemoteContent> {
  try {
    return JSON.parse(raw) as RemoteContent;
  } catch {
    // Better an empty note than a sync that can never complete: the row is
    // replaced on its next edit anywhere, and refusing the whole page would
    // wedge every other note behind it.
    return {};
  }
}
