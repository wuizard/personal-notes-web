# 3. API contract

> **Phase 2.** None of this exists in v1 — the free tier has no server ([docs/01 §1.0](01-architecture.md)).
> This contract is built after the gate in [docs/07](07-roadmap.md), and it serves paying users only.
> The design below is unchanged by the local-first pivot; it simply arrives later.
>
> One addition to plan for at P2.7: billing and entitlement endpoints (`GET /me/subscription`,
> checkout session creation, and the provider webhook that is the actual source of truth for
> subscription state). Webhooks must be idempotent — providers retry, and double-crediting a
> subscription is a support problem you cannot detect from the outside.

Two services, two prefixes, two signing keys, two audiences.

- User API — `https://api.notesmaker.app/api/v1` — JWT `aud: "user"`
- Admin API — private network — `/admin/v1` — JWT `aud: "admin"`

A token minted for one audience is rejected by the other. This is verified in middleware, not in
handlers, and it has a test.

## 3.1 Conventions

**Envelope.** Success returns the resource directly; errors always return the same shape:

```jsonc
{ "error": { "code": "note_conflict", "message": "Note was modified elsewhere",
             "details": { "server_rev": 9 } } }
```

`code` is a stable machine string. `message` is for developers, never rendered to users — the
frontend maps `code` to copy it controls, which is how you get good error UX and i18n for free.

**Status codes.** `400` malformed · `401` no/expired token · `403` authenticated but not allowed
· `404` absent *or not yours* (never leak existence) · `409` revision conflict · `422` valid JSON
that fails business rules · `429` rate limited.

**Pagination** is cursor-based everywhere. Offset pagination over a collection that is being
written to skips and repeats rows; it is never correct for sync and rarely correct for lists.

**Request IDs.** Every response carries `X-Request-Id`. It is logged, and it is shown in the UI
on unexpected errors so a user can paste it into a support message.

## 3.2 Auth

| Method | Path                    | Notes                                             |
| ------ | ----------------------- | ------------------------------------------------- |
| POST   | `/auth/register`        | email, password, display_name, timezone           |
| POST   | `/auth/login`           | → access (15 min) + refresh (30 d)                |
| POST   | `/auth/refresh`         | rotates: old refresh dies, new one issued         |
| POST   | `/auth/logout`          | revokes this session                              |
| POST   | `/auth/logout-all`      | revokes the whole family                          |
| GET    | `/auth/me`              | current user + settings                           |
| PATCH  | `/auth/me`              | display_name, settings                            |
| POST   | `/auth/password`        | current + new; revokes all other sessions         |

Access token 15 minutes, refresh 30 days, rotated on every use with reuse detection
([§2.4](02-data-model.md)). Tokens are returned in the JSON body, not `Set-Cookie` — see the
Capacitor constraint in [§1.3](01-architecture.md).

Rate limits: 5 attempts per email per 15 min on `/auth/login`, plus a per-IP limit. Registration
is limited per IP per hour. Both return `429` with `Retry-After`.

Password rules: minimum 10 characters, checked against a compiled list of the 10k most common
passwords. No composition rules — no forced symbols, no expiry. Those make passwords worse.

## 3.3 Notes

| Method | Path                     | Notes                                          |
| ------ | ------------------------ | ---------------------------------------------- |
| GET    | `/notes`                 | `?filter=active\|archived\|trash&label=&cursor=&limit=` |
| POST   | `/notes`                 | body carries `client_id`; idempotent           |
| GET    | `/notes/{id}`            | `id` accepts server id or `client_id`          |
| PATCH  | `/notes/{id}`            | requires `base_rev`; `409` on mismatch         |
| DELETE | `/notes/{id}`            | soft delete → trash                            |
| POST   | `/notes/{id}/restore`    | out of trash                                   |
| POST   | `/notes/{id}/archive`    | `{ "archived": true\|false }`                  |
| POST   | `/notes/{id}/pin`        | `{ "pinned": true\|false }`                    |
| DELETE | `/notes/trash`           | empty trash — hard delete                      |

`PATCH` is a partial update and **must** carry `base_rev`:

```jsonc
// PATCH /notes/018f3a...  { "base_rev": 7, "title": "Groceries", "color": "mint" }
// 200 → the full note with rev: 8
// 409 → { "error": { "code": "note_conflict",
//                    "details": { "server_rev": 9, "server_note": { ... } } } }
```

