# 4. Sync protocol

> **Phase 2, paid tier only.** Free users are single-device by definition, so there is nothing to
> sync — which is exactly why v1 needs no server. Built at P2.4, after the gate in
> [docs/07](07-roadmap.md).
>
> v1 already ships the client half of the foundation: `client_id`, `rev`, `_base_rev`, `_dirty`, and
> tombstones are in the local schema from day one ([docs/08 §8.2](08-local-storage.md)). A user's
> first sync after subscribing is therefore an ordinary outbox drain with `base_rev: 0` on every
> note, not a special migration path ([docs/08 §8.7](08-local-storage.md)).

This is the hardest part of the app. Everything else is CRUD. Build it on top of a working
local-only app, and do not improvise it.

## 4.1 The model

The client's IndexedDB is the **source of truth for the UI**. Nothing rendered on screen ever
waits on the network. The server is the source of truth for *convergence* — it arbitrates when
two devices disagree.

Every write follows the same path:

```
user edits  →  write to IndexedDB  →  UI re-renders (instant)
                      ↓
              append to outbox
                      ↓
            sync engine drains outbox  →  POST /sync
                      ↓
            apply server response  →  update IndexedDB  →  UI re-renders
```

## 4.2 Local schema (Dexie)

> The authoritative schema is **[docs/08 §8.2](08-local-storage.md)** — v1 already ships `notes`,
> `images`, and `meta`. Phase 2 *adds* the two stores below; it does not redefine the existing ones.
> Keep this section in sync with docs/08 rather than treating it as a second source of truth.

```ts
// added in Phase 2
outbox:     '++seq, client_id, kind, attempts'
labels:     'client_id, updated_at, deleted_at, _dirty'   // labels ship in P2 alongside search
// existing from v1 (docs/08 §8.2)
notes:      'client_id, updated_at, [archived+pinned], deleted_at, _dirty'
meta:       'key'          // sync cursor, last sync time, schema version
```

Local records carry three extra fields the server never sees:

- `_dirty` — has unsynced local changes
- `_base_rev` — the `rev` this device last saw from the server
- `_pending` — the mutation is in flight (used to suppress double-sends, not for UI)

## 4.3 Pull: `GET /sync?cursor=&limit=200`

```jsonc
{
  "changes": {
    "notes":  [ /* full note documents, including tombstones */ ],
    "labels": [ /* ... */ ]
  },
  "cursor": "eyJ0IjoxNzUzMTQ...",
  "has_more": true,
  "server_time": "2026-07-22T09:14:02.113Z"
}
```

The cursor is opaque base64 of `{ updated_at, _id }` — the compound key from the sync index. The
client loops until `has_more` is false, then stores the cursor in `meta`.

Two rules that prevent the classic bugs:

- **Never build a cursor from the client's clock.** It is wrong, sometimes by hours.
- **Never use a bare timestamp cursor.** Notes written in the same millisecond will be silently
  skipped. The `_id` tiebreak is what makes the ordering total.

Tombstones arrive as normal documents with `deleted_at` set. The client deletes the local row
*unless* it is `_dirty` — a local edit to a note that was deleted on another device becomes a
resurrection, which is the friendlier default (nobody is upset that their note came back; people
are very upset when work vanishes).

An empty cursor means a full bootstrap. On a fresh device this pulls everything, paged.

## 4.4 Push: `POST /sync`

```jsonc
{
  "mutations": [
    { "seq": 41, "kind": "note.upsert", "client_id": "018f...", "base_rev": 7,
      "patch": { "title": "Groceries", "color": "mint" } },
    { "seq": 42, "kind": "note.delete", "client_id": "018f...", "base_rev": 8 },
    { "seq": 43, "kind": "label.upsert", "client_id": "018f...", "base_rev": 0,
      "patch": { "name": "Work", "color": "sky" } }
  ]
}
```

Response, per mutation, in order:

