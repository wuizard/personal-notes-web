# Notes Maker

A local-first note-taking PWA — soft pastel UI, zero-friction capture, no account required.

Free users' notes live entirely in their own browser: private by construction, and free to operate
because no server is involved. The paid tier adds what local-only storage cannot give — multi-device
sync, notes that survive a cleared browser, and reminders that fire when the app is closed.

**Read [docs/00-business-model.md](docs/00-business-model.md) first.** The architecture exists to
serve that model.

## v1 is client-only; Phase 2 has started

The part most likely to surprise someone arriving at the repo: for **notes themselves**, there is
still no API and no database. Notes, images, colours, and reminders all live in IndexedDB, entirely
client-side. What Phase 2 has actually built so far is narrower than "the backend" — Firebase-verified
identity and Polar-verified billing, in `notes-maker-api/`, so premium entitlement can be checked
server-side. Notes CRUD, delta sync, and the admin panel are designed (docs/04, docs/10) but not
built — see that folder's own state below rather than assuming "Phase 2" means "done."

| Folder | Stack | Status |
| --- | --- | --- |
| `notes-maker-web/` | Next.js 16 + HeroUI, PWA | **The whole product** — notes are 100% client-side regardless of account/plan |
| `notes-maker-api/` | Go 1.26 + gqlgen + MongoDB | Partial: Firebase auth verification, `Query.me{plan}`, Polar webhook → entitlement, and the notes sync API (`Query.notes` / `Mutation.pushNotes`, premium-only). No client sync engine consumes it yet. Deploys to a VPS — see `deploy/` |
| `notes-maker-admin/` | React 19 + Vite + HeroUI | Not created yet |
| `packages/shared/` | TypeScript | Not created yet |
| `docs/` | Markdown | The plan — read in order |

### It's one repo, one workspace

This is a **single git repository** and a **single pnpm workspace** — the folders above are siblings
sharing one dependency graph, not separate projects.

- `pnpm install` at the root installs for every package. There is exactly **one lockfile**, at the root.
- Run a package's scripts with a filter: `pnpm --filter notes-maker-web dev`.
- **`notes-maker-api/` is not a workspace package.** It is a Go module with its own `go.mod`,
  invisible to pnpm and built with `go` commands. It lives here so a change to the API contract and
  the clients that consume it land in one commit — that is the only reason.

