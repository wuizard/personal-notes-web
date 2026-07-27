# 1. Architecture

## Repository layout

One git repository, one pnpm workspace, folders as flat siblings at the root:

```
notes-maker/
├── notes-maker-web/      pnpm package  · v1, the whole product today
├── notes-maker-admin/    pnpm package  · Phase 2, not yet created
├── notes-maker-api/      Go module     · Phase 2, NOT a pnpm package
├── packages/shared/      pnpm package  · Phase 2, not yet created
├── docs/
├── pnpm-workspace.yaml   declares the pnpm packages above
└── pnpm-lock.yaml        the only lockfile in the repo
```

**Flat, not `apps/` + `packages/`.** That convention earns its keep at fifteen packages. Here there
will be at most four folders, and the extra nesting would buy nothing but a longer path in every
import and every CI filter.

The rules below are what stop a monorepo degrading into a tangle. They are cheap to hold now and
expensive to reinstate later.

**Frontends never import from each other.** `notes-maker-web` and `notes-maker-admin` may each import
from `packages/shared`, and never from one another. When they need the same thing, it moves into
`packages/shared` or it stays duplicated — duplication is the cheaper mistake. A direct import between
two deployable apps welds their release cycles together, and nothing in the tooling will warn you.

**The Go module is outside the JS workspace.** `notes-maker-api/` has its own `go.mod`, its own lint
and test commands, and is invisible to pnpm — `pnpm -r` will never see it. It shares this repository
for exactly one reason: a change to the API contract and the clients that consume it land in a single
commit. That is a real benefit and it is the only one being claimed.

**`packages/shared` is Phase 2 and must not be created early.** Its purpose is to hold types generated
from `api/openapi.yaml` (§1.8) once an API exists. Creating it now would produce an empty package that
invites people to put things in it "to share later", which is how a shared kitchen-sink module starts.
There is nothing to share while there is one app.

**CI stays a single workflow with per-package jobs.** Jobs are filtered by path so a docs edit does not
run a Go build, and a Go change does not rebuild the PWA. One workflow file keeps the whole pipeline
readable in one screen; splitting it per package is a Phase 2 decision at the earliest.

## 1.0 The tier boundary

Everything in this document follows from one line in [docs/00](00-business-model.md): **free users
never touch a server.**

```
FREE  (v1 — the whole product today)
┌──────────────────────────────────────────┐
│ notes-maker-web · Next.js PWA            │
│                                          │
│  Tiptap ── Dexie/IndexedDB ── Blobs      │  ← the only copy of the data
│  service worker · in-app reminders       │
└──────────────────────────────────────────┘
        no network. no account. no cost.

════════════ the tier boundary ════════════   ← crossed only by paying users

PAID  (Phase 2 — designed, not yet built)
┌──────────────────┐        ┌──────────────────┐
│ notes-maker-web  │        │ notes-maker-admin│
│ same app + sync  │        │ React SPA        │
└────────┬─────────┘        └────────┬─────────┘
         │ /api/v1                   │ /admin/v1
         │ user JWT                  │ admin JWT (different signing key)
         ▼                           ▼
┌──────────────────┐        ┌──────────────────┐
│ cmd/api          │        │ cmd/adminapi     │   public :8080 / private :8081
└────────┬─────────┘        └────────┬─────────┘
         └───────────┬───────────────┘
                     ▼
       ┌─────────────┐   ┌──────────────┐   ┌──────────┐
       │  MongoDB    │◀──│ cmd/worker   │   │ R2 (img) │
       └─────────────┘   └──────────────┘   └──────────┘
                                │ VAPID
                                ▼
                          Web Push (browser)
```

The consequence worth internalising: **§1.1 through §1.9 below describe Phase 2.** None of it is
built in v1. It is documented now because the local schema in v1 is deliberately shaped to grow into
it without a migration ([docs/08 §8.7](08-local-storage.md)) — but no Go code exists until the gate
in [docs/07](07-roadmap.md) is passed.

