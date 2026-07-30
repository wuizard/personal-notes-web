import {beforeEach, describe, expect, it, vi} from "vitest";
import {getDb} from "@/features/storage/db";
import {readPendingPurges, recordPurges} from "@/features/storage/purge-queue";
import {META, type LocalNote} from "@/features/storage/types";
import {pull, readCursor} from "./pull";
import {push, readRejections} from "./push";
import type {RemoteNote, WireMutation, WireResult} from "./types";

/**
 * The sync engine is the one part of the client where tests pay for
 * themselves immediately (docs/04 §4.8). Everything here is about not losing
 * someone's writing: a note edited on two devices, a note deleted on one and
 * edited on the other, a push whose response never arrived.
 */

const { fetchPage, sendMutations } = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  sendMutations: vi.fn(),
}));

vi.mock("./api", () => ({ fetchPage, sendMutations }));

const TS = 1_700_000_000_000;

function localNote(over: Partial<LocalNote> = {}): LocalNote {
  return {
    client_id: "note-1",
    kind: "note",
    title: "Groceries",
    body: { type: "doc", content: [] },
    body_text: "Groceries",
    color: "mint",
    pinned: false,
    archived: false,
    labels: [],
    reminder: null,
    created_at: TS,
    updated_at: TS,
    deleted_at: null,
    rev: 0,
    _base_rev: 0,
    _dirty: 0,
    ...over,
  };
}

function remoteNote(over: Partial<RemoteNote> = {}): RemoteNote {
  return {
    clientId: "note-1",
    content: JSON.stringify({ title: "Groceries", body_text: "Groceries" }),
    kind: "note",
    color: "mint",
    pinned: false,
    archived: false,
    labels: [],
    reminder: null,
    completedAt: null,
    createdAt: new Date(TS).toISOString(),
    updatedAt: new Date(TS + 1000).toISOString(),
    deletedAt: null,
    purged: false,
    rev: 3,
    ...over,
  };
}

function page(notes: RemoteNote[], over: { cursor?: string; hasMore?: boolean } = {}) {
  return {
    notes,
    cursor: over.cursor ?? "cursor-1",
    hasMore: over.hasMore ?? false,
    serverTime: new Date(TS).toISOString(),
  };
}

const label = (title: string, at: number) => `${title} (conflicted copy — ${at})`;

beforeEach(async () => {
  const db = getDb();
  await db.notes.clear();
  await db.files.clear();
  await db.meta.clear();
  fetchPage.mockReset();
  sendMutations.mockReset();
});