The rules that keep this from turning into a tangle — what may import what, and why the Go module
sits outside the workspace — are in
[docs/01 → Repository layout](docs/01-architecture.md#repository-layout). Read them before adding a
folder.

## Decisions locked

- **Free tier is client-only.** No account, no server, no per-user cost.
- **IndexedDB, not cookies** — cookies cap at ~4 KB, which one photo exceeds by ~25×.
- **Rich text via Tiptap**, stored as ProseMirror JSON with a plaintext mirror for search.
- **Reminders**: free = in-app only; paid = real Web Push. A genuine technical boundary, stated
  plainly in the UI.
- **Indonesia first, global after** — `id`/`en` i18n and multi-currency structured in from day one.
- **Payments via Polar**, as a static Checkout Link plus a webhook that verifies the signature and
  writes entitlement — see [Billing](#billing) below for what's built and what's still a gap.
- **HeroUI** is the component library for both frontends. Tailwind is pinned to whatever HeroUI
  requires, never the reverse.

## Technology

| Layer | Stack |
| --- | --- |
| Frontend framework | Next.js 16 (App Router, static export via `next build`) |
| UI | HeroUI 3, Tailwind 4, `next-themes`, Geist font |
| Rich text | Tiptap 3 (ProseMirror), stored as JSON + a plaintext mirror for search |
| Local storage | Dexie (IndexedDB) — the only datastore for notes, images, reminders regardless of plan |
| i18n | next-intl, `id`/`en` |
| Auth | Firebase Authentication (client SDK on web; `firebase-admin-go` verifies tokens on the API) |
| PWA | Custom service worker (`sw.js`), offline page, install manifest |
| Frontend hosting | Static export served by Caddy on the VPS, Cloudflare proxied in front for edge protection only — see `notes-maker-web/deploy/`, [docs/09](docs/09-deployment.md) |
| Backend language | Go 1.26 |
| API | GraphQL via [gqlgen](https://gqlgen.com/) |
| Database | MongoDB 7, single-node replica set (multi-document transactions need it even with one member) |
| Billing | [Polar](https://polar.sh) — static Checkout Link + Standard Webhooks-signed webhook |
| Backend hosting | Docker (MongoDB only) + systemd (the Go binary) + Caddy (reverse proxy/TLS) on a VPS — see `notes-maker-api/deploy/` |
| CI/CD | GitHub Actions — `.github/workflows/ci.yml` (web: lint/typecheck/test/build, then deploy over SSH with a verify-before-swap release) and `.github/workflows/api.yml` (API: vet/test/build, then deploy over SSH with a health-check rollback) |
| Package management | pnpm workspace (JS/TS side) + a standalone Go module (`notes-maker-api/` is not a workspace package) |

## Usage

### Frontend — local dev

```bash
pnpm install && pnpm --filter notes-maker-web dev
```

No Docker, no database, no environment variables required — auth and billing are both optional at
this layer (see `.env.local.example`) and everything else runs entirely against IndexedDB.

```bash
pnpm --filter notes-maker-web lint
pnpm --filter notes-maker-web typecheck
pnpm --filter notes-maker-web test
pnpm --filter notes-maker-web build       # static export to notes-maker-web/out/
```

### Frontend — deploy

Pushing to `main` runs `ci.yml`'s `deploy-web` job, which builds the static export and deploys it
over SSH to the VPS only after lint/typecheck/test/build all pass — same VPS the API runs on, with
Caddy serving the files directly and Cloudflare proxying in front for edge protection only, not as
the host. Full details, including the one-time VPS/Cloudflare setup:
[docs/09-deployment.md](docs/09-deployment.md).

### Backend — local dev

```bash
docker compose up -d mongo mongo-express   # repo-root docker-compose.yml, no auth, local only
cp notes-maker-api/.env.example notes-maker-api/.env
cd notes-maker-api && go run ./cmd/api
```

Two variables must be filled in before the server will boot — it fails fast rather than surfacing a
nil pointer mid-request. `FIREBASE_CREDENTIALS_FILE` is the Admin SDK JSON path;
`NOTES_ENCRYPTION_KEY` seals synced note content at rest and is generated with:

```bash
openssl rand -base64 32
```

```bash
cd notes-maker-api
go vet ./...
go test ./...
go build ./...
```

Tests fake the repository boundary and need no database. The Mongo-backed ones — indexes, cursor
paging, the unique constraint behind idempotent creates — are skipped unless a database is named,
so run them explicitly when touching the sync layer:

```bash
MONGO_TEST_URI='mongodb://localhost:27017/?replicaSet=rs0' go test ./internal/feature/note/ -run Integration -v
```

Regenerating the GraphQL layer after editing `internal/graph/schema.graphql`:

```bash
cd notes-maker-api && go tool gqlgen generate
```

### Backend — deploy

There's no managed platform target — it runs on a plain VPS: MongoDB in Docker (with auth and a
keyfile, unlike the no-auth dev compose file), the API as a systemd service, Caddy in front for
automatic HTTPS. Pushing to `main` runs `api.yml`'s `deploy` job over SSH after tests pass. All the
one-time setup tooling — compose file, replica-set/user bootstrap script, systemd unit, Caddyfile,
the deploy user's sudoers grant — is in `notes-maker-api/deploy/`.

## Billing

Polar is wired end to end for the one $2/month product, with one documented gap: `polar_webhook.go`
links a payment to an account by matching `data.customer.email` against an existing Firebase-account
email. A payment from an email with no matching account is acked (so Polar doesn't retry) but not
linked to anything — there is no invite/claim flow yet. Don't point `NEXT_PUBLIC_POLAR_CHECKOUT_URL`
at a live product until that's closed; see `docs/10-plan-change-v2.md` §10.17 for the full writeup.

## Documents

| | |
| --- | --- |
| [00 — Business model](docs/00-business-model.md) | Tiers, pricing, unit economics, risks. **Start here** |
| [01 — Architecture](docs/01-architecture.md) | Tier boundary, folder structures, the Capacitor constraint |
| [02 — Data model](docs/02-data-model.md) | Local Dexie schema (v1); Mongo collections (Phase 2) |
| [03 — API contract](docs/03-api-contract.md) | *Phase 2* — user and admin APIs |
| [04 — Sync protocol](docs/04-sync-protocol.md) | *Phase 2* — cursors, revisions, conflict resolution |
| [05 — Design system](docs/05-design-system.md) | Pastel palette, tokens, HeroUI theme, a11y |
| [06 — UX specification](docs/06-ux-spec.md) | Screens, flows, keyboard map, quota and upgrade UX |
| [07 — Roadmap](docs/07-roadmap.md) | v1 stages, then the gate into Phase 2 |
| [08 — Local storage](docs/08-local-storage.md) | Dexie, persistence, eviction, images, export |
| [09 — Deployment](docs/09-deployment.md) | Static export served by Caddy on the VPS |
| [10 — Plan change v2](docs/10-plan-change-v2.md) | **Supersedes parts of 00–09** — checklists-first, English-first, accounts, FCM push |

## Toolchain

Node 24 · pnpm 11.1 · Go 1.26.5 · Docker (backend Mongo + local dev only — the Go binary itself runs
bare via systemd in production)
