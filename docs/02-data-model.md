# 2. Data model

There are two data models, and only the first one exists today.

## 2.0 v1 — the local model

For free users the browser holds everything, and the schema lives in **[docs/08 §8.2](08-local-storage.md)**
rather than being repeated here. It is deliberately shaped to grow into the server model below without
a migration: notes are keyed by a client-generated `client_id` (UUIDv7) and already carry `rev`,
`_base_rev`, `_dirty`, and `deleted_at` tombstones.

That correspondence is the whole point. When a user upgrades, their notes **upload** under IDs the
server accepts as-is ([docs/08 §8.7](08-local-storage.md)) — no ID remapping, no transform step, no
bespoke import path. The fields cost nothing in v1 and save a genuinely dangerous migration later.

> **Everything from §2.1 onward is Phase 2** — the server model, built only after the gate in
> [docs/07](07-roadmap.md) is passed. It is documented now because v1's local schema is shaped
> against it.

MongoDB. Six collections. Relations are shallow by design — labels are the only many-to-many,
and it is small enough to embed as an ID array on the note.

## 2.1 `users`

```jsonc
{
  "_id": ObjectId,
  "email": "ana@example.com",        // lowercased, unique
  "email_verified_at": ISODate | null,
  "password_hash": "$argon2id$v=19$m=65536,t=3,p=2$...",
  "display_name": "Ana",
  "avatar_color": "lilac",           // pastel token, generated at signup
  "settings": {
    "theme": "system",               // system | light | dark
    "default_note_color": "paper",
    "reminder_default_time": "09:00",
    "timezone": "Asia/Jakarta"       // IANA; required for correct reminder firing
  },
  "status": "active",                // active | suspended | deleted
  "storage_bytes": 0,                // denormalised, maintained on attachment write
  "note_count": 0,                   // denormalised, for the admin list

  "subscription": {
    "tier": "paid",                  // free | paid — free users have no user document at all
    "plan": "annual",                // monthly | annual
    "currency": "IDR",               // ISO 4217, stored beside the amount
    "amount_minor": 15000000,        // minor units: Rp 150,000 → 15000000 (2 dp)
    "provider": "…",                 // chosen at P2.7
    "provider_ref": "…",
    "status": "active",              // active | past_due | canceled | expired
    "current_period_end": ISODate,
    "canceled_at": ISODate | null
  },

  "last_active_at": ISODate,
  "created_at": ISODate,
  "updated_at": ISODate
}
```

**Currency and amount are stored separately, never a converted USD figure** — see
[docs/00 §0.5](00-business-model.md). Prices are set per market as deliberate round numbers
(Rp 150,000, not Rp 147,312), and the global expansion needs no migration to add one.

Amounts are **integer minor units**. Never floats: `0.1 + 0.2 !== 0.3`, and money that is
occasionally wrong by a cent is money that is wrong in a customer's invoice.

Note that a free user has **no document in this collection**. There are no anonymous user rows to
maintain, expire, or count — the free tier is invisible to the server entirely.

`timezone` is not optional. A reminder set for "tomorrow at 9am" is meaningless without it, and
you cannot recover the user's intent later from a UTC instant alone.

`note_count` and `storage_bytes` are denormalised so the admin user list does not run an
aggregation per row. They are maintained with `$inc` in the same operation that creates or
deletes a note, and reconciled nightly by the worker.

**Indexes**

```js
{ email: 1 }                       // unique
{ status: 1, created_at: -1 }      // admin list default sort
{ last_active_at: -1 }             // admin "recently active"
```

## 2.2 `notes`

The important collection. Every field below earns its place in offline sync.

```jsonc
{
  "_id": ObjectId,
  "client_id": "018f3a...",          // UUIDv7, generated on the CLIENT
  "user_id": ObjectId,

  "title": "Groceries",
  "body": { "type": "doc", "content": [ /* Tiptap / ProseMirror JSON */ ] },
  "body_text": "milk oat flour",     // plaintext mirror, derived server-side
  "checklist": [                     // present only for checklist notes
    { "id": "a1", "text": "Milk", "checked": false, "order": 0 }
  ],

  "color": "mint",                   // pastel token, see design system
  "pinned": false,
  "archived": false,
  "labels": [ObjectId],              // max 20, enforced in service

  "reminder": {
    "remind_at": ISODate,            // absolute UTC instant
    "repeat": "none",                // none | daily | weekly | monthly
    "state": "scheduled",            // scheduled | fired | dismissed
    "fired_at": ISODate | null
  },

  "attachments": [
    { "id": "...", "kind": "image", "url": "...", "bytes": 12345, "w": 800, "h": 600 }
  ],

  "rev": 7,                          // server-owned revision counter
  "created_at": ISODate,
  "updated_at": ISODate,
  "deleted_at": ISODate | null       // soft delete = tombstone
}
```

### Why `client_id` exists

The client creates notes offline, before the server has ever seen them. It needs an ID
immediately — for React keys, for local relations, and for retry safety. UUIDv7 is used rather
than v4 because it sorts by creation time, which makes local queries and debugging pleasant.

`client_id` is **unique per user** and is the idempotency key: if a create request is retried
after a flaky connection, the server matches on `(user_id, client_id)` and returns the existing
note instead of duplicating it. This one index removes an entire category of offline bug.

### Why `rev` exists

`rev` is a plain integer, incremented server-side on every accepted write. Clients send the
`base_rev` they edited from; the server accepts the write only if it still matches. That is
optimistic concurrency, and it is what makes conflict detection possible at all. See
[§4](04-sync-protocol.md).