Returning the server's version inside the 409 lets the client resolve without a second
round-trip. That detail matters a lot on a flaky mobile connection.

Validation, enforced in the service layer: title ≤ 200 chars, `body_text` ≤ 100 KB, ≤ 20 labels,
≤ 200 checklist items, `color` must be a known token.

## 3.4 Labels

`GET /labels` · `POST /labels` · `PATCH /labels/{id}` · `DELETE /labels/{id}`

Creating a label whose `name_lower` exists returns `409 label_exists` with the existing label,
so the client can just adopt it. The "create or reuse" behaviour users expect from a tag input
belongs on the server, not reimplemented in both frontends.

## 3.5 Search

```
GET /search?q=milk&label=<id>&color=mint&has=reminder&in=active&cursor=&limit=
```

Backed by the Mongo text index on `(title, body_text)`, scoped to `user_id`, sorted by
`textScore` then `updated_at`. Snippets are built server-side with the match highlighted, so both
frontends and the mobile app get identical highlighting.

Mongo text search is adequate up to roughly the low millions of notes per deployment. When it
stops being adequate you will want Atlas Search or Typesense — the endpoint shape above does not
change when you swap the engine, which is the point of not exposing Mongo query syntax to
clients.

## 3.6 Sync

```
GET  /sync?cursor=<opaque>&limit=200
POST /sync
```

Full protocol in [§4](04-sync-protocol.md). These two endpoints are what the offline client
actually uses; the per-note REST endpoints above exist for the admin-free, online path and for
anything scripting against the API.

## 3.7 Reminders and push

| Method | Path                          | Notes                                    |
| ------ | ----------------------------- | ---------------------------------------- |
| PUT    | `/notes/{id}/reminder`        | `{ remind_at, repeat }`                  |
| DELETE | `/notes/{id}/reminder`        |                                          |
| POST   | `/push/subscribe`             | endpoint + keys from the service worker  |
| DELETE | `/push/subscribe`             | on logout / permission revoked           |
| POST   | `/push/test`                  | sends a test push; dev + settings screen |

`remind_at` is sent as an **absolute UTC instant** computed on the client from the user's local
intent, and the user's IANA timezone is stored alongside so recurring reminders survive DST. A
"daily 9am" reminder must stay at 9am local when the clocks change — computing the next
occurrence in UTC arithmetic silently breaks this twice a year.

## 3.8 Admin API

All routes require `aud: "admin"` and a verified TOTP session.

| Method | Path                        | Role     | Notes                              |
| ------ | --------------------------- | -------- | ---------------------------------- |
| POST   | `/auth/login`               | —        | password + TOTP                    |
| GET    | `/users`                    | support  | search, filter, sort, cursor       |
| GET    | `/users/{id}`               | support  | **metadata only** — no note bodies |
| POST   | `/users/{id}/suspend`       | admin    | `reason` required → audit          |
| POST   | `/users/{id}/unsuspend`     | admin    | `reason` required → audit          |
| POST   | `/users/{id}/logout-all`    | support  | revoke sessions                    |
| DELETE | `/users/{id}`               | owner    | schedules deletion in 30 d         |
| GET    | `/stats/overview`           | support  | DAU/WAU, signups, notes created    |
| GET    | `/stats/timeseries`          | support  | `?metric=&from=&to=&interval=`     |
| GET    | `/audit`                    | admin    | cursor-paginated                   |

`GET /users/{id}` returns exactly this, and there is a test asserting the response contains no
note content:

```jsonc
{ "id": "...", "email": "...", "display_name": "...", "status": "active",
  "note_count": 412, "archived_count": 30, "label_count": 9,
  "storage_bytes": 1048576, "reminder_count": 3,
  "created_at": "...", "last_active_at": "...",
  "sessions": [ { "device": "Chrome on macOS", "last_used_at": "..." } ] }
```

`/stats/overview` is served from a **pre-aggregated daily rollup** written by the worker, not
computed live. An admin dashboard that runs a full-collection aggregation on every page load is
the classic way an internal tool takes down production.

## 3.9 Versioning

The `/v1` prefix is real: additive changes ship in place, breaking changes get `/v2` and `v1`
stays up for 90 days. This matters more than usual here — an installed PWA or a shipped mobile
build can be *months* stale, and you cannot force those clients to update. Every endpoint must
tolerate an old client. The server also returns `X-Min-Client: 1.4.0`, and the app shows a
non-blocking "update available" banner when it falls below it.
