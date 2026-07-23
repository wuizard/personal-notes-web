# 6. UX specification

The product promise is **capture in under two seconds**. Every decision below is downstream of
that. If a change makes note creation slower, it loses, regardless of what else it improves.

## 6.1 Screens

```
/                     marketing (SSR, not in the mobile bundle)
/login  /register     auth
/app                  notes grid — the home screen
/app/search           search results
/app/labels/:id       filtered by label
/app/reminders        upcoming reminders, grouped by day
/app/archive          archived
/app/trash            deleted, with days-remaining
/app/settings         account, appearance, reminders, sync, data
```

Layout: a persistent left sidebar on desktop (collapsible to icons), a bottom tab bar on mobile,
a top bar carrying search and the account menu. Standard, and standard is right — nobody wants
to learn a novel navigation to write down a phone number.

## 6.1a Desktop layout: master-detail (supersedes the modal editor below)

**Decided during Stage B.** Desktop is three panes — nav rail, note list (~336px), editor —
in the manner of Evernote and Apple Notes, not Keep's centred grid with a modal editor.

Why: reading and editing a note while the rest of the library stays visible is the point of a
desktop window. A centred dialog hides the list at exactly the moment you want to move between
notes, and a centred compose bar floating in an empty page reads as unfinished.

Two consequences, both accepted:

- **The masonry grid ([docs/05 §5.8](05-design-system.md)) does not apply on desktop.** A 336px
  list pane cannot be masonry. The grid may return later behind a view toggle; it is not v1.
- Capture moves to the **top of the list pane**, where it is anchored to the library it joins.

Mobile is unchanged and single-pane: the list fills the screen, and tapping a note opens the
editor full-screen. Selection lives in `?note=<client_id>` so the editor is linkable and the
**system back button closes it** rather than leaving the app.

## 6.2 The capture flow

This is the app. Everything else is support.

**Desktop.** A collapsed input sits at the top of the list pane: *"Take a note…"*, with three
trailing icon buttons — checklist, image, reminder. Clicking it (or pressing `c` anywhere)
expands it **in place**; the new note then opens in the editor pane. It never opens a modal.

Clicking outside, pressing `Esc`, or pressing `Cmd+Enter` closes it. Closing saves. There is no
Save button, because there is nothing to save — the note was written to IndexedDB on the first
keystroke.

An empty note is discarded silently on close. No "your note was empty" toast; the user knows.

**Mobile.** A floating action button, bottom-right above the tab bar, opens a full-screen editor
with the keyboard already up and the cursor in the body — not the title. People type the content
first and title it later, if ever. Three smaller satellite buttons on long-press: checklist,
photo, voice.

**Choosing the note type is not a step.** Starting to type gives a text note; tapping the
checklist icon converts what is already there into checklist items split by newline. Conversion
works both ways and is lossless.

## 6.3 The note card

Shows: title (2 lines), body preview (8 lines) or up to 6 checklist items with a "+4 more",
label chips (2, then "+n"), a reminder chip when set, and an image thumbnail strip.

A row of actions — pin, archive, delete — sits at the bottom of each list row. It is **visible by
default and hidden-until-hover only where a real pointer exists**, gated on
`@media (hover: hover) and (pointer: fine)` rather than a width breakpoint: a touch laptop or a
tablet has a wide screen and no hover, and a width-based guess hides the actions with no way to
reveal them. Hiding uses opacity, not `display`, so the buttons stay in the tab order and
`:focus-within` reveals them for keyboard users.

Clicking a row opens it in the editor pane (desktop) or full-screen (mobile) — see §6.1a.

A note with an overdue reminder gets a warning-toned chip. A conflicted copy gets a dismissible
inline banner. Neither uses colour alone.

## 6.4 Editing

- Autosave to IndexedDB on every keystroke; debounced 600ms into the outbox.
- Also flush on blur, on `visibilitychange` → hidden, and on `pagehide`. **Not** `beforeunload` —
  it does not fire reliably on mobile Safari, which is precisely where the tab gets killed.
- Undo/redo is Tiptap's history, scoped to the editing session, `Cmd+Z` / `Cmd+Shift+Z`.
- The toolbar carries only: bold, italic, strikethrough, H1/H2, bullet list, checklist, link,
  code, image. Markdown input rules work as you type (`# `, `- `, `[] `, `**bold**`). Anything
  more is Evernote's mistake — the toolbar grows until capture feels heavy.
