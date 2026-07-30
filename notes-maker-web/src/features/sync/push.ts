import {uuidv7} from "uuidv7";
import {getDb} from "@/features/storage/db";
import {clearPurges, readPendingPurges} from "@/features/storage/purge-queue";
import {META, type LocalNote, type SyncRejection} from "@/features/storage/types";
import {sendMutations} from "./api";
import {ALL_SYNC_FIELDS, type RemoteContent, type WireMutation, type WireResult} from "./types";

/** Matches the server's own cap (docs/04 §4.4). */
const MAX_BATCH = 100;

export interface PushOutcome {
  applied: number;
  conflicted: number;
  rejected: number;
  /** Dirty rows left over for the next round, because the batch was full. */
  remaining: number;
}

/** How a conflicted copy gets its title. Supplied by the caller so this
 *  module needs no locale machinery. */
export type ConflictLabel = (title: string, at: number) => string;

/** What was sent, so each result can be matched back by `seq`. */
type Sent =
  | { kind: "note"; clientId: string; updatedAt: number }
  | { kind: "purge"; clientId: string };

export async function countDirty(): Promise<number> {
  const db = getDb();
  const dirty = await db.notes.where("_dirty").equals(1).count();
  const purges = await readPendingPurges();
  return dirty + purges.length;
}

export async function push(conflictLabel: ConflictLabel): Promise<PushOutcome> {
  const db = getDb();

  // Purges go first. They are cheap, and letting a full batch of edits starve
  // them would leave notes the user destroyed alive on other devices.
  const purges = (await readPendingPurges()).slice(0, MAX_BATCH);
  const dirty = await db.notes
    .where("_dirty")
    .equals(1)
    .limit(MAX_BATCH - purges.length)
    .toArray();

  const totalDirty = await countDirty();
  if (!purges.length && !dirty.length) {
    return { applied: 0, conflicted: 0, rejected: 0, remaining: 0 };
  }

  const sent: Sent[] = [];
  const mutations: WireMutation[] = [];

  for (const clientId of purges) {
    mutations.push({
      seq: sent.length,
      clientId,
      baseRev: 0,
      changedFields: [],
      purged: true,
    });
    sent.push({ kind: "purge", clientId });
  }

  for (const note of dirty) {
    mutations.push(toMutation(note, sent.length));
    sent.push({ kind: "note", clientId: note.client_id, updatedAt: note.updated_at });
  }

  const results = await sendMutations(mutations);

  const outcome: PushOutcome = {
    applied: 0,
    conflicted: 0,
    rejected: 0,
    remaining: Math.max(0, totalDirty - sent.length),
  };

  for (const result of results) {
    const entry = sent[result.seq];
    if (!entry) continue;

    if (entry.kind === "purge") {
      // Any terminal answer settles a purge. Even a rejection means the
      // server will not be told again, and the note is already gone here.
      await clearPurges([entry.clientId]);
      if (result.status === "APPLIED") outcome.applied++;
      else outcome.rejected++;
      continue;
    }

    switch (result.status) {
      case "APPLIED":
        await settleApplied(entry, result);
        outcome.applied++;
        break;
      case "CONFLICT":
        await forkConflict(entry, result, conflictLabel);
        outcome.conflicted++;
        break;
      case "REJECTED":
        await settleRejected(entry, result);
        outcome.rejected++;
        break;
    }
  }

  return outcome;
}

function toMutation(note: LocalNote, seq: number): WireMutation {
  const content: RemoteContent = {
    title: note.title,
    body: note.body,
    body_text: note.body_text,
    ...(note.checklist ? { checklist: note.checklist } : {}),
  };

  // base_rev 0 means the server has never seen this note, so "what changed"
  // is everything. An empty or missing list is treated the same way: it can
  // only cost an unnecessary conflict, where guessing too narrow would lose
  // an edit outright.
  const changedFields =
    note._base_rev === 0 || !note._dirty_fields?.length
      ? [...ALL_SYNC_FIELDS]
      : note._dirty_fields;

  return {
    seq,
    clientId: note.client_id,
    baseRev: note._base_rev,
    changedFields,
    deleted: note.deleted_at !== null,
    content: JSON.stringify(content),
    kind: note.kind ?? "note",
    color: note.color,
    pinned: note.pinned,
    archived: note.archived,
    labels: note.labels,
    reminder: note.reminder ? JSON.stringify(note.reminder) : null,
    completedAt: note.completed_at ? new Date(note.completed_at).toISOString() : null,
    createdAt: new Date(note.created_at).toISOString(),
  };
}

