# 7. Roadmap

Two phases separated by a hard gate. **v1 is ~4 weeks and ships with no backend.** Phase 2 is ~8
weeks and is built only if v1 proves people want the product.

The earlier version of this document planned all twelve weeks up front, server first. The business
model in [docs/00](00-business-model.md) makes that the wrong order: the free tier needs no server, so
building one before launch spends two months of effort on an unvalidated guess.

---

# Phase 1 — v1, the free tier (~4 weeks)

One app: `notes-maker-web/`. Set up the pnpm workspace anyway, so the Phase 2 folders drop in later
without restructuring — see [docs/01 → Repository layout](01-architecture.md#repository-layout).

### Stage A — Foundation (~3 days)

- `git init`, Node + Go `.gitignore`, pnpm workspace.
- Next.js 16 App Router, TypeScript, Tailwind v4 + **HeroUI** v3.
- Design tokens from [docs/05](05-design-system.md): the HeroUI theme block, the ten note colours as
  CSS custom properties.
- **i18n from day one** (`next-intl`), locales `id` + `en`. Retrofitting i18n is miserable, and
  "Indonesia first, global after" guarantees it is needed.
- PWA shell: manifest, maskable icons, service worker for app-shell caching.
- CI: locale-catalog parity check, lint, typecheck, build, Lighthouse budget.

> **Service worker is hand-written, not Workbox-generated.** `@serwist/next` and `next-pwa` are
> webpack plugins, and Next 16 builds with Turbopack by default — they do not run. Rather than move
> the whole project onto a non-default builder for one file, `public/sw.js` implements the ~90 lines
> needed: network-first navigations with a cache fallback, cache-first for the content-hashed
> `/_next/static/**`, and a static bilingual `offline.html`. No build-time precache manifest is
> required precisely because the static output is content-hashed.

> **Verify at install:** HeroUI's supported Tailwind major has shifted recently. Read the installed
> HeroUI version's peer requirement and pin Tailwind to match. A mismatch shows up as a silently
> unstyled app, which is miserable to debug. HeroUI is fixed — Tailwind bends to it.

**Exit:** installable PWA that boots offline with an empty shell, in both locales.

### Stage B — Local data layer (~4 days)

The foundation everything else sits on. Full spec in [docs/08](08-local-storage.md).

- Dexie schema — `notes`, `images`, `meta`. Notes carry `client_id` (UUIDv7), `rev`, `_base_rev`, and
  `_dirty` **from day one**, so a Phase 2 upgrade is an upload rather than a migration.
- `navigator.storage.persist()`, requested after the first note is saved — not on load.
- Quota monitoring via `estimate()`; warn at 80%.
- **Export/import** as a `.zip` of `notes.json` + images. The sole recovery path for the free tier.
- Eviction detection on boot, with an honest message and an import offer.

**Exit:** notes survive a hard refresh and a browser restart. Export → wipe site data → import
round-trips losslessly, images included.

### Stage C — Notes UX (~1.5 weeks)

Per [docs/06](06-ux-spec.md). ComposeBar expanding in place · NoteCard · masonry grid · Tiptap editor,
dynamically imported · colours · pin · archive · trash with undo toasts · local search over Dexie ·
keyboard shortcuts.

Masonry uses CSS Grid with `ResizeObserver` row spans, **not CSS `columns`** — columns reorder notes
away from DOM order, scrambling tab order and screen-reader output.

All reads and writes go through Stage B. Nothing touches a network.

**Exit:** full note lifecycle offline, correct at every breakpoint, keyboard-only operable.

### Stage D — Images (~4 days)

- Input paths: file picker, paste, drag-drop, mobile camera capture.
- Worker-based pipeline: downscale to ≤1600px, re-encode WebP, ~400px thumbnail, **EXIF stripped**.
  `imageOrientation: "from-image"` is mandatory or portrait photos render rotated.
- Blobs in Dexie; object URLs revoked on unmount.
- One image per note (free); schema supports many so Phase 2 lifts a constant.

**Exit:** a 12MP phone photo compresses to a few hundred KB, survives restart, appears in the export,
and carries no GPS data.

### Stage E — Limits, reminders, monetization (~4 days)

- **Note cap** behind a config constant, with a contextual, dismissible upgrade prompt. Creation is
  capped; existing notes are never locked. See [docs/00 §0.8](00-business-model.md) — 5 is likely too
  tight.
- **In-app reminders**: fire a `Notification` while a tab is open; surface an "Overdue" group on
  open. The UI must state that background reminders need the paid tier.
- **AdSense**: one sidebar slot, one between grid sections. Never inside a note, never interstitial.
  Feature-flagged so it can be switched off and measured.
- **SEO/content pages** — landing, about, privacy, and a few genuinely useful articles. A prerequisite
  for AdSense approval, not a later task.
- **Waitlist** — email capture for cloud sync + real reminders at the target price. The cheapest
  possible test of the paid tier.

**Exit:** cap enforced gracefully, reminders fire in-app, ads render without shifting layout, waitlist
collects addresses.

### Stage F — Polish and launch (~4 days)

Offline fallback · accessibility pass (VoiceOver + keyboard-only) · perf budgets from
[docs/06 §6.10](06-ux-spec.md) enforced in CI · privacy-friendly analytics (Plausible or Umami — not
GA, given the local-first privacy positioning) · backup nudge after 10 notes · both locales
proofread by a native speaker.

**Exit:** Lighthouse PWA 100, budgets met, both locales clean, ship it.

---

## The gate

Phase 2 is roughly eight weeks of backend work that is worthless if nobody returns to the free app.
Before starting it, look at real numbers ([docs/00 §0.7](00-business-model.md)):

| Signal | Question it answers |
| --- | --- |
| Day-7 retention | Do people come back at all? |
| Notes per active user | Real usage, or a single try? |
| % hitting the note cap | Is the cap working, or invisible? |
| Waitlist conversion | Is the price right? Is the demand real? |
| Organic traffic | Does content/SEO work, or is acquisition the problem? |

Weak retention means fixing the free product or stopping — **not** building a paid tier. And the
competitive question in [docs/00 §0.9](00-business-model.md) — *why pay when Google Keep is free?* —
needs a chosen answer before any of this is built.

---

# Phase 2 — the paid tier (~8 weeks, gated)

Detailed planning deferred until the gate is passed. Shape, in dependency order:

| Milestone | Content |
| --- | --- |
| **P2.1** Foundation | Go module, three `cmd/` binaries, Mongo replica set, migrations, CI |
| **P2.2** Auth | argon2id, JWT with audience claims, refresh rotation with reuse detection |
| **P2.3** Notes API | CRUD per [docs/03](03-api-contract.md), `client_id` idempotency, `base_rev` conflicts |
| **P2.4** Sync | The protocol in [docs/04](04-sync-protocol.md). The hard one — budget two weeks |
| **P2.5** Images | Cloudflare R2 (**free egress** — S3 bandwidth would eat the margin at these prices) |
| **P2.6** Push | Worker scheduler, VAPID, timezone-correct recurrence |
| **P2.7** Billing | Provider chosen at the time; annual billing pushed hard (see [docs/00 §0.5](00-business-model.md)) |
| **P2.8** Admin | Users list, suspend, audit log. Metadata only — never note content |

Free users' existing local data uploads through the normal sync path with no migration
([docs/08 §8.7](08-local-storage.md)).

---

# Phase 3 — hybrid app (~1.5 weeks, later)

Capacitor wrapping the web app. Cheap **only because** [docs/01 §1.3](01-architecture.md) is honoured
throughout — a local-first, client-rendered app ports almost directly. Native swaps: FCM/APNs for Web
Push, Filesystem for the image cache, Share target, biometric unlock.

---

## Deliberately out of scope

Sharing and collaboration · real-time multi-user editing · folders/notebooks · note history · OCR ·
web clipper · end-to-end encryption.

**Decide on E2E encryption before P2.4.** It is the one deferred item that is genuinely painful to
retrofit — it breaks `body_text` and server-side search entirely. It also sits suspiciously well with
the local-first privacy wedge in [docs/00 §0.9](00-business-model.md), so it may deserve promoting
rather than deferring.