- Paste of an image uploads and inlines it. Paste of a URL on selected text makes a link.
- Character counter appears only past 90% of the 100 KB limit.

## 6.5 Destructive actions and undo

Every destructive action is **optimistic + undoable**, never confirmed with a dialog:

- Archive → card animates out, toast *"Note archived"* + **Undo**, 6 seconds.
- Delete → moves to trash, same pattern. Trash auto-purges after 30 days, shown per note.
- Empty trash → this one **does** confirm, because it is the only unrecoverable action.

Confirmation dialogs on recoverable actions train people to click through them, which is exactly
what you do not want by the time they reach the one that matters.

## 6.6 Keyboard

Desktop should be fully operable without a mouse.

| Key             | Action                        |
| --------------- | ----------------------------- |
| `c`             | Compose                       |
| `/` or `Cmd+K`  | Search / command palette      |
| `j` `k`         | Move selection in the grid    |
| `Enter`         | Open selected                 |
| `e`             | Archive selected              |
| `#`             | Delete selected               |
| `p`             | Pin / unpin                   |
| `l`             | Label picker                  |
| `r`             | Reminder picker               |
| `Cmd+Enter`     | Save and close editor         |
| `Esc`           | Close editor / clear search   |
| `g` then `n/a/t/r` | Go to notes/archive/trash/reminders |
| `?`             | Shortcut cheat sheet          |

`Cmd+K` is a real command palette — actions, labels, and note titles in one list. It is the
fastest path for power users and costs one component.

## 6.7 Reminders

Setting one: a picker with **Later today / Tomorrow 9am / Next week / Pick date & time**, plus
a repeat row. Preset-first, because 90% of reminders are one of the first three, and a date
picker as the first thing you see makes the common case slow.

**Firing differs by tier, and the UI must be honest about it** ([docs/00 §0.2](00-business-model.md)):

- **Free — in-app only.** A `Notification` fires while a tab is open; otherwise the reminder surfaces
  in an "Overdue" group the next time the app opens. True background delivery needs a push server,
  which needs an account and costs money per user.
- **Paid — real Web Push.** Titled with the note title, body preview as the message, two actions —
  **Done** and **Snooze 10m** — both handled in the service worker without opening the app. Tapping
  the body deep-links to the note.

Say this at the moment of setting, in one quiet line under the picker: *"Reminders appear when you
open the app. Get notified even when it's closed →"*. **Do not let a free user believe a reminder
will wake them up.** They will miss something that matters, and they will correctly blame you. This
is the single most important honesty requirement in the product.

The `/app/reminders` screen groups by Overdue / Today / Tomorrow / This week / Later.

Permission is requested **the first time a user sets a reminder** — never on first load. A cold
permission prompt gets denied, and browsers make that decision permanent and near-impossible for
a user to reverse. Ask when the request is obviously motivated, and show a soft in-app
explanation before triggering the native prompt.

## 6.8 Search

Instant, debounced 200ms, local-first: IndexedDB results appear immediately, server results
merge in when they arrive. Matches are highlighted in title and preview.

Filter chips below the input: label, colour, has reminder, has image, in archive/trash. Recent
searches when the field is empty and untouched.

## 6.9 Empty and error states

Every list has a real empty state with an illustration, a sentence, and the action that fills it:

- Notes — *"Nothing here yet. Your first note is one keystroke away."* + **Take a note**
- Search — *"No notes match 'xyz'."* + clear-filters
- Archive — *"Archived notes stay out of your way but stay searchable."*
- Trash — *"Notes here are deleted after 30 days."*
- Offline with empty cache — *"You're offline and this hasn't synced yet."* + Retry

Errors are inline and specific, never a full-page crash for a recoverable failure. An unexpected
error shows the `X-Request-Id` with a copy button.

## 6.10 Loading

Skeletons matching the real card geometry, never spinners, never layout shift. On a warm start
the grid renders from IndexedDB in one frame and there is no loading state at all — which should
be the case for essentially every launch after the first.

Perf budgets, enforced in CI with Lighthouse:

| Metric                     | Budget  |
| -------------------------- | ------- |
| LCP (warm, 4G)             | < 1.2 s |
| INP                        | < 200ms |
| CLS                        | < 0.02  |
| JS on `/app` (gzip)        | < 180 KB |
| Time to interactive, cold  | < 2.5 s |

Tiptap and the image pipeline are dynamically imported — they are not needed to render the grid,
and the grid is what people see on launch.

## 6.11 Admin panel UX (Phase 2)

