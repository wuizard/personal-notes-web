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
| Checklists | Not a distinct type | First-class type, **unlimited on both tiers** |
| Quick capture | Blank input | **Suggestions ranked by the user's own frequent entries** |
| Reminders | Free = in-app only | **Daily/weekly local notifications offline** (best-effort, see §10.4); paid = **guaranteed via FCM** |
| Backend | Go 1.26 + MongoDB (Phase 2) | **Unchanged** — Go + MongoDB confirmed (a Django switch was considered and rejected, §10.5) |
| Auth | Deferred entirely | **Profile/login now**, Google Sign-In via Firebase Auth |
| Pricing | Rp 15–20k monthly / Rp 150k annual recommended | **Fixed $2/month per user** |
| Free note cap | 20–25 recommended (§0.8) | **5 notes** (checklists uncapped) |
| Paid note cap | Unlimited | **100 notes**, 5 images |
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
- **Checklists are unlimited on both tiers.** Only *notes* count against the note cap (§10.7).
  This keeps the free tier genuinely useful as a to-do app while notes remain the upgrade lever.

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
| Notes | **5** | **100** |
| Checklists | **Unlimited** | **Unlimited** |
| Images | **1 per note** | **5 per note** — at the 100-note cap that is a hard ceiling of **500 images per account** |
| Ads | **Shown when online** (never inside notes — docs/00 §0.4 rules stand) | **None** |
| Sync / multi-device | No | Yes |
| Reminders | Local best-effort (§10.4) | Guaranteed via FCM, per-device |
| Sign-in | Optional — feedback + settings | Required |

Ads follow docs/00 §0.2 as already planned: free tier only, feature-flagged, and only when online —
the offline app never holds a blank ad slot.

Overriding two explicit recommendations in docs/00, recorded here so the reasoning isn't lost:

- **§0.8 argued 5 notes is too tight** (cap should bite after the habit forms). Decision: keep 5 —
  the unlimited-checklist tier is the habit-forming surface now, which materially weakens the old
  objection. The cap stays a single config constant so real data can still move it.
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
Firebase keys; unset in any environment, the component renders nothing. Ad *unit* placement
(where `<ins class="adsbygoogle">` slots actually sit on the page) is not decided yet — this stage
only wires the loader.