Do not use `updated_at` for this. Clocks are not monotonic, two writes can land in the same
millisecond, and clients lie.

### Why `body_text` exists

Mongo cannot text-index inside arbitrary nested JSON. `body_text` is flattened from the Tiptap
document **on the server** during write — never trusted from the client, because search results
would otherwise be forgeable and, more mundanely, would drift from the real content.

### Why `deleted_at` rather than deleting

A sync client that was offline for a week must be told a note *disappeared*. An absent document
is indistinguishable from one it has not synced yet. Tombstones are kept **30 days**, then hard
deleted by the worker — long enough for any realistic offline window.

**Indexes**

```js
{ user_id: 1, client_id: 1 }                          // unique — idempotency
{ user_id: 1, updated_at: 1, _id: 1 }                 // THE sync cursor index
{ user_id: 1, archived: 1, pinned: -1, updated_at: -1 } // the main grid query
{ user_id: 1, labels: 1, updated_at: -1 }             // label filter
{ "reminder.state": 1, "reminder.remind_at": 1 }      // worker scan; partial:
                                                      //   { reminder.state: "scheduled" }
{ user_id: 1, body_text: "text", title: "text" }      // search
{ deleted_at: 1 }                                     // partial + TTL-ish GC scan
```

The sync cursor index is compound on `(updated_at, _id)` because pagination by timestamp alone
breaks on ties — two notes saved in the same millisecond will cause one to be skipped or
repeated forever. The `_id` tiebreak makes the cursor a total order.

The reminder index is **partial** (`{ "reminder.state": "scheduled" }`) so it only holds rows
the worker actually cares about. A user with 10,000 notes and 3 reminders costs 3 index entries.

## 2.3 `labels`

```jsonc
{
  "_id": ObjectId,
  "user_id": ObjectId,
  "name": "Work",
  "name_lower": "work",              // for case-insensitive uniqueness
  "color": "sky",
  "rev": 2,
  "created_at": ISODate,
  "updated_at": ISODate,
  "deleted_at": ISODate | null
}
```

Labels sync through the same protocol as notes, so they carry `rev` and `deleted_at` too.
Deleting a label does **not** rewrite every note — the note's `labels` array is filtered against
live labels at read time, and the worker cleans up stale references lazily.

**Indexes**: `{ user_id: 1, name_lower: 1 }` unique · `{ user_id: 1, updated_at: 1, _id: 1 }`

## 2.4 `sessions`

Refresh tokens. One document per active device.

```jsonc
{
  "_id": ObjectId,
  "user_id": ObjectId,
  "token_hash": "sha256:...",        // never store the token itself
  "family_id": "018f...",            // rotation family, for reuse detection
  "device": { "ua": "...", "platform": "web", "label": "Chrome on macOS" },
  "expires_at": ISODate,             // TTL index drops it automatically
  "revoked_at": ISODate | null,
  "created_at": ISODate,
  "last_used_at": ISODate
}
```

`family_id` implements refresh-token reuse detection: if a token that was already rotated is
presented again, the whole family is revoked and every device in it is logged out. That is the
standard defence against a stolen refresh token, and it is cheap to add now.

**Indexes**: `{ token_hash: 1 }` unique · `{ user_id: 1 }` · `{ expires_at: 1 }` TTL 0s

## 2.5 `push_subscriptions`

```jsonc
{
  "_id": ObjectId,
  "user_id": ObjectId,
  "endpoint": "https://fcm.googleapis.com/...",   // unique
  "keys": { "p256dh": "...", "auth": "..." },
  "timezone": "Asia/Jakarta",
  "failure_count": 0,
  "created_at": ISODate,
  "last_success_at": ISODate
}
```

Push endpoints go stale constantly — users clear site data, browsers rotate endpoints. On a
`404`/`410` from the push service the subscription is deleted immediately; on other errors
`failure_count` increments and the row is dropped at 5. Without this, a year in, the worker
spends most of its time pushing to the dead.

**Indexes**: `{ endpoint: 1 }` unique · `{ user_id: 1 }`

## 2.6 `admin_users` and `audit_logs`

Admins are a **separate collection**, not a `role` field on `users`. An admin is not a person
with notes; conflating them means every user query must remember to filter by role, and one
forgotten filter is a privilege escalation.

```jsonc
// admin_users
{ "_id": ObjectId, "email": "...", "password_hash": "...", "name": "...",
  "role": "support",                 // support | admin | owner
  "totp_secret": "...",              // 2FA required for admin, not optional
  "status": "active", "last_login_at": ISODate, "created_at": ISODate }

// audit_logs
{ "_id": ObjectId, "admin_id": ObjectId, "action": "user.suspend",
  "target": { "kind": "user", "id": ObjectId },
  "before": { "status": "active" }, "after": { "status": "suspended" },
  "reason": "spam reports",          // required by the API for mutating actions
  "ip": "203.0.113.4", "created_at": ISODate }
```

Every mutating admin endpoint writes an audit row in the same transaction as the change. If the
audit write fails, the change fails. An audit log that can silently be skipped is not one.

**Indexes**: `{ email: 1 }` unique · `{ created_at: -1 }` · `{ admin_id: 1, created_at: -1 }` ·
`{ "target.id": 1, created_at: -1 }`

## 2.7 Index bootstrap

Indexes are created by a numbered migration in `migrations/`, run by `cmd/worker` at boot behind
a lock, never by `EnsureIndex` calls scattered in repositories. You want one place that answers
"what indexes exist in production", and you want adding one to be a reviewable diff.