Deliberately plain. Same pastel tokens for consistency, but dense, table-first, no illustration.

- **Users** — table with email, name, status chip, note count, storage, last active, created.
  Server-side search, filters, cursor pagination, sortable columns. Row click → detail drawer.
- **User detail** — metadata, sessions with revoke, actions (suspend / unsuspend / logout-all /
  schedule deletion). Suspend and unsuspend require a typed reason before the button enables.
  **No note content anywhere** ([§1.7](01-architecture.md)).
- **Overview** — DAU/WAU, signups, notes created, reminders fired, push failure rate. Sparklines,
  from the pre-aggregated rollups.
- **Audit** — filterable, exportable to CSV, immutable.

Destructive admin actions confirm by typing the user's email. Here the friction is correct: the
operator is acting on someone else's data, and there is no undo.

---

# Free-tier UX (v1)

## 6.12 First run — no account, no wall

A first-time visitor lands directly in the app with the compose bar focused. **No signup screen, no
tour, no modal, no cookie-consent wall before they can type.** The entire competitive advantage over
Keep at this moment is that there is nothing between the user and writing something down.

What happens instead, in order:

1. They type a note. It saves locally, instantly.
2. **After that first save**, a single quiet line asks to keep the data safe —
   this is where `navigator.storage.persist()` is requested
   ([docs/08 §8.3](08-local-storage.md)). Asking on load gets a reflexive deny.
3. Nothing else until the 10th note, when the first backup nudge appears.

Locale is detected from the browser and switchable in Settings, defaulting to `id` for Indonesian
locales and `en` otherwise.

Because there is no account, **Settings is where identity would normally be** — and it must make the
data situation legible: where notes are stored, how much space they use, whether persistence was
granted, and a prominent Export button.

## 6.13 The note cap

The cap number lives in one config constant ([docs/00 §0.8](00-business-model.md) — 5 is likely too
tight; 20–25 is the recommendation).

- At **80% of the cap**, an inline row appears above the grid: *"18 of 25 notes."* Informational, no
  call to action yet.
- At **100%**, the compose bar stays visible but disabled, with the upgrade prompt from
  [docs/05 §5.12](05-design-system.md) directly beneath it.
- **Existing notes remain fully editable, searchable, and exportable.** Always. Archiving or deleting
  a note frees a slot immediately.

Never hide the count until the wall is hit. A cap that arrives as a surprise reads as a bait and
switch; a cap the user watched approaching reads as a fair limit.

## 6.14 Storage, backup, and eviction

Settings → Data shows: notes count, storage used against `estimate()`, persistence state, last export
date, and Export / Import buttons.

**Backup nudge** — after the 10th note, then at most monthly. One dismissible line offering Export.
Never modal.

**80% quota** — `warning`-toned banner. Leads with Export, mentions upgrading second. New image
attachments are blocked; **text notes continue to work**, because someone who cannot jot a phone
number down because their photos filled the disk simply leaves.

**Eviction detected** ([docs/08 §8.3](08-local-storage.md)) — the one modal in the free tier:

> **Your notes were removed by your browser**
> Browsers sometimes clear stored data to free up space. This wasn't something you did.
> [Restore from backup] [Start fresh]

Apologise, offer import, and only then mention that an account prevents it. Leading with the upsell
immediately after losing someone's data is the wrong instinct and reads as opportunistic.

## 6.15 Ads

Two units: sidebar (below nav) and one between the pinned and other grid sections. Styling and the
anti-confusion rules are in [docs/05 §5.11](05-design-system.md).

Behavioural rules:

- **Height is reserved before load.** No layout shift, ever — especially not while someone is typing.
- No ads in the editor, in Settings, or on the reminders screen. Capture and configuration stay clean.
- No ads before the user's first note. A brand-new visitor sees the product, not inventory.
- Behind a feature flag, so the effect on paid conversion can actually be measured
  ([docs/00 §0.4](00-business-model.md)).

## 6.16 The waitlist

Where an upgrade prompt would lead to checkout in Phase 2, in v1 it leads to an email capture:

> **Cloud sync is coming**
> Your notes on every device, reminders that work when the app is closed, and never losing anything.
> Around Rp 15.000/month. Tell us where to reach you.

One field, one button, honest about not existing yet. This is the cheapest possible test of whether
the paid tier is real ([docs/00 §0.7](00-business-model.md)) — and it must be genuinely easy to
dismiss, because a user annoyed into leaving tells you nothing.
