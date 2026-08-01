# 10. Plan change — v2 direction (2026-07-24)

> This document records a set of product decisions that **supersede** parts of docs 00–09.
> Where a decision here contradicts an earlier doc, **this doc wins**; the older docs stay as
> written until each section is reworked, and each override below names the section it replaces.

## 10.0 Summary of what changes

| Area | Was (docs 00–09) | Now |
| --- | --- | --- |
| Primary language | Indonesian first, `/id` default | **English first, `/en` default**, `id` secondary (already landed in code) |
| Market framing | Indonesia-first, global after | **International from day one** |
| Default capture | Rich-text note | **Checklist (task list) by default**, convertible to a note |
| Checklists | Not a distinct type | First-class type (later **folded into the combined item cap, §10.14** — not unlimited after all) |
| Quick capture | Blank input | **Suggestions ranked by the user's own frequent entries** |
| Reminders | Free = in-app only | **Daily/weekly local notifications offline** (best-effort, see §10.4); paid = **guaranteed via FCM** |
| Backend | Go 1.26 + MongoDB (Phase 2) | **Unchanged** — Go + MongoDB confirmed (a Django switch was considered and rejected, §10.5) |
| API transport | *(not yet decided in docs 00–09)* | **GraphQL, not REST** — supersedes docs/03 in full, §10.15 |
| Auth | Deferred entirely | **Profile/login now**, Google Sign-In via Firebase Auth; backend verifies Firebase ID tokens, no custom JWT system (§10.17, supersedes docs/01 §1.4, docs/02 §2.1/§2.4, docs/03 §3.2) |
| Pricing | Rp 15–20k monthly / Rp 150k annual recommended | **Fixed $2/month per user** |
| Free item cap | 20–25 notes recommended (§0.8) | **5 items — notes and checklists combined** (§10.14, supersedes the "checklists uncapped" line above) |
| Paid item cap | Unlimited | **100 items combined**, 5 images per note |
| Landing page | App shell + SEO pages later | **Reworked theme + new marketing introduction now** |

---

## 10.1 Checklist-first capture

The capture bar creates a **checklist by default** — the Google Keep model, inverted: Keep defaults
to a note and offers a checkbox mode; we default to a task list because quick to-dos are the
dominant capture pattern.

- A checklist is a first-class item type: title + ordered check items (text, `checked`, `checked_at`).
- **Convert either way**: checklist → note (items become a bulleted list in Tiptap) and
  note → checklist (top-level bullets/lines become items). Conversion is lossless in the
  checklist → note direction; note → checklist flattens formatting and says so before converting.
- Checked items sink to a collapsed "Completed (n)" section at the bottom of the card, Keep-style.
- ~~Checklists are unlimited on both tiers.~~ **Superseded by §10.14**: checklists now count
  against the same combined item cap as notes. Left struck through rather than deleted, per this
  doc's own rule of recording what changed instead of silently rewriting it.

**Data model impact (extends docs/02):** `notes` gains `kind: "note" | "checklist"` and a
`check_items` array (empty for notes). `body_text` mirrors item text so search works unchanged.
Dexie schema version bump with an upgrade that stamps `kind: "note"` on existing rows.

## 10.2 Smart quick-capture suggestions

When the capture bar is focused and empty, show up to ~3 one-tap suggestions ranked by the user's
own history — if they type "go to market" most mornings, that becomes the first chip.

- **Entirely local.** Frequency/recency scoring over the user's past entries stored in a new Dexie
  table (`capture_phrases`: normalized text, count, last_used_at). Nothing leaves the device; this
  is the local-first privacy story doing real work.
- Simple v1 scoring: `count × recency-decay`. No ML, no server. Tunable later.
- Tapping a chip pre-fills the capture bar (does not auto-save).
- A setting turns suggestions off and clears the history.

## 10.3 Layout and design refresh

Goal: **softer and more elegant than Google Keep** — keep its speed and card grid, lose its utilitarian
flatness. This extends docs/05 rather than replacing it: the pastel token system already there is the
right base.

- Larger card radii, softer elevation (diffuse shadows, not hard borders), generous whitespace.
- Note colours as soft washes with matching dark-mode variants (docs/05 palette).
- Motion: gentle scale/fade on card enter, spring on pin/archive. Never blocking.
- Masonry grid on desktop, single column on mobile; master-detail stays (docs/06 §6.1a).

## 10.4 Reminders: daily and weekly, offline

Every note or checklist can carry a recurring reminder: **daily** or **weekly**, firing at the
**start of the user's local day** by default, with both the time and (for weekly) the weekday
**user-settable**. Reminders are listed per-note and in the Reminders screen.

Honesty requirement from docs/00 §0.2 still applies — the tiers differ in *delivery guarantee*:

| | Free (no server) | Paid |
| --- | --- | --- |
| Mechanism | Local: service worker + installed-PWA notification, in-app overdue list | **Push via Firebase Cloud Messaging (FCM)**, triggered by the backend |
| Fires when app/tab closed | **Best-effort only** — browsers do not guarantee background execution for a PWA with no push server; on iOS effectively no | **Yes — guaranteed delivery is the paid promise** |
| Recurrence | Daily / weekly, local-time | Same, computed server-side in the user's timezone |
| Prerequisite | None | Signed in **and** device registered (§10.6) |