```jsonc
{
  "results": [
    { "seq": 41, "status": "applied",  "note": { /* canonical, rev: 8 */ } },
    { "seq": 42, "status": "applied",  "note": { /* tombstone */ } },
    { "seq": 43, "status": "conflict", "note": { /* server version, rev: 5 */ } }
  ],
  "server_time": "..."
}
```

Statuses: `applied` · `conflict` (base_rev stale) · `rejected` (validation failed — the client
must drop the mutation, never retry it) · `deferred` (server busy; retry with backoff).

`base_rev: 0` means "this is a create". The server upserts on `(user_id, client_id)`, so a
retried create is idempotent rather than duplicating.

Batches are capped at 100 mutations. The server applies them **in order** and does not stop at
the first conflict — later mutations may well apply cleanly.

## 4.5 Conflict resolution

Conflicts are rare but they are not theoretical: two phones, one offline, editing the same note.

The rules, in order:

1. **Disjoint fields merge automatically.** Device A changed `color`, device B changed `title`
   → both apply. The server compares the incoming patch's keys against what changed between
   `base_rev` and current. This resolves the large majority of real conflicts silently, and it
   is worth the ~40 lines it costs.

2. **Metadata loses to content.** If one side changed only `pinned`/`archived`/`color`/`labels`
   and the other changed `title`/`body`, the content edit wins and the metadata edit is
   reapplied on top.

3. **Both changed content → the server wins, and the client keeps a copy.** The local version is
   saved as a new note titled `"Groceries (conflicted copy — 22 Jul, 16:04)"`, linked to the
   original via `conflict_of`. The user is shown a quiet, dismissible inline banner on the note —
   not a modal, and never a merge UI.

Never silently discard a user's typing. A duplicate note is a mild annoyance; lost writing is
the kind of thing that makes someone quit an app permanently and tell their friends.

Checklists get one special case: item-level merge by item `id`, union of both sides, with
`checked` resolved last-write-wins per item. Two people ticking off different groceries should
never produce a conflicted copy.

## 4.6 Scheduling

The engine runs on:

- app start, after hydrating from IndexedDB
- `online` event
- `visibilitychange` → visible, if the last sync is older than 30 s
- every 60 s while the tab is focused
- 2 s (debounced) after the outbox becomes non-empty
- Background Sync API registration, so queued writes flush even if the tab was closed

Backoff on failure: 1s, 2s, 4s, 8s, 16s, 30s, then every 30s, with jitter. A `429` honours
`Retry-After`. A mutation that has failed 10 times with a `rejected` status is moved to a dead
letter table and surfaced in Settings → Sync, rather than retried forever.

**Never sync in a `setInterval` that runs while the tab is hidden.** On mobile that is a battery
complaint and, eventually, an app-store review.

## 4.7 What the user sees

Sync should be almost invisible. The entire surface is:

- A small status pill in the sidebar: `Synced` / `Syncing…` / `Offline — 3 changes queued`
- An offline banner when the connection drops, with the queued count
- The conflicted-copy inline banner described above
- Settings → Sync: last synced, queued count, dead letters, a "Sync now" button, and a
  "Reset local data" escape hatch that clears IndexedDB and re-bootstraps

No spinners on note cards. No blocking saves. No "are you sure, you have unsaved changes" —
there is no such state, because saving is local and instant.

## 4.8 Testing this

The sync engine is the one part of the app where tests pay for themselves immediately. As a
minimum, before Milestone 3 is called done:

- two simulated clients, offline edits to disjoint fields → both land, no conflict
- two clients, same field → conflicted copy created exactly once
- create while offline, retried three times → exactly one note server-side
- delete on A while B edits offline → B's note resurrects with B's content
- 10,000-note bootstrap pages correctly and the cursor never repeats or skips
- clock skew of ±2 hours on the client changes nothing

Write these against the real Go API in a Docker Mongo, not against mocks. Sync bugs live
precisely in the seams that mocks paper over.