The v1 app is §1.5 alone, minus every `api/` folder.

## 1.1 The shape of the Phase 2 system

```
┌──────────────────┐        ┌──────────────────┐
│ notes-maker-web  │        │ notes-maker-admin│
│ Next.js PWA      │        │ React SPA        │
│ IndexedDB + SW   │        │ (no offline)     │
└────────┬─────────┘        └────────┬─────────┘
         │ /api/v1                   │ /admin/v1
         │ user JWT                  │ admin JWT (different signing key)
         ▼                           ▼
┌──────────────────┐        ┌──────────────────┐
│ cmd/api          │        │ cmd/adminapi     │   public :8080 / private :8081
│ user-facing      │        │ internal-only    │
└────────┬─────────┘        └────────┬─────────┘
         └───────────┬───────────────┘
                     ▼
              ┌─────────────┐      ┌──────────────┐
              │  MongoDB    │◀─────│ cmd/worker   │ reminders, tombstone GC
              └─────────────┘      └──────────────┘
                                          │ VAPID
                                          ▼
                                    Web Push (browser)
```

## 1.2 Why the API is split into two binaries

You asked for the admin API and the user API to be separate. The strongest version of that is
**one Go module, three `cmd/` entrypoints sharing `internal/`** — not two codebases, and not one
binary with two route groups.

What the split buys you:

- **Different signing keys.** A stolen user token is useless against the admin API and vice
  versa. With one binary and one key, an audience-claim bug becomes a privilege escalation.
- **Different network exposure.** `cmd/api` goes on the public internet. `cmd/adminapi` binds to
  a private interface or sits behind a VPN/IP allowlist. This is impossible if they share a port.
- **Different failure domains.** An admin query that table-scans a million notes cannot exhaust
  the connection pool serving real users — give each binary its own pool.
- **Different rate limits.** Users get per-account limits; admin gets generous ones.

What it costs you: one extra `main.go` and one extra container. That is a very good trade.

The shared `internal/` is what keeps this from being two projects. Domain logic, repositories,
and Mongo access are written once.

## 1.3 The constraint that shapes everything: Capacitor

You want a hybrid mobile app later. Capacitor ships a **static bundle** onto the device and runs
it from `file://` or a local server. There is no Node process on the phone. That means:

> **Every screen that shows note data must render client-side, against the HTTP API.**
> No server components fetching notes, no server actions in the note flows, no route handlers
> proxying the API.

If you ignore this, the mobile port is a rewrite. If you honour it from day one, the port is
mostly a `capacitor.config.ts` and a few native plugin swaps.

Concretely, in `notes-maker-web`:

- Marketing/auth pages may use server rendering — they are not part of the mobile bundle.
- The app shell (`/app/**`) is `"use client"` at the boundary, hydrated from IndexedDB first and
  the API second.
- No `NEXT_PUBLIC_` coupling to same-origin `/api`. The API base URL is a runtime config value,
  because on mobile it is `https://api.notesmaker.app` and in dev it is `http://localhost:8080`.
- Auth tokens live in memory + IndexedDB, **not** in an httpOnly cookie set by Next.js. Cookies
  do not survive the `file://` origin on device. Refresh tokens go in IndexedDB with the
  rotation scheme in [§3](03-api-contract.md).

This is the single most common way projects like this get stuck, so it is decided up front.

**The local-first pivot makes this nearly free.** A v1 that renders entirely from IndexedDB with no
server in the picture already satisfies every rule above by construction — there is no server
component fetching notes because there is no server. Provided v1 does not later grow a Next.js route
handler as a convenience, the Capacitor port in Phase 3 is mostly a config file. Guard that: the only
things `app/` may do on the server are the marketing pages, which are not in the mobile bundle.

## 1.4 Go service layout (Phase 2)