describe("pull", () => {
  it("writes a note the device has never seen", async () => {
    fetchPage.mockResolvedValueOnce(page([remoteNote()]));

    const outcome = await pull();

    expect(outcome.received).toBe(1);
    const stored = await getDb().notes.get("note-1");
    expect(stored?.title).toBe("Groceries");
    expect(stored?._dirty).toBe(0);
    expect(stored?._base_rev).toBe(3);
  });

  it("stores the cursor so the next pull resumes rather than restarting", async () => {
    fetchPage.mockResolvedValueOnce(page([remoteNote()], { cursor: "cursor-abc" }));

    await pull();

    expect(await readCursor()).toBe("cursor-abc");
  });

  it("pages until the server says there is no more", async () => {
    fetchPage
      .mockResolvedValueOnce(page([remoteNote({ clientId: "a" })], { cursor: "c1", hasMore: true }))
      .mockResolvedValueOnce(page([remoteNote({ clientId: "b" })], { cursor: "c2" }));

    const outcome = await pull();

    expect(outcome.received).toBe(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, "", expect.any(Number));
    expect(fetchPage).toHaveBeenNthCalledWith(2, "c1", expect.any(Number));
    expect(await getDb().notes.count()).toBe(2);
  });

  // The rule that stops sync eating someone's work.
  it("never overwrites a note with unsent local edits", async () => {
    await getDb().notes.put(
      localNote({ title: "My unsent edit", _dirty: 1, _base_rev: 1, _dirty_fields: ["title"] }),
    );
    fetchPage.mockResolvedValueOnce(page([remoteNote({ rev: 9 })]));

    const outcome = await pull();

    expect(outcome.skippedDirty).toBe(1);
    const stored = await getDb().notes.get("note-1");
    expect(stored?.title).toBe("My unsent edit");
    // base_rev must NOT advance: it records what the edits were made against,
    // and moving it would tell the server they already account for changes
    // this device has never seen.
    expect(stored?._base_rev).toBe(1);
  });

  // docs/04 §4.3: nobody is upset that their note came back.
  it("resurrects a locally-edited note that was deleted elsewhere", async () => {
    await getDb().notes.put(localNote({ _dirty: 1, _base_rev: 1 }));
    fetchPage.mockResolvedValueOnce(
      page([remoteNote({ deletedAt: new Date(TS).toISOString(), rev: 5 })]),
    );

    await pull();

    const stored = await getDb().notes.get("note-1");
    expect(stored).toBeDefined();
    expect(stored?.deleted_at).toBeNull();
  });

  it("moves a clean note to trash when it was trashed elsewhere", async () => {
    await getDb().notes.put(localNote({ _dirty: 0 }));
    fetchPage.mockResolvedValueOnce(
      page([remoteNote({ deletedAt: new Date(TS).toISOString(), rev: 5 })]),
    );

    await pull();

    const stored = await getDb().notes.get("note-1");
    // Still present, so Trash on this device matches Trash on the other —
    // and it can still be restored.
    expect(stored?.deleted_at).not.toBeNull();
  });

  it("removes the row outright when a note was deleted forever elsewhere", async () => {
    const db = getDb();
    await db.notes.put(localNote());
    await db.files.put({
      id: "f1",
      note_id: "note-1",
      kind: "image",
      name: "a.webp",
      mime: "image/webp",
      blob: new Blob([new Uint8Array([1])]),
      bytes: 1,
      created_at: TS,
    });
    fetchPage.mockResolvedValueOnce(
      page([remoteNote({ deletedAt: new Date(TS).toISOString(), purged: true })]),
    );

    await pull();

    expect(await db.notes.get("note-1")).toBeUndefined();
    // Attachments go with it, or they occupy quota with nothing left to
    // reach them.
    expect(await db.files.where("note_id").equals("note-1").count()).toBe(0);
  });

  it("takes the server's updated_at, not this device's clock", async () => {
    fetchPage.mockResolvedValueOnce(page([remoteNote({ updatedAt: new Date(TS + 5000).toISOString() })]));

    await pull();

    expect((await getDb().notes.get("note-1"))?.updated_at).toBe(TS + 5000);
  });
});