The UI must state the free-tier limitation plainly at the moment a reminder is set ("reminders fire
when the app is open — get reliable notifications with sync"), which is also conversion trigger #4
in docs/00 §0.6.

**Timezone rule:** store the reminder as local wall-clock time + IANA timezone, never UTC instants,
so "start of my day" survives DST and travel.

## 10.5 Backend: Go + MongoDB, confirmed (docs/01, 03, 04 stand)

A switch to Django + PostgreSQL was proposed on 2026-07-24 and **rejected the same day** — the
Phase 2 stack stays **Go 1.26 + MongoDB** exactly as documented in docs/01–04. Recorded here so the
question doesn't get re-litigated.

One addition to the documented plan:

- **Push delivery goes through Firebase Cloud Messaging (FCM)** rather than raw VAPID Web Push.
  A scheduled job in `cmd/worker` scans due reminders per user timezone and sends via the Firebase
  Admin SDK for Go. FCM tokens live in the `push_subscriptions` collection (docs/02 §2.5), one row
  per registered device.
- Firebase is then serving double duty: Auth on the client (§10.6) and FCM on the server — one
  console, one set of admin credentials.

## 10.6 Accounts, login, and the profile icon

An account system arrives **before** full Phase 2, because free users also get value from signing in.

- **Profile icon** in the top bar: signed-out → sign-in menu; signed-in → avatar with profile,
  settings, sign-out.
- **Two sign-in methods, no more:** Google Sign-In and regular email/password, both through
  Firebase Auth (one SDK, one user store, and the server verifies both the same way). The admin
  SDK key is already provisioned; the client web config is deferred until stage 5 — not a blocker
  for stages 1–4.
- **Signed-in free user gets:** feedback reporting (see below), and settings that follow the
  profile: note colour defaults, light/dark mode.

### Feedback lifecycle

- Feedback is **stored server-side, never on the device** — it is support data, not a note, so it
  does not count against any local quota and survives a cleared browser.
- The endpoint is the **real Go API** (docs/03), not a stopgap Worker: stage 5 stands up a minimal
  `notes-maker-api/` deployment (Firebase token verification + feedback endpoints only), and
  Phase 2 builds sync on that same skeleton rather than starting fresh.
- The user can see their submitted feedback items in-app (profile icon → Feedback), each showing
  its status and **at most one reply from us** — a single text field, shown in-app.
- Anything beyond that one reply **moves to email**: the reply includes/points to our address, and
  the thread continues there. This keeps the in-app surface to one write per side — no support-chat
  system to build, moderate, or paginate.
- **Signed-in paid user gets:** everything above plus sync (§10.5), real push (§10.4), and the paid
  limits (§10.7).
- Local-first still holds: **signing in never uploads notes by itself.** Notes sync only on the paid
  tier, and the UI says so. Anonymous usage remains fully supported.

### Device registration for push (paid)

Paid users register each device that should receive notifications. **Signing in is a prerequisite**
— the flow refuses to start otherwise — and the entry point lives **under the profile icon**, in a
"Notification devices" menu item **badged "Paid"** (visible to everyone as an upgrade surface,
functional only for paid).

1. On the PC (or any signed-in device), profile icon → Notification devices → "Add this device"
   registers the local FCM token.
2. **Link-to-phone flow:** the website generates a short-lived link (shown as a QR and sendable as
   a URL). Opening it on the phone loads the web app, has the user **sign in**, then registers that
   device's FCM token — so the phone gets guaranteed notifications without the user ever typing a
   URL on mobile.
3. The Devices list shows every registered device and allows revocation.

This is the `push_subscriptions` collection from docs/02 §2.5, unchanged in concept — one row per
device (FCM token), keyed to the user.

## 10.7 Tiers, limits, pricing (supersedes docs/00 §0.2, §0.5, §0.8)

| | **Free** | **Paid — $2/month per user (fixed)** |
| --- | --- | --- |
| Notes + checklists (combined) | **5** — see §10.14, this table originally split them and called checklists unlimited; that's superseded | **100** |
| Images | **1 per note** | **5 per note** — at the 100-item cap that is a hard ceiling of **500 images per account** |
| Ads | **Shown when online** (never inside notes — docs/00 §0.4 rules stand) | **None** |
| Sync / multi-device | No | Yes |
| Reminders | Local best-effort (§10.4) | Guaranteed via FCM, per-device |
| Sign-in | Optional — feedback + settings | Required |

Ads follow docs/00 §0.2 as already planned: free tier only, feature-flagged, and only when online —
the offline app never holds a blank ad slot.

Overriding two explicit recommendations in docs/00, recorded here so the reasoning isn't lost:

- **§0.8 argued 5 notes is too tight** (cap should bite after the habit forms). Decision: keep 5 —
  the unlimited-checklist tier is the habit-forming surface now, which materially weakens the old
  objection. The cap stays a single config constant so real data can still move it. *(Note: §10.14
  later folds checklists into this same cap, which weakens the rebuttal above — recorded there
  rather than rewritten here, per this doc's own "supersede, don't erase" rule.)*
- **§0.5 argued $2/month is fee-eroded** (~18% lost to a $0.30 processor fee) and proposed annual
  billing. Decision: $2/month fixed. Revisit annual as an *addition* (not a replacement) once
  billing exists; the fee math in §0.5 remains true and unrebutted.

Payments themselves remain **deferred** until the §0.7 gates pass — nothing here changes the
waitlist-first validation plan.

## 10.8 Archive and trash

- **Archive** — the note leaves the main grid but is kept, fully searchable, in the Archive screen.
  Unarchive restores it in place. No time limit.
- **Trash** — deleted notes are held **30 days**, then purged automatically. A note in trash shows
  its remaining days. Restore is one tap.
- **Delete directly from trash** ("Delete forever") asks for confirmation before purging —
  a confirmation dialog, not a snackbar, because a snackbar-undo pattern is wrong for an
  *irreversible* action (undo must be offered only for reversible ones). Moving to trash, by
  contrast, keeps the existing undo snackbar (docs/06 §6.5) since it *is* reversible.

Auto-purge runs opportunistically on app open (local, free tier) and server-side for synced notes.

## 10.9 Landing page and marketing

- Rework the landing/marketing introduction for the **international** framing: local-first privacy
  and "your notes never touch a server unless you pay us to sync them" is the wedge (docs/00 §0.9),
  now stated in English first.
- Apply the §10.3 visual refresh to the landing page so the marketing surface matches the app.
- `/en` is canonical for marketing pages; `/id` remains a fully translated secondary locale
  (already the routing default in code as of 2026-07-24).

## 10.10 Billing, refunds, and the payment gateway

### Gateway choice — use a Merchant of Record

For a solo, international, $2/month product, raw processing fees are not the real cost — **global
sales-tax/VAT compliance is**. A Merchant of Record (MoR) resells the product, collects and remits
tax in every jurisdiction, and handles chargebacks and refund mechanics. Without one, selling
internationally means registering for VAT/GST in every threshold-crossing country yourself.
Verify current fees before committing — pricing below is as of mid-2026:

| Gateway | Model | Fee at $2 | Effective % | Notes |
| --- | --- | --- | --- | --- |
| Stripe | Processor only | ~$0.36 (2.9% + 30¢) | ~18% | Cheapest raw rate, but **not available to Indonesian merchants** without a foreign entity (Atlas ≈ $500), and you handle global tax yourself |
| **Polar** | **MoR** | ~$0.48 (4% + 40¢) | ~24% | **Cheapest MoR**; developer-focused, newer company |
| Paddle | MoR | ~$0.60 (5% + 50¢) | ~30% | Most established MoR; strongest pick for reliability |
| Lemon Squeezy | MoR | ~$0.60 (5% + 50¢) | ~30% | Stripe-owned; similar to Paddle |
| PayPal | Processor | ~$0.40+ + FX | 20%+ | Poor rates on micro-transactions and currency conversion |

**Decided (2026-07-24): Polar** — cheapest reliable MoR for a project this size. Before stage 6
work begins, verify two things on their current terms: fee schedule unchanged, and payout support
for an Indonesian individual seller. The app only ever sees "subscription active: yes/no" via
webhook, so if either check fails the fallback is Paddle with no architectural change.

**Superseded (2026-08-01): switched to Paddle** — Polar locked the account; see §10.20 for the
full writeup. The fallback named above is exactly what happened.

Note the standing fee-erosion problem from docs/00 §0.5: at $2/month even the cheapest option eats
~18–24%. An **annual plan added later** (~$20–24/year) drops the fixed-fee share below 3% and
remains the single biggest margin lever available.

### Refunds

- **User-initiated, from the app:** profile icon → Billing → "Request refund". Available within a
  **14-day window** after any charge, no questions required — at $2, arguing costs more than
  refunding, and a chargeback costs ~$15 plus dispute-rate risk. Fighting is always a loss.
- The MoR executes the actual money movement; our side records the request, cancels the
  subscription at period end (or immediately on refund), and flips the entitlement flag.
- **Admin panel** gains a Refunds view: request list, status, one-click approve (auto-approved
  within the window; manual only outside it), every action audited per docs/02 §2.6.
- Post-refund the account **downgrades to free, keeping data**: notes beyond the free cap become
  read-only rather than deleted — the docs/00 §0.6 rule (never hold existing data hostage) applies
  to downgrades too.

## 10.11 Sequencing

Roughly in dependency order; stages 1–4 are pure client work and shippable without any backend.

1. **Checklists** (§10.1) — data model bump, capture-bar default, convert flows, card rendering.
2. **Archive/trash semantics** (§10.8) — 30-day purge, delete-forever confirmation.
3. **Design refresh + landing page** (§10.3, §10.9).
4. **Quick-capture suggestions** (§10.2) and **local recurring reminders** (§10.4 free half).
5. **Auth** (§10.6) — Firebase Auth, profile icon, feedback form (first server dependency;
   blocked on Firebase keys).
6. **Phase 2** (§10.5) — Go + Mongo sync, FCM push, device registration, billing at $2/month via
   the chosen MoR with the refund flow (§10.7, §10.10), still gated on the docs/00 §0.7 validation
   metrics.

## 10.12 Open questions

- Firebase **client web config** (apiKey/authDomain snippet + enabling the Google provider +
  authorized domains) — deferred by choice to stage 5; the admin SDK key is already provisioned
  locally (gitignored, never committed).
- **Rewarded video → 1-day premium (idea, not built, 2026-07-29).** Let a free-tier user watch a
  rewarded ad in exchange for a 24-hour premium grant, as an alternative on-ramp alongside the
  $2/month subscription. Unresolved: how a 24h grant is represented (`Subscription.Status` is
  currently a durable Paddle-webhook-driven field, §10.7/§10.20 — a self-expiring grant with no
  payment behind it is a different shape and needs its own field or a distinct status value, not a
  fake Polar subscription); which ad network actually serves rewarded video (AdSense's own unit
  types are display/in-feed/in-article — rewarded video is a separate product, e.g. Google Ad
  Manager or AdMob, which may mean a second SDK); and whether this cannibalizes subscription
  conversions enough to matter at this app's scale. Not sequenced into any stage yet.

### Resolved (2026-07-24)

- ~~Backend stack~~ — **Go + MongoDB stays**; Django rejected (§10.5).
- ~~Free-tier images~~ — confirmed **1 per note** (§10.7).
- ~~Paid push transport~~ — **FCM**, guaranteed delivery, sign-in + device registration required
  (§10.4, §10.6).
- ~~Ads~~ — free tier shows ads when online, paid tier none (§10.7, consistent with docs/00 §0.2).
- ~~Auth methods~~ — Google Sign-In + email/password via Firebase Auth, nothing else (§10.6).
- ~~Feedback storage~~ — server-side, one in-app reply, then email (§10.6). Client Firebase web
  config deferred to stage 5.
- ~~Language~~ — English-first confirmed as the plan of record; docs/00 rewording is cleanup, not
  a decision.
- ~~Payment gateway~~ — **Polar**, chosen for cheapest reliable MoR (§10.10); Paddle is the
  drop-in fallback if Polar's fees or Indonesian-seller support don't check out at stage 6.
- ~~Paid image limit~~ — **5 per note**, giving a hard ceiling of 500 images/account at the
  100-note cap (§10.7). Supersedes docs/00's "up to 10 per note".
- ~~Feedback server~~ — the **real Go API**, stood up minimally at stage 5 (auth verify +
  feedback only); no Worker/KV stopgap (§10.6).

## 10.13 Plan verification and offline grace (client scaffolding, ahead of stage 6 billing)

Client-side scaffolding for §10.7's tier gating, built ahead of the real billing backend so the
seam is ready the day stage 6 (§10.5, §10.10) ships. Lives under `src/features/plan/`.

**The "data variable."** `usePlan()` (`src/features/plan/use-plan.ts`) is the single source of
truth the rest of the app reads: `{ plan: "free" | "premium", graceExpired: boolean }`. Every
future paid gate (note cap, image cap, sync UI) should read this hook rather than re-deriving
plan state.

**Where the verdict comes from.**

- **Signed out → always `"free"`.** Premium requires an account (§10.7's "Sign-in: Required" row),
  so there is nothing to check.
- **Signed in → `checkRemotePlan(uid)`** (`src/features/plan/remote.ts`), called on mount and on
  every `online` event. **This is currently a stub that always returns `"free"`** — there is no
  billing backend yet; Phase 2 (Go + MongoDB + Polar, §10.5/§10.10) is sequenced at stage 6, and
  this project is at stage 5. Wiring the real endpoint later is a one-function change, the same
  seam shape as `src/features/storage/remote.ts` for sync.
- A successful check **overwrites** the cache (tier + `verifiedAt`, in `localStorage` under
  `nm-plan-cache`); a **failed** check (offline, or a transient error) changes nothing — the
  existing cache and its grace window keep standing. One flaky request must never bounce a paying
  user back to the ad-supported experience.

**Offline grace — the "stays premium for a week" rule.** A cached `"premium"` verdict keeps
working while offline. Once more than **7 days** pass since the last successful verification
(`GRACE_PERIOD_MS` in `plan-cache.ts`) without reconnecting, it silently reads as `"free"` until
the next successful check succeeds — an unreachable backend cannot rule out a lapsed subscription
forever, so trust decays rather than persisting indefinitely. A cached `"free"` verdict never
expires; there is no harm in continuing to withhold premium.

Signing out, or "Delete all data" (§0's storage panel), clears `localStorage` and with it the plan
cache — both correctly fall back to `"free"` on the next check rather than resurrecting a stale
verdict.

**Ads.** `src/shared/ads/adsense.tsx` loads the AdSense script (`adsbygoogle.js`) only when
**all** of: `plan === "free"`, the browser is currently online, and
`NEXT_PUBLIC_ADSENSE_CLIENT_ID` is configured — matching §10.7's "shown when online... the offline
app never holds a blank ad slot" exactly. Publisher ID is not a secret (it's public in every
served page), so it lives in `.env.local.example` with a real default rather than blank like the
Firebase keys; unset in any environment, the component renders nothing. The free/online gate
itself lives in `use-ads-enabled.ts`, shared by the script loader and every ad unit.

**Ad unit placement (2026-07-29).** One banner, `src/shared/ads/banner-ad.tsx`: bottom-center of
the app screens (notes/archive/completed/reminders/settings/trash via `AppShell`), not the
marketing landing page. Sits in the normal document flow below the page content and above the
mobile tab bar, so it takes up no space at all — for anyone not seeing ads (premium, offline, or
the unit not configured) — rather than being an overlay that always reserves a strip. Needs its
own slot ID, `NEXT_PUBLIC_ADSENSE_BANNER_SLOT`, from an AdSense "Display ad" unit; blank renders
nothing, same as the client ID.

## 10.13a Completed checklists (Premium)

A checklist settles into a dedicated **Completed** view (tick icon in nav, `src/features/note/
components/completed-view.tsx`) once every real item on it is checked — Premium, gated the same
way as §10.13a's ads/plan machinery. Free users see the nav entry (an upgrade surface per docs/00
§0.6) but nothing ever lands in it, since nothing can settle as complete without the plan.

**The moment of completion.** Checking a checklist's last item does not move it immediately — the
user is asked first (`ChecklistEditor`'s completion prompt, driven from `note-editor.tsx`):
"Checklist complete! Add a note about how you finished it?" — **Add a note** opens that exact
item's completion-note field (the same per-item note UI every checked item already has) and only
settles the note once that field is committed; **Skip** settles it immediately. Either path ends
by writing `completed_at` (`src/features/storage/types.ts`) and showing a toast.

**Un-completing is automatic, not a button.** The moment any item on a completed checklist is
unchecked, it silently returns to the main list with a toast ("moved back to Notes") — enforced
centrally in `note-repo.ts`'s `updateNote`, not by each call site, so no future caller can forget
the invariant.

**The Settings toggle.** "Move finished checklists to Completed" (Settings → `AutoCompletePanel`)
defaults on; turning it off makes a fully-checked checklist behave exactly as it did before this
feature existed — no prompt, no move, just a checklist sitting fully checked in the main list.

**Free tier count.** Completed checklists still count toward the item cap (§10.14) exactly like
any other live, non-archived checklist — Completed is a filtered *view*, not a separate bucket
exempt from the limit.

## 10.14 Combined note/checklist cap (supersedes §10.7's "checklists uncapped" clause)

§10.7 originally capped only plain notes (5 free / 100 paid) and left checklists unlimited on
both tiers, reasoning that unlimited checklists were the free tier's habit-forming surface. That
is superseded: **the free tier's limit is 5 items total — notes and checklists combined** — and
the paid tier's is 100, also combined. `countActiveNotes()` (`note-repo.ts`) counts every live,
non-archived row regardless of `kind`.

Archived items still don't count — archiving stays a legitimate way to make room without deleting
anything, consistent with docs/00 §0.6 ("capping creation is acceptable, holding existing data
hostage is not"). Trashed items don't count either, for the same reason: moving something to
Trash already frees a slot the instant it happens, without waiting for the 30-day purge or an
explicit "empty trash."

Enforced in `QuickCompose` (`src/features/note/components/quick-compose.tsx`) at save time, for
both capture modes — checking `usePlan()` against `FREE_ITEM_CAP` / `PREMIUM_ITEM_CAP`
(`note-repo.ts`). Blocked saves keep the drafted content in the compose box (nothing is lost) and
show an inline message pointing at either Trash/Archive or an upgrade, rather than silently
discarding what was typed. Converting between note and checklist kind is never blocked by this —
the combined count doesn't change either way.

## 10.15 Backend API: GraphQL over Go (supersedes docs/03 in full)

**Decision (2026-07-27): the Phase 2 API is GraphQL, not REST.** Docs/03's per-resource REST
contract is superseded wholesale — every endpoint table in that doc maps to a query, mutation, or
input type below instead. Nothing about the *data model* changes: docs/02 (schema), docs/04 (sync
protocol invariants), and docs/08 §8.7 ("a sync is an upload, not a migration") all stand exactly
as written. This is a transport-and-contract decision, not a data decision — **no user data is at
risk and nothing about what gets kept changes**; `client_id`/`rev`/tombstones already exist for
Phase 2 sync regardless of what shape the API answers in.

Go stays confirmed per §10.5 (Django was rejected the same day it was proposed). The Go GraphQL
server library is **gqlgen** — schema-first (you write `.graphql` SDL, it generates typed
resolvers), which keeps the schema itself the source of truth and reviewable independent of Go
code, the same reason docs/03's REST tables were written as tables rather than left implicit in
handler code.

### Why this changes the shape of the contract

- **One endpoint, not forty.** `POST /graphql` (user schema) and `POST /admin/graphql` (admin
  schema) replace every route in docs/03 §3.2–§3.8. The two-audience split stays **exactly** as
  hard as it was — separate schemas, separate JWT audiences, separate signing keys (§3's "a token
  minted for one audience is rejected by the other" is unchanged; it just now also means "rejected
  by the other *schema*," enforced before either resolver runs).
- **No URL versioning (§3.9 fully replaced).** GraphQL evolves by *adding* fields and marking
  retired ones `@deprecated(reason: "...")`, never by standing up a parallel `/v2`. This is
  stricter than REST's approach, not looser: an old client tolerates unknown *new* fields for
  free (it never asked for them), so the "an installed PWA can be months stale" constraint from
  §3.9 is satisfied by the additive-only discipline alone — there is no server-side "min client
  version" gate to build.
- **Errors are typed union results, not HTTP status codes.** §3.1's `{ "error": { "code": ... } }`
  envelope and the `409` conflict-with-server-copy pattern become GraphQL result unions — see
  `UpdateNoteResult` below. GraphQL always returns `200`; the union member the client got back
  *is* the status code.
- **Cursor pagination maps directly.** §3.1 already mandated cursor pagination and rejected
  offset pagination for the same reason Relay-style connections exist — `notes(cursor:, limit:)`
  returns `{ edges, pageInfo { endCursor, hasNextPage } }`, unchanged in spirit from the REST
  `?cursor=&limit=` params.
- **`/sync`'s two REST endpoints become one query + one mutation** — `syncPull(cursor:)` and
  `syncPush(changes:)` — still the same pull/push shape as docs/04 §4.1, still the client's own
  IndexedDB outbox draining against them exactly as documented there. Docs/04 is otherwise
  untouched by this decision.

### Schema sketch (illustrative, not final SDL)

```graphql
type Note {
  id: ID!
  clientId: String!
  kind: NoteKind!
  title: String!
  bodyText: String!
  checklist: [ChecklistItem!]
  color: NoteColor!
  pinned: Boolean!
  archived: Boolean!
  labels: [Label!]!
  reminder: Reminder
  rev: Int!
  createdAt: DateTime!
  updatedAt: DateTime!
  deletedAt: DateTime
}

type NoteConnection { edges: [NoteEdge!]! pageInfo: PageInfo! }
type NoteEdge { node: Note! cursor: String! }

# Optimistic concurrency replaces PATCH's required base_rev / 409 (docs/03 §3.3).
input UpdateNoteInput { id: ID!, baseRev: Int!, title: String, color: NoteColor, checklist: [ChecklistItemInput!] }
union UpdateNoteResult = Note | NoteConflict
type NoteConflict { serverRev: Int!, serverNote: Note! }

type Query {
  notes(filter: NoteFilter = ACTIVE, label: ID, cursor: String, limit: Int = 50): NoteConnection!
  note(id: ID!): Note
  search(q: String!, label: ID, color: NoteColor, cursor: String, limit: Int = 50): NoteConnection!
  syncPull(cursor: String, limit: Int = 200): SyncPage!
  me: User!
}

type Mutation {
  createNote(input: CreateNoteInput!): Note!          # input carries clientId; idempotent, docs/03 §3.3
  updateNote(input: UpdateNoteInput!): UpdateNoteResult!
  deleteNote(id: ID!): Note!                           # soft delete → trash
  restoreNote(id: ID!): Note!
  setArchived(id: ID!, archived: Boolean!): Note!
  setPinned(id: ID!, pinned: Boolean!): Note!
  emptyTrash: Int!                                     # returns count purged
  setReminder(noteId: ID!, remindAt: DateTime!, repeat: RepeatRule!): Note!
  clearReminder(noteId: ID!): Note!
  syncPush(changes: [NoteChangeInput!]!): SyncPushResult!
  createLabel(name: String!): CreateLabelResult!        # union: Label | LabelExists
  login(email: String!, password: String!): AuthResult!
  refresh(refreshToken: String!): AuthResult!
  logout: Boolean!
}
```

Everything under docs/03 §3.7 (push subscribe/unsubscribe) and §3.8 (the whole admin surface —
`users`, `suspend`, `stats`, `audit`) follows the identical query/mutation translation and is not
spelled out in full here; §3.8's rule that `GET /users/{id}` returns metadata only, never note
content, becomes a resolver-level field restriction on the admin `User` type instead — the *same*
rule, enforced one layer differently.

### What stays exactly as documented

- Rate limiting (§3.2's login/registration limits), password rules, and audit logging on every
  admin mutation — transport-independent, apply identically to GraphQL mutations.
- `remind_at` as an absolute UTC instant plus stored IANA timezone (§3.7) — a data-shape decision,
  untouched by the API layer.
- Mongo-backed search (§3.5) and its documented ceiling before Atlas Search/Typesense becomes
  necessary — `search()` just resolves against the same index.
- The billing/entitlement additions flagged at the top of docs/03 (P2.7, §10.10) — still needed,
  now as mutations/queries instead of endpoints.

### Not decided here (open questions for whoever builds this)

- Whether `syncPull` should become a **GraphQL subscription** (server-pushed, replacing polling)
  instead of a polled query — a genuine upside GraphQL offers that REST didn't, but it's a real
  scope increase (a persistent connection, resumable subscription state) and nothing in this
  decision requires taking it. Start with the query; revisit once P2 sync is live and real usage
  data exists.
- Exact gqlgen project layout, and whether admin/user schemas share a Go module or are fully
  separate binaries. Either is compatible with everything above.

## 10.16 Profile menu revamp, and real Polar checkout wired ahead of the webhook backend

**Profile menu** (`src/features/auth/auth-menu.tsx`) is now a real menu regardless of sign-in
state, not a bare avatar button — About Us and Send Feedback don't need an account, so gating the
whole menu behind Firebase config (as it did before) hid two unrelated features because of one
unconfigured one. Order: About Us → Send Feedback → Upgrade to Premium → account section
(Signed in as + Sign out, or just Sign in) **last**, separated by a divider. Signed out *and*
Firebase unconfigured, the account section is simply omitted — anonymous usage stays first-class
(§10.6).

- **About Us** → `wuebuild.com`, opens in a new tab.
- **Send Feedback** → `mailto:wwcolaborationprojects@gmail.com`. This is deliberately simpler than
  §10.6's planned server-stored feedback system (ticket status, one in-app reply) — that's still
  the Phase 2 plan; this is an interim channel that needs nothing built to work today.
- **Upgrade to Premium** → `PurchasePlanDialog` (`src/features/billing/`), the Free vs Premium
  comparison table from §10.7/§10.14.

**Payment: a real decision, made explicitly.** Asked whether the Subscribe button should be a
waitlist capture (matches docs/00 §0.7's "payments deferred" plan, zero risk) or real Polar
checkout — the answer was **real checkout, now**. That is what's built: `src/features/billing/
polar.ts` redirects to a genuine Polar Checkout Link (`NEXT_PUBLIC_POLAR_CHECKOUT_URL`,
`.env.local.example`), prefilling `customer_email` for a signed-in user. Unconfigured, the button
is replaced with an honest "not set up yet" message rather than a dead link.

**The gap this does not close, on purpose, because closing it isn't possible yet:** nothing
verifies the payment or grants premium afterward. That requires a backend that receives and
verifies Polar's webhook and writes the entitlement — §10.15's GraphQL API, specifically wiring a
real implementation behind `checkRemotePlan()` (`src/features/plan/remote.ts`), which is still a
stub that unconditionally returns `"free"`. Until that exists: a real card gets charged, the
customer returns to the app, and **the app shows no change** — `usePlan()` still reports `"free"`.
This is not a bug to fix in the client; it is the webhook handler that hasn't been built. Treat it
as the blocking next step before pointing `NEXT_PUBLIC_POLAR_CHECKOUT_URL` at a real product in
production, not optional follow-up polish.

Also overrides docs/00 §0.5/§0.7's "no converted-currency pricing, wait for validation gates"
guidance for the *English* price string specifically: §10.7 already fixed pricing at **$2/month,
unconverted, in every locale** — the Indonesian translation shows `$2 / bulan`, not an IDR
estimate, because that guidance was itself superseded by §10.7's fixed-price decision before this
screen was ever built.

## 10.17 Backend milestone 1: `notes-maker-api` exists, closes the Polar payment loop

**The backend now exists.** `notes-maker-api/` (Go module, sibling to `notes-maker-web/`, not a
pnpm package) implements the smallest slice that closes the gap §10.16 flagged as blocking: a real
GraphQL `me { plan }` query, a signature-verified Polar webhook, and MongoDB-backed entitlement
storage. Full Notes CRUD/sync (P2.3–P2.4), labels/search, images, push, and the admin app are
still not built — see "What's still not built" below.

### Auth correction (supersedes docs/01 §1.4, docs/02 §2.1 & §2.4, docs/03 §3.2)

Those three docs describe a custom argon2id-password + JWT + refresh-rotation auth system. It was
never built, and it never needs to be: the shipped client uses Firebase Auth exclusively (§10.6),
and §10.6 already stated a later decision wins a conflict with earlier docs. Building the custom
system now would stand up a second, unused auth stack for no reason.

What's actually built instead: `notes-maker-api` verifies Firebase ID tokens server-side via
`firebase-admin-go` (`internal/platform/firebaseauth`), using the service account key already
provisioned at the repo root (gitignored, path given to the server via
`FIREBASE_CREDENTIALS_FILE`, never read by anything else). No passwords, no custom JWT issuance,
no `sessions` collection, no `login`/`refresh`/`logout` mutations from §10.15's schema sketch —
Firebase's own SDK already handles login and token refresh on the client. `middleware.Auth`
verifies the `Authorization: Bearer <id token>` header on every request and stashes the verified
identity in context; it does not itself reject unauthenticated requests, since GraphQL serves
public and authenticated fields behind one endpoint — resolvers that need a caller check for the
identity themselves and error if it's absent (only `me` does, this milestone).

### Schema change: `users` collection

Drops `password_hash` and `email_verified_at` (docs/02 §2.1's fields for the unbuilt custom auth).
Adds `firebase_uid` (unique-indexed, the identity key) and a denormalized `email` (display/lookup
only, never the auth credential — a payment's email is what the Polar webhook matches against it).
`subscription { status, polar_customer_id, polar_subscription_id, current_period_end }` holds
Polar-sourced entitlement state; a nil subscription or a non-`"active"`/`"trialing"` status reads
as free tier (`internal/feature/user`'s `User.Plan()`).

### What's built

- `notes-maker-api/` — `cmd/api` (public GraphQL + webhook, `:8080`) and `cmd/adminapi` (placeholder,
  `:8081`, returns 501 — no admin frontend exists yet either, P2.8).
- `internal/graph` — gqlgen (schema-first, §10.15's chosen library), schema is the
  `Query.me { id, email, displayName, plan }` subset of §10.15's full sketch. Notes/sync/labels
  fields are not implemented; adding them is the next milestone, not a rewrite of this one.
- `internal/feature/user` — `Service.GetOrCreateByFirebaseUID` (creates a `users` doc on first
  sign-in, returns the existing one after), `Service.SetSubscription` (applied by the webhook).
  Tested against an in-memory fake `Repository`, not a real Mongo connection, per this project's
  own testing philosophy.
- `internal/feature/billing` — `POST /webhooks/polar`, plain REST (webhooks are provider-initiated,
  outside the GraphQL schema per §10.15). Verifies the Standard Webhooks-style signature Polar
  sends (`webhook-id`/`webhook-timestamp`/`webhook-signature` headers, HMAC-SHA256, 5-minute clock
  skew tolerance) before touching anything. **The exact payload field names
  (`data.customer.email`, `data.status`, etc.) are inferred, not confirmed against a real Polar
  webhook delivery** — verify them against Polar's dashboard/docs before pointing this at a live
  product.
- `docker-compose.yml` (workspace root) — single-node Mongo replica set (required for later
  multi-document transactions even with one node) + Mongo Express, local dev only.
- Frontend: `src/features/plan/remote.ts`'s `checkRemotePlan()` is no longer a stub — it calls
  `POST {NEXT_PUBLIC_API_URL}/graphql` with `{ me { plan } }` and a Firebase ID token
  (`src/features/auth/firebase.ts`'s new `getIdToken()`), mapping `"PREMIUM"`/anything else to the
  existing `PlanTier` type. Unset `NEXT_PUBLIC_API_URL`, a missing token, a non-OK response, or any
  parse failure all resolve to `"free"` rather than throwing — `usePlan()`'s existing grace/cache
  logic already treats a failed check as "leave the cache alone," not "downgrade now."

### The linking limitation (stated honestly, not solved this pass)

`SetSubscription` resolves a Polar payment to an account by matching `data.customer.email` against
an existing `users.email`. That only works for a payer who **already has a Firebase account under
that email** at the moment the webhook arrives. A payment from an email with no matching account
returns `ErrNotFound`; the webhook handler acks it with `200` anyway (so Polar doesn't retry
forever) and the payment is simply not linked to anything. There is no invite/claim flow to recover
that case yet — a real gap, not an oversight, and it should be closed before
`NEXT_PUBLIC_POLAR_CHECKOUT_URL` points at a live product for real customers.

**Resolved as of §10.20**: the Polar→Paddle switch replaces email matching with
`custom_data.firebase_uid`, passed at checkout and echoed back in the webhook, closing this gap
entirely rather than just documenting it.

### What's still not built (unchanged sequencing from §10.15's "not decided here")

Notes CRUD + `client_id` idempotency + `base_rev` conflicts (P2.3) → delta sync (P2.4, docs/04) →
images/R2 (P2.5) → push/reminders (P2.6) → a real `cmd/adminapi` + `notes-maker-admin/` (P2.8). No
production deployment target has been chosen for `notes-maker-api` — this milestone is local-dev
only (`docker compose up -d mongo && go run ./cmd/api`), matching docs/01 §1.9.

## 10.18 Backend milestone 2: the notes sync API (2026-07-30)

**P2.3 is built, server-side.** `notes-maker-api` now serves the notes half of docs/04: a cursor
pull, a batched push with `client_id` idempotency and `base_rev` conflict resolution, and note
content sealed at rest. No client consumes it yet — the sync engine in `notes-maker-web` is the
next milestone, and until it exists nothing about the shipped app changes.

Sequencing note: this was built ahead of the docs/00 §0.7 validation gate, deliberately. The gate
asks whether to build a *paid tier at all*; §10.16/§10.17 already answered that by wiring real
checkout and real entitlement. What was left was a Premium plan promising sync it did not have
(§10.7's comparison table, rendered in `purchase-plan-dialog.tsx`), which is the actual blocker to
charging anyone. Analytics — the thing that would *measure* the gate — is sequenced after payments
go live, at the maintainer's call; the cost of that ordering is recorded in the plan file rather
than hidden here: the first cohort of paying users arrives unmeasured.

### Encryption at rest, and the E2E seam

Note content — `title`, `body`, `body_text`, `checklist` — is sealed into one opaque `payload`
field (AES-256-GCM, `internal/platform/crypto`) rather than stored as readable fields. Metadata
(`color`, `pinned`, `archived`, `labels`, `reminder`, `completed_at`) stays in the clear because it
drives indexes and reveals nothing about what a note says.

The key comes from `NOTES_ENCRYPTION_KEY`, a keyring: comma-separated `<version>:<base64>` entries,
highest version seals new writes, older keys stay available so documents already written still
open. Notes re-seal lazily on their next edit. **Losing every key in that variable loses every
synced note**, by construction — it is backed up wherever the other production secrets are.

The payload is bound to `(user_id, client_id)` as GCM additional data, so a ciphertext lifted from
one note into another — or into another account's note — fails to open rather than silently
decrypting.

This is the seam for the E2E decision below. A future E2E client seals content itself and hands the
server ciphertext; the server stores what it is given and stops calling `Seal`. The document shape
and the GraphQL contract do not change on that day — only who holds the key. That is why `content`
crosses the wire as one serialized JSON string rather than as separate GraphQL fields.

**Two costs, accepted rather than discovered later:**
- Server-side full-text search is impossible while the payload is sealed. Search stays local over
  Dexie, which is where it already lives and works (docs/08).
- Field-level conflict merge works *today* only because the server holds the key and can open the
  blob. That is precisely what breaks under real E2E, where conflicts would degrade to whole-note
  conflicted copies.

### Encryption: decided, with the contingency reasoning recorded

E2E was considered and deferred. The scheme initially floated — the server holding a backup key
alongside the user — was rejected outright: if the system can decrypt, it is not E2E, and it would
buy all of E2E's complexity with none of its guarantee while being unmarketable as zero-knowledge.

The real obstacle is that Firebase Auth with Google Sign-In leaves most users with **no password to
derive a key from**, so genuine E2E forces a second passphrase at signup on an app whose pitch is
zero friction — and a Firebase password reset would not recover the data, which users would
reasonably expect it to. HSM-backed key escrow with a rate-limited PIN (what Apple and WhatsApp do)
solves this properly and costs on the order of $1,000/month in HSMs, which is not defensible at
$2/user/month.

**Roadmapped instead:** passkey-PRF-derived keys as a Premium "private vault", once there is
revenue to justify it. WebAuthn's `prf` extension derives a stable secret from a passkey held in
iCloud Keychain or Google Password Manager, so recovery is inherited from an account the user
already knows how to recover, with no second passphrase. It needs a recovery-code fallback for
browsers without PRF support.

### Conflict resolution: what's implemented, and where it approximates docs/04 §4.5

Each note carries a `rev_log` — the last 20 revisions and which fields each changed. That is what
makes rule 1 (disjoint-field merge) possible at all: to merge, the server has to know which fields
*it* changed since the pushing device's `base_rev`. Beyond that depth the history is gone and a
stale push degrades to an honest conflict rather than a guess.

- **Disjoint fields merge** (rule 1) — only the pushing device's changed fields are replayed onto
  the server's version.
- **Metadata-only overlap resolves to the pushing device**, which is rule 2's spirit: metadata is
  cheap to redo, content is not.
- **Overlapping content edits conflict** (rule 3) — the server's version is returned and the client
  keeps its own as a conflicted copy. Nothing is discarded server-side.
- **Checklists union by item id** when only `checklist` overlaps. Items on both sides take the
  pushing device's version; items on either side alone are kept. An item deleted on one device
  therefore comes back if the other still has it — a duplicate line is a mild annoyance, a vanished
  one is not.

Two honest approximations: per-item `checked` is resolved by "the pushing device wins" rather than
a true per-item timestamp, because items carry no timestamps; and `order` values can collide after
a union, left for the client to settle by sorting on order then position.

`base_rev: 0` is an **upsert**, not a conflict — it means the device has never seen a server copy,
which is a create or a retry of one whose response was lost. That is what makes a retried create
idempotent, backed by the unique `(user_id, client_id)` index rather than by application logic.

### Trash vs delete-forever

`deleted` writes a tombstone that **keeps** its payload, so restoring from trash on another device
still recovers the content. `purged` writes a tombstone with the payload **dropped**. Both sync as
ordinary documents so every device learns of the deletion. Server-side purge of expired tombstones
(docs/10 §10.8's "server-side for synced notes") is a worker and is not built.

### What's built

- `internal/feature/note/` — `Repository` + `MongoRepository` + `Service`, tested against an
  in-memory fake per this project's testing philosophy, plus a Mongo-backed `integration_test.go`
  that skips unless `MONGO_TEST_URI` is set (it covers what a fake cannot: the real indexes, the
  unique constraint, cursor paging over a real `Find`).
- `internal/platform/crypto/` — the keyring, seal/open, and key rotation.
- `migrations/0002_notes_indexes.go` — unique `(user_id, client_id)`, and `(user_id, updated_at,
  _id)` for the cursor. The `_id` tiebreak is not optional: a cursor on `updated_at` alone silently
  skips notes written in the same millisecond.
- GraphQL `Query.notes(cursor, limit)` and `Mutation.pushNotes(mutations)`, both **premium-gated**
  via `user.User.Plan()` — the tier boundary of docs/01 §1.0, not a soft upsell. The 100-item cap
  (§10.14) is enforced server-side too, matching the client's `countActiveNotes` exactly: archived
  and trashed items don't count, because archiving must stay a legitimate way to make room
  (docs/00 §0.6).
- `internal/graph/root.go` — the `Resolver` struct and helpers now live outside the gqlgen-managed
  `resolver.go`, which codegen rewrites.
- gqlgen is a proper `tool` dependency in `go.mod`. It previously could not be run at all: its
  codegen deps had been pruned from `go.sum`, so `gqlgen generate` failed on a fresh checkout.

### Fixed in passing: the local Mongo replica set was unreachable from the host

`docker-compose.yml` initiated the replica set with the Compose service name (`mongo:27017`). A
member address is what the driver connects to *after* topology discovery, so from the host — where
`go run ./cmd/api` actually runs — the connection hung until timeout. Production already learned
this (`deploy/init-replica-and-user.sh` uses `127.0.0.1`); the dev file had not. It now matches,
with `mongo-express` switched to `directConnection=true` since it can no longer reach the member
address by that name. `mongo-express` also now depends on the initiator completing, so the
README's `docker compose up -d mongo mongo-express` can no longer leave an uninitiated set behind —
which it previously did every time, since naming services skips the one-shot init container.

### What's still not built

The **client sync engine** (P2.4) — nothing in `notes-maker-web` calls these fields yet, and
`features/storage/remote.ts` is still the stub that reports zero remote notes. Then images/R2
(P2.5) → push/reminders (P2.6) → `cmd/adminapi` + `notes-maker-admin/` (P2.8). Labels remain
client-side strings; the `labels` collection of docs/02 does not exist.

## 10.19 Client milestone: the sync engine (P2.4)

`notes-maker-web/src/features/sync/` now consumes §10.18's API. Premium accounts sync notes across
devices; free accounts are untouched, and their notes still never leave the browser (docs/01 §1.0).

### Pull, then push — and why that order

Push carries each note's `base_rev`, which is what the server uses to work out which fields *it*
changed since. Pulling first keeps those base_revs current, so two devices editing different fields
merge silently instead of colliding. The cursor advances only after a page is fully applied, so an
interrupted pull resumes rather than skipping.

### The rules that stop sync eating someone's work

- **A note with unsent edits is never overwritten**, not by a newer server version and not by a
  tombstone. A note deleted on one device and edited on another comes back; the local edits then
  push normally and the server decides (docs/04 §4.3).
- **`_base_rev` is not advanced for a dirty note.** It records the revision the local edits were
  made against; moving it to the server's newer revision would tell the server those edits already
  account for changes they have never seen, turning a merge into a silent clobber.
- **A mid-flight edit keeps the note dirty.** If the row changes while the push is in flight, the
  response cannot be allowed to clear the flag — that would strand an edit the server has never
  seen. `base_rev` still advances, because the accepted revision does contain what was sent.
- **Conflicts fork rather than choose.** The server's version keeps the note's identity; the local
  version becomes a separate, labelled copy carrying `conflict_of`, with a quiet dismissible banner
  (docs/04 §4.5 rule 3, §4.7). Never a modal, never a merge UI.

### `_dirty_fields`, and why there is no outbox

docs/04 §4.2 specifies a separate `outbox` store. It was not built, and does not need to be: every
write path in `note-repo.ts` already set `_dirty`, and `_dirty` was already indexed. One additive
field — `_dirty_fields`, populated from the patch keys `updateNote` already receives — buys
§4.5 rule 1's disjoint-field merge without a second store or a schema migration (docs/08 §8.1).

Absent or empty is read as "everything changed", which is the safe direction: it can cost an
unnecessary conflict, never a lost edit.

### Deleting forever needed its own queue

Trashing rides on the surviving row. Deleting forever removes the row, and a row that no longer
exists cannot carry a mutation — so without `storage/purge-queue.ts` the next pull would receive the
server's still-live tombstone and resurrect the note the user had just destroyed. The queue is
written unconditionally by every hard-delete path: note-repo has no business knowing the plan, and a
free user who subscribes later should not have their pre-subscription deletions come back. It is
bounded at 500 ids, since a free user never drains it.

This is also why `Note.purged` was added to the schema: an empty note sitting in trash is otherwise
indistinguishable from one whose payload was dropped, and the two must not be handled alike.

### Scheduling (docs/04 §4.6)

App start, `online`, regaining visibility if the last sync is older than 30s, a 60s heartbeat, and a
2s debounce after a local write. The heartbeat is torn down when the tab hides and rebuilt when it
returns, rather than firing into a hidden tab and returning early — on mobile a background heartbeat
is a battery complaint. Backoff is 1/2/4/8/16/30s with jitter, and **only** for reachability
failures: a refusal ("premium required") would answer identically however long we wait, so it stops
and says so instead.

Writes are noticed through Dexie's own `useLiveQuery`, not by note-repo announcing them. The repo
still does not know a network exists (docs/01 §1.5).

Rejected mutations are dropped rather than retried forever, and surfaced in Settings → Sync with the
server's reason — "note cap of 100 reached" is something a user can act on (docs/04 §4.4, §4.6).

### Contract test between the two halves

`internal/graph/contract_test.go` reads the client's actual query strings and validates them against
the server's schema, and fails if a `Note` field exists that the client never asks for. The Go
module lives in this repo precisely so an API change and its clients land in one commit; nothing
enforced that until now. A renamed field used to compile and type-check on both sides and fail only
at runtime — which, since sync is premium-only, means failing first for a paying customer.

### Not built, deliberately

- **Background Sync API registration** (§4.6's last bullet). It needs service-worker coordination
  with `sw.js`, which is hand-written (docs/07 Stage A); the 2s debounce plus the on-open sync covers
  the same ground for a tab that stays open.
- **Attachments do not sync** (P2.5). A conflicted copy therefore carries no attachments — they are
  keyed by note id, and duplicating blobs for something the server has never heard of would consume
  quota. The original keeps them.
- **Labels** remain client-side strings.
- **The two halves have never talked to each other.** Both sides are covered by their own tests and
  by the contract test above, but there is no end-to-end run: `cmd/api` cannot boot without Firebase
  Admin credentials, which are not provisioned locally. Stage 3's test-mode subscription run is the
  first time real client and real server will meet.

## 10.20 MoR switch: Polar → Paddle (2026-08-01)

**Trigger**: Polar locked the account and deemed the decision final/unappealable — no dispute path
exists. The integration had to move to a different MoR before any real product launch, since
`NEXT_PUBLIC_POLAR_CHECKOUT_URL` had never been set in production (confirmed: it was never even
added to `ci.yml`'s `deploy-web` build-env block), so this was a pre-launch cutover, not a live
migration — no existing paying subscribers to carry over.

**Provider**: Paddle, exactly the fallback §10.10 pre-agreed ("if either check fails the fallback
is Paddle with no architectural change") — still an MoR, so the original VAT/tax/chargeback
reasoning in §10.10 holds unchanged. Xendit (a payment gateway, not an MoR) was considered and
ruled out for the same reason Stripe was originally ruled out: it would push global tax/GST
registration liability back onto a solo seller. Price stays **$2/month USD** — Paddle does not
support IDR as a checkout currency, ruling out a currency pivot alongside the (separate,
already-completed) switch of the site's default locale to Indonesian.

**What actually changed, beyond the provider name**:

- **Checkout**: no more static Checkout Link. `src/features/billing/paddle.ts` calls
  `Paddle.Checkout.open()` (a Paddle.js overlay) instead of building a redirect URL — still no
  backend secret needed pre-payment, just a JS SDK call instead of an `<a href>`. `PaddleLoader`
  (`src/features/billing/paddle-loader.tsx`) loads the SDK globally, mirroring
  `shared/ads/adsense.tsx`'s "absent config renders nothing" shape.
- **Webhook auth**: Paddle's `Paddle-Signature: ts=...;h1=...` header (HMAC-SHA256 over
  `"{ts}:{rawBody}"`, hex-encoded) replaces Polar's Standard Webhooks scheme — simpler, single
  signature, no key-rotation multi-entry format.
- **Account linking, genuinely improved, not just ported**: Paddle's subscription webhooks carry no
  customer email, only `customer_id`. Rather than adding an extra API call to fetch it, checkout now
  passes `customData: { firebase_uid }`, which Paddle copies onto the subscription and echoes back in
  every webhook. `SetSubscription` resolves the account via the already-existing
  `Repository.FindByFirebaseUID` (the same lookup `GetOrCreateByFirebaseUID` already used) instead of
  `FindByEmail`. Since every payer is necessarily signed in already to reach the Subscribe button,
  this closes §10.17's "linking limitation" entirely — there is no more "payment from an unmatched
  email" case, only the much narrower "account deleted between checkout and webhook delivery."
- **Schema**: `users.subscription.polar_customer_id`/`polar_subscription_id` renamed to
  `paddle_customer_id`/`paddle_subscription_id`. No migration script: `UpdateSubscription` does a
  whole-subdocument `$set`, so the next webhook for any account self-heals the field names, and
  nothing reads the old keys. Safe specifically because there were zero real subscribers to strand.
- **Route**: `/webhooks/polar` → `/webhooks/paddle`, removed and added in the same commit — no
  dual-mount window needed, since Polar is locked and can never deliver another webhook.

**Manual/operational steps** (not code): create the Paddle product/price and a notification
destination in the Paddle dashboard, add the three `NEXT_PUBLIC_PADDLE_*` values as GitHub Actions
secrets (learning from the fact that `NEXT_PUBLIC_POLAR_CHECKOUT_URL` never made it into that list),
set `PADDLE_WEBHOOK_SECRET`/`PADDLE_API_KEY` by hand in the VPS's `api.env`, run a sandbox dry run
end to end before pointing the dashboard at production, then revoke the old `POLAR_API_KEY` at
Polar's dashboard.