> **Partially superseded (2026-07-27) — see [docs/10 §10.17](10-plan-change-v2.md).** The
> `internal/feature/auth/` (register/login/refresh/logout) and `internal/platform/jwt/`,
> `internal/platform/password/` packages below are not built and will not be — the shipped client
> uses Firebase Auth exclusively, so the backend verifies Firebase ID tokens
> (`internal/platform/firebaseauth/`) instead of issuing its own. Everything else on this page
> (feature-folder layout, the three-layer split, `internal/platform/*` never importing
> `internal/feature/*`) is exactly what got built.

Feature folders, three layers, dependencies pointing inward.

```
notes-maker-api/
├── cmd/
│   ├── api/main.go              # public user API
│   ├── adminapi/main.go         # private admin API
│   └── worker/main.go           # reminder scheduler + GC
├── internal/
│   ├── feature/
│   │   ├── auth/                # register, login, refresh, logout
│   │   │   ├── handler.go       # HTTP: decode, validate, call service, encode
│   │   │   ├── service.go       # business rules; knows nothing about HTTP
│   │   │   ├── repository.go    # Mongo queries; knows nothing about business rules
│   │   │   ├── dto.go           # request/response shapes
│   │   │   └── service_test.go
│   │   ├── note/
│   │   ├── label/
│   │   ├── reminder/
│   │   ├── sync/                # the delta-sync endpoints
│   │   ├── push/                # subscription registry
│   │   └── admin/
│   │       ├── user/            # list/search/suspend users
│   │       ├── stats/           # dashboard aggregates
│   │       └── audit/           # who did what
│   ├── platform/
│   │   ├── config/              # env → typed struct, fail fast at boot
│   │   ├── mongo/               # client, index bootstrap, txn helper
│   │   ├── jwt/                 # issue + verify, audience-aware
│   │   ├── password/            # argon2id
│   │   ├── webpush/             # VAPID
│   │   ├── httpx/               # response envelope, error → status mapping
│   │   └── logx/                # slog setup, request-scoped logger
│   └── middleware/              # auth, requestid, recover, cors, ratelimit
├── api/openapi.yaml             # hand-written spec, source of truth for TS types
├── migrations/                  # index + backfill scripts, numbered
└── docker-compose.yml
```

Rules that keep this honest:

- `handler.go` never touches Mongo. `repository.go` never returns an HTTP status.
- Repository **interfaces are declared in the feature package that consumes them**, not in the
  repository package. This is the Go idiom and it makes services trivially fakeable in tests.
- `internal/platform/*` may not import `internal/feature/*`. Ever. Enforce it in CI with a
  simple `go list` check — it takes ten lines and prevents years of drift.
- Cross-feature calls go service→service through an interface, never repository→repository.

## 1.5 Web app layout

Folders marked **P2** are Phase 2 only and do not exist in v1.

```
notes-maker-web/src/
├── app/                          # routing only — thin files that compose features
│   ├── (marketing)/              # landing, about, privacy, articles (SEO + AdSense approval)
│   ├── (auth)/login/ register/   # P2
│   └── (app)/notes/ archive/ trash/ search/ settings/
├── features/
│   ├── storage/                  # ← v1 foundation. Everything else sits on this
│   │   ├── db.ts                 # Dexie schema (docs/08)
│   │   ├── persistence.ts        # persist(), quota, eviction detection
│   │   ├── export/               # zip export + import (merge | replace)
│   │   └── migrations.ts         # additive only, never destructive
│   ├── note/
│   │   ├── components/           # NoteCard, NoteEditor, NoteGrid, ComposeBar
│   │   ├── hooks/                # useNote, useNotes, useAutosave
│   │   ├── repo/                 # Dexie queries — the local source of truth
│   │   ├── images/               # worker pipeline: resize, WebP, EXIF strip, thumbs
│   │   ├── model/                # pure: sorting, filtering, body_text flattening
│   │   ├── api/                  # P2 — HTTP calls, typed from packages/shared
│   │   └── types.ts
│   ├── reminder/                 # v1: in-app only. P2 adds Web Push
│   ├── search/                   # v1: local over Dexie. P2 merges server results
│   ├── entitlement/              # tier gates, note cap, upgrade prompts
│   ├── monetization/             # ad slots (feature-flagged), waitlist capture
│   ├── auth/                     # P2
│   └── sync/                     # P2 — queue, cursor, reconciler
├── shared/
│   ├── ui/                       # HeroUI wrappers + primitives (Toast, Sheet, Empty)
│   ├── i18n/                     # next-intl setup, id + en messages
│   ├── lib/                      # result type, date, id (uuidv7), fetcher (P2)
│   └── config/                   # runtime config, feature flags
└── styles/
```