/**
 * The server accepted the mutation. Adopt its canonical revision — it may
 * carry another device's merged-in edits.
 *
 * If the note changed again while the request was in flight it stays dirty:
 * clearing the flag would strand an edit the server has never seen. Its
 * base_rev still advances, because the accepted revision does include what we
 * sent, so the next push merges cleanly instead of conflicting with itself.
 */
async function settleApplied(entry: Sent & { kind: "note" }, result: WireResult): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.notes, async () => {
    const local = await db.notes.get(entry.clientId);
    if (!local || !result.note) return;

    const editedMidFlight = local.updated_at !== entry.updatedAt;

    await db.notes.put({
      ...local,
      rev: result.note.rev,
      _base_rev: result.note.rev,
      _dirty: editedMidFlight ? 1 : 0,
      _dirty_fields: editedMidFlight ? local._dirty_fields : [],
    });
  });
}

/**
 * Both sides edited the same content. The server's version wins the note's
 * identity and the local version is kept as a separate, clearly-labelled copy
 * (docs/04 §4.5 rule 3). A duplicate note is a mild annoyance; lost writing is
 * the kind of thing that makes someone quit an app permanently.
 *
 * Attachments are not copied onto the fork — they are keyed by note id and do
 * not sync at all yet (P2.5), so duplicating the blobs would consume quota for
 * something the server has never heard of. The original keeps them.
 */
async function forkConflict(
  entry: Sent & { kind: "note" },
  result: WireResult,
  conflictLabel: ConflictLabel,
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.notes, async () => {
    const local = await db.notes.get(entry.clientId);
    if (!local || !result.note) return;

    const at = Date.now();
    const copy: LocalNote = {
      ...local,
      client_id: uuidv7(),
      title: conflictLabel(local.title, at),
      conflict_of: local.client_id,
      created_at: at,
      updated_at: at,
      // The copy is new to the server, so it uploads as an ordinary create.
      rev: 0,
      _base_rev: 0,
      _dirty: 1,
      _dirty_fields: [...ALL_SYNC_FIELDS],
    };
    await db.notes.add(copy);

    const server = result.note;
    const content = safeParse(server.content);
    await db.notes.put({
      ...local,
      title: content.title ?? "",
      body: content.body ?? { type: "doc", content: [] },
      body_text: content.body_text ?? "",
      ...(content.checklist ? { checklist: content.checklist } : {}),
      updated_at: Date.parse(server.updatedAt),
      rev: server.rev,
      _base_rev: server.rev,
      _dirty: 0,
      _dirty_fields: [],
    });
  });
}

/**
 * The server refused the mutation outright — over the plan's item cap, or
 * malformed. Retrying sends the identical request, so the flag is cleared and
 * the reason surfaced in Settings → Sync instead of the note retrying forever
 * (docs/04 §4.4, §4.6). The note itself is untouched and still on the device.
 */
async function settleRejected(entry: Sent & { kind: "note" }, result: WireResult): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.notes, db.meta, async () => {
    const local = await db.notes.get(entry.clientId);
    if (local) {
      await db.notes.put({ ...local, _dirty: 0, _dirty_fields: [] });
    }

    const row = await db.meta.get(META.syncRejections);
    const existing = Array.isArray(row?.value) ? (row.value as SyncRejection[]) : [];
    const next = [
      ...existing.filter((r) => r.client_id !== entry.clientId),
      { client_id: entry.clientId, reason: result.reason ?? "rejected", at: Date.now() },
    ];
    await db.meta.put({ key: META.syncRejections, value: next.slice(-50) });
  });
}

function safeParse(raw: string): Partial<RemoteContent> {
  try {
    return JSON.parse(raw) as RemoteContent;
  } catch {
    return {};
  }
}

export async function readRejections(): Promise<SyncRejection[]> {
  const row = await getDb().meta.get(META.syncRejections);
  return Array.isArray(row?.value) ? (row.value as SyncRejection[]) : [];
}

export async function clearRejections(): Promise<void> {
  await getDb().meta.put({ key: META.syncRejections, value: [] });
}