describe("push", () => {
  it("sends only the fields this device changed", async () => {
    await getDb().notes.put(
      localNote({ _dirty: 1, _base_rev: 4, _dirty_fields: ["color", "pinned"] }),
    );
    sendMutations.mockResolvedValueOnce([
      { seq: 0, status: "APPLIED", reason: null, note: remoteNote({ rev: 5 }) },
    ]);

    await push(label);

    const sent = sendMutations.mock.calls[0][0] as WireMutation[];
    expect(sent[0].changedFields).toEqual(["color", "pinned"]);
    expect(sent[0].baseRev).toBe(4);
  });

  it("sends every field for a note the server has never seen", async () => {
    await getDb().notes.put(localNote({ _dirty: 1, _base_rev: 0, _dirty_fields: ["title"] }));
    sendMutations.mockResolvedValueOnce([
      { seq: 0, status: "APPLIED", reason: null, note: remoteNote({ rev: 1 }) },
    ]);

    await push(label);

    const sent = sendMutations.mock.calls[0][0] as WireMutation[];
    expect(sent[0].changedFields).toContain("title");
    expect(sent[0].changedFields).toContain("color");
    expect(sent[0].changedFields.length).toBeGreaterThan(5);
  });

  it("clears the dirty flag and adopts the server revision once accepted", async () => {
    await getDb().notes.put(localNote({ _dirty: 1, _base_rev: 1, _dirty_fields: ["title"] }));
    sendMutations.mockResolvedValueOnce([
      { seq: 0, status: "APPLIED", reason: null, note: remoteNote({ rev: 7 }) },
    ]);

    const outcome = await push(label);

    expect(outcome.applied).toBe(1);
    const stored = await getDb().notes.get("note-1");
    expect(stored?._dirty).toBe(0);
    expect(stored?._base_rev).toBe(7);
    expect(stored?._dirty_fields).toEqual([]);
  });

  // A save landing while the request is in flight must not be swallowed by
  // the response that predates it.
  it("keeps a note dirty when it was edited again mid-flight", async () => {
    const db = getDb();
    await db.notes.put(localNote({ _dirty: 1, _base_rev: 1, _dirty_fields: ["title"] }));

    sendMutations.mockImplementationOnce(async (): Promise<WireResult[]> => {
      const current = await db.notes.get("note-1");
      await db.notes.put({ ...current!, title: "typed while in flight", updated_at: TS + 999 });
      return [{ seq: 0, status: "APPLIED", reason: null, note: remoteNote({ rev: 7 }) }];
    });

    await push(label);

    const stored = await db.notes.get("note-1");
    expect(stored?.title).toBe("typed while in flight");
    expect(stored?._dirty).toBe(1);
    // base_rev still advances: the accepted revision does include what was
    // sent, so the next push merges cleanly instead of conflicting with
    // this device's own earlier edit.
    expect(stored?._base_rev).toBe(7);
  });

  // docs/04 §4.5 rule 3. A duplicate note is a mild annoyance; lost writing
  // makes people quit an app permanently.
  it("keeps the local version as a conflicted copy and takes the server's", async () => {
    const db = getDb();
    await db.notes.put(
      localNote({ title: "Mine", _dirty: 1, _base_rev: 1, _dirty_fields: ["title"] }),
    );
    sendMutations.mockResolvedValueOnce([
      {
        seq: 0,
        status: "CONFLICT",
        reason: null,
        note: remoteNote({
          rev: 9,
          content: JSON.stringify({ title: "Theirs", body_text: "Theirs" }),
        }),
      },
    ]);

    const outcome = await push(label);

    expect(outcome.conflicted).toBe(1);

    const original = await db.notes.get("note-1");
    expect(original?.title).toBe("Theirs");
    expect(original?._dirty).toBe(0);
    expect(original?._base_rev).toBe(9);

    const copies = await db.notes.filter((n) => n.conflict_of === "note-1").toArray();
    expect(copies).toHaveLength(1);
    expect(copies[0].title).toContain("Mine");
    expect(copies[0].title).toContain("conflicted copy");
    // The copy is new to the server and uploads as an ordinary create.
    expect(copies[0]._dirty).toBe(1);
    expect(copies[0]._base_rev).toBe(0);
    expect(copies[0].client_id).not.toBe("note-1");
  });

  it("stops retrying a refused mutation and records why", async () => {
    await getDb().notes.put(localNote({ _dirty: 1, _base_rev: 0 }));
    sendMutations.mockResolvedValueOnce([
      { seq: 0, status: "REJECTED", reason: "note cap of 100 reached", note: null },
    ]);

    const outcome = await push(label);

    expect(outcome.rejected).toBe(1);
    // Cleared, or it would retry forever against a server that will keep
    // refusing it identically.
    expect((await getDb().notes.get("note-1"))?._dirty).toBe(0);
    // The note itself is untouched and still on the device.
    expect(await getDb().notes.get("note-1")).toBeDefined();

    const rejections = await readRejections();
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toBe("note cap of 100 reached");
  });

  it("tells the server about notes deleted forever here", async () => {
    await recordPurges(["gone-1"]);
    sendMutations.mockResolvedValueOnce([
      { seq: 0, status: "APPLIED", reason: null, note: null },
    ]);

    await push(label);

    const sent = sendMutations.mock.calls[0][0] as WireMutation[];
    expect(sent[0]).toMatchObject({ clientId: "gone-1", purged: true });
    // Drained, so it is not re-sent on every subsequent sync.
    expect(await readPendingPurges()).toEqual([]);
  });

  it("does nothing when there is nothing to send", async () => {
    await getDb().notes.put(localNote({ _dirty: 0 }));

    const outcome = await push(label);

    expect(sendMutations).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ applied: 0, conflicted: 0, rejected: 0 });
  });

  it("reports a remainder when there is more queued than one batch holds", async () => {
    const db = getDb();
    for (let i = 0; i < 105; i++) {
      await db.notes.put(localNote({ client_id: `n-${i}`, _dirty: 1, _base_rev: 0 }));
    }
    sendMutations.mockImplementationOnce(async (mutations: WireMutation[]) =>
      mutations.map((m) => ({
        seq: m.seq,
        status: "APPLIED" as const,
        reason: null,
        note: remoteNote({ clientId: m.clientId, rev: 1 }),
      })),
    );

    const outcome = await push(label);

    expect(sendMutations.mock.calls[0][0]).toHaveLength(100);
    expect(outcome.remaining).toBe(5);
  });
});

describe("meta", () => {
  it("keeps the cursor and rejections in the meta store", async () => {
    fetchPage.mockResolvedValueOnce(page([], { cursor: "c9" }));
    await pull();
    expect((await getDb().meta.get(META.syncCursor))?.value).toBe("c9");
  });
});
