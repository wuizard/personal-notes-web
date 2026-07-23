# Notes Maker

A local-first note-taking PWA — soft pastel UI, zero-friction capture, no account required.

Free users' notes live entirely in their own browser: private by construction, and free to operate
because no server is involved. The paid tier adds what local-only storage cannot give — multi-device
sync, notes that survive a cleared browser, and reminders that fire when the app is closed.

**Read [docs/00-business-model.md](docs/00-business-model.md) first.** The architecture exists to
serve that model.

## v1 is one app, with no backend

This is the part most likely to surprise someone arriving at the repo: **v1 has no API and no
database.** Notes, images, colours, and reminders are all held in IndexedDB. The Go services, MongoDB,
sync protocol, and admin panel are designed and documented, but they are **Phase 2** — they exist to
serve paying customers and are built once the free tier has proven people want it.

| Folder | Stack | Status |
| --- | --- | --- |
| `notes-maker-web/` | Next.js 16 + HeroUI, PWA | **v1 — the whole product** |
| `notes-maker-api/` | Go 1.26, MongoDB | Phase 2 |
| `notes-maker-admin/` | React 19 + Vite + HeroUI | Phase 2 |
| `packages/shared/` | TypeScript | Phase 2 |
| `docs/` | Markdown | The plan — read in order |

Only `notes-maker-web/` exists today. The rest are reserved names, created when Phase 2 starts.

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
- **Payments deferred.** v1 validates demand with a waitlist before billing is built.
- **HeroUI** is the component library for both frontends. Tailwind is pinned to whatever HeroUI
  requires, never the reverse.

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
| [09 — Deployment](docs/09-deployment.md) | Cloudflare Workers (configured) and Pages |

## Getting started

```bash
pnpm install && pnpm --filter notes-maker-web dev
```

No Docker, no database, no environment variables. That is the point.

## Toolchain

Node 24.15 · pnpm 11.1 · Go 1.26.2 (Phase 2) · Docker 29.4 (Phase 2)