A feature owns its slice end to end: storage, state, UI, and — in Phase 2 — network. Features import
from `shared/`, never from each other's internals, only from a feature's `index.ts` barrel. That one
rule is what makes the eventual mobile port and any future extraction painless.

Two v1-specific notes:

- **`features/storage/` is the only module that touches Dexie directly.** Every other feature goes
  through a repository in its own folder. When Phase 2 introduces a server, only those repositories
  change — no component learns that a network appeared.
- **`features/entitlement/` exists in v1 even though there is no paid tier yet.** Tier checks live
  behind one interface returning a hardcoded `"free"`. Phase 2 swaps the implementation for one that
  reads a subscription. Scattering `if (noteCount >= 5)` through components instead is how a codebase
  becomes impossible to price-experiment against.

## 1.6 Admin app layout (Phase 2)

Same `features/` convention, Vite instead of Next (no SEO, no SSR, no PWA — it is an internal
tool and should boot fast and stay simple).

```
notes-maker-admin/src/
├── features/{auth,users,stats,audit}/
├── shared/{ui,lib,config}/
└── routes/                       # TanStack Router file routes
```

State: TanStack Query only. There is no client state worth a store in an admin panel.

## 1.7 A privacy decision, made deliberately (Phase 2)

**The admin API cannot read note content.** Not "should not" — cannot. The admin user
repository projects note *metadata* only: counts, sizes, timestamps, label names. There is no
admin endpoint that returns `body` or `body_text`, and there is no support tooling that
impersonates a user.

This costs you nothing now and is extremely expensive to retrofit after someone has built a
"view user's notes" support screen. If you ever genuinely need content access for abuse
handling, add it as an explicit, audited, time-boxed grant — never as an ambient admin power.

It also does real commercial work. If the wedge chosen in [docs/00 §0.9](00-business-model.md) turns
out to be local-first privacy, this rule is the thing that makes the claim true rather than
marketing — and free users' notes never reach a server at all, so for them it is guaranteed by
architecture rather than by policy.

## 1.8 Shared types (Phase 2)

`api/openapi.yaml` is hand-written and reviewed like code. From it:

```bash
pnpm --filter shared generate   # openapi-typescript → packages/shared/src/api.d.ts
```

Both frontends import types from `@notes-maker/shared`. A breaking API change fails the
frontends' typecheck in CI, which is exactly when you want to find out.

## 1.9 Local development

### v1

```bash
pnpm install
pnpm --filter notes-maker-web dev    # :3000
```

That is the whole thing. No Docker, no database, no environment variables, no seed script — a
consequence of the tier boundary in §1.0 that is worth appreciating while it lasts.

Debugging happens in DevTools → Application → IndexedDB and → Storage. Test eviction and
first-run behaviour in a fresh incognito profile, and test the export/import round-trip by clearing
site data between the two halves.

### Phase 2

`docker-compose.yml` at the workspace root brings up MongoDB (with a replica set of one, so you
get transactions and change streams) and Mongo Express. Everything else runs on the host:

```bash
docker compose up -d mongo
go run ./cmd/api          # :8080
go run ./cmd/adminapi     # :8081
go run ./cmd/worker
pnpm --filter notes-maker-web dev    # :3000
pnpm --filter notes-maker-admin dev  # :3001
```

The single-node replica set matters: Mongo refuses multi-document transactions on a standalone
server, and you will want one for refresh-token rotation.
