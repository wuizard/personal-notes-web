# 5. Design system

Calm, soft, paper-like. Pastel as the *content* colour, near-neutral as the *chrome*. The app
should feel like a desk covered in coloured index cards, not like a colourful app.

## 5.1 The one rule that makes pastel work

**Pastel belongs to notes. Everything else is quiet.**

Sidebar, toolbar, dialogs, and buttons stay near-neutral. If the chrome is also pastel, the notes
stop standing out and the whole screen turns to mush — this is the single most common way a
pastel UI fails. The user's content provides the colour; the app provides the paper.

Exactly one accent colour exists (soft indigo) and it is used only for focus rings, the primary
button, and active navigation.

## 5.2 Note palette

Ten note colours. All ten are light enough in light mode to carry `#2E2A33` ink at well over
7:1 contrast, and all ten dark-mode variants carry `#EDE9F2` at over 9:1. That is not a
coincidence — it is the constraint the palette was built to satisfy, so no note is ever hard to
read.

| Token        | Light     | Dark      | Feel        |
| ------------ | --------- | --------- | ----------- |
| `paper`      | `#FFFFFF` | `#1E1B24` | default     |
| `blush`      | `#FFE4EC` | `#43303A` | warm pink   |
| `peach`      | `#FFE8D6` | `#45362A` | apricot     |
| `butter`     | `#FFF6D1` | `#423D26` | soft yellow |
| `sage`       | `#E2F0DF` | `#2C3B2E` | muted green |
| `mint`       | `#D9F2EA` | `#263B38` | cool green  |
| `sky`        | `#DDEBFB` | `#26354A` | pale blue   |
| `periwinkle` | `#E4E4FA` | `#2F2E4A` | blue-violet |
| `lilac`      | `#F2E3F7` | `#3B2C44` | soft purple |
| `clay`       | `#EFE6DC` | `#3A332C` | warm grey   |

Dark-mode variants are **hue-preserving desaturated darks**, not algorithmically darkened
pastels. Programmatic darkening turns pastels muddy and identical to each other; a user who
colour-codes their notes loses that system entirely in dark mode. These were picked by hand.

Note borders in light mode are `rgba(46,42,51,0.08)` — pastel cards on a white background need a
faint edge or they dissolve. In dark mode, cards are lifted by background lightness alone, no
border.

## 5.3 Neutrals and accent

```
ink            #2E2A33   primary text (light)      on paper 13.9:1
ink-muted      #6B6472   secondary text            on paper 5.6:1
ink-subtle     #948CA0   timestamps, placeholders  on paper 3.2:1 — decorative/large only
line           #E8E4EE   dividers, input borders
canvas         #FAF9FB   app background (light)  — never pure white behind white cards
surface        #FFFFFF   cards, sheets, menus

accent         #6B5FD6   fills, active states
accent-text    #5B4FCF   accent used as text on light   6.3:1
accent-soft    #EEEBFC   selected rows, hover
focus          #6B5FD6   2px ring, 2px offset

danger         #D6455E   destructive
success        #3F9E77   sync-ok, saved
warning        #C98A2E   reminder due
```

Dark mode: `canvas #141118`, `surface #1E1B24`, `ink #EDE9F2`, `ink-muted #A79FB4`,
`line #302B38`, `accent #9B90F0` (lightened so it stays legible on dark).

`ink-subtle` fails 4.5:1 deliberately and is therefore restricted to non-essential text at 14px+
— never for anything a user must read to operate the app.

## 5.4 HeroUI theme

**HeroUI v3 requires Tailwind v4 and is CSS-first — there is no `tailwind.config.ts`.** (An earlier
draft of this document specified a v2-style JS plugin config; that was wrong and is corrected here.
HeroUI is fixed; Tailwind is pinned to whatever HeroUI's peer range requires, never the reverse.)

HeroUI v3's token vocabulary is also different from v2: there is no `primary` or `content1-4`.
It uses `background` / `surface` / `foreground` / `default` / `accent` / `border` / `focus`, each
with `-foreground`, `-hover`, and `-soft` variants. It registers all of them as Tailwind colours via
its own `@theme inline`, so **overriding the raw CSS variable also updates every utility**
(`bg-surface`, `text-foreground`, `border-border`, …).

```css
/* src/app/globals.css */
@import "tailwindcss";
@import "@heroui/styles";

/* Unlayered on purpose: HeroUI defines its tokens inside `@layer theme`, so
   plain selectors here win the cascade without !important. */
:root,
[data-theme="light"] {
  color-scheme: light;
  --background: #faf9fb;   /* canvas */
  --surface: #ffffff;      /* cards */
  --foreground: #2e2a33;   /* ink */
  --muted: #6b6472;        /* ink-muted */
  --border: #e8e4ee;       /* line */
  --accent: #6b5fd6;
  --accent-foreground: #ffffff;
  --accent-soft: #eeebfc;
  --accent-soft-foreground: #5b4fcf;
  --focus: #6b5fd6;
  --danger: #d6455e;
  --success: #3f9e77;
  --warning: #c98a2e;
  /* …plus the ten --note-* colours */
}

.dark,
[data-theme="dark"] {
  color-scheme: dark;
  /* mirror, with the dark values from §5.3 */
}
```

HeroUI ships `--radius: 0.5rem` with `--field-radius: calc(var(--radius) * 1.5)`, which lands
inputs and buttons at 12px exactly as §5.6 specifies — so the base radius is left alone, and cards
get their own 16px token.

Dark mode keys off `.dark` (written by `next-themes` with `attribute="class"`) or
`[data-theme="dark"]`. Both selectors are supported so the theme can also be forced server-side.

Note colours are **not** HeroUI theme colours — they are content data, they must round-trip
through the API, and there are ten of them. They live as CSS custom properties:

```css
:root  { --note-mint: #D9F2EA; /* … */ }
.dark  { --note-mint: #263B38; /* … */ }
```

Applied dynamically as `style={{ background: \`var(--note-${note.color})\` }}` — one lookup, no
Tailwind safelist, and adding a colour later is a two-line change rather than a rebuild of every
class permutation. They are *also* registered in a project-owned `@theme inline` block so static
uses (the colour picker) can say `bg-note-mint`.

> **Tailwind v4 gotcha:** the important modifier moved to a *suffix*. `flex!`, not `!flex`. The v3
> spelling fails silently — no error, no style — which cost a debugging cycle on the sidebar.

## 5.5 Type

Geist Sans for UI and note body; Geist Mono for code blocks. Both self-hosted via
`next/font` — no external font request, which matters for an offline-first app that must render
correctly on a cold, disconnected start.

| Role           | Size / line-height | Weight |
| -------------- | ------------------ | ------ |
| Display        | 32 / 40            | 600    |
| Page title     | 24 / 32            | 600    |
| Note title     | 16 / 24            | 600    |
| Body           | 15 / 24            | 400    |
| Note preview   | 14 / 22            | 400    |
| Meta / label   | 12 / 16            | 500    |

15px body rather than 16 is deliberate: note cards are dense, and 15/24 fits meaningfully more
preview text per card without reading as small. The *editor* bumps to 16/26 — that is where
people actually read and write for minutes at a time.

Note previews clamp to 8 lines (`-webkit-line-clamp`). Titles clamp to 2.

## 5.6 Space, radius, elevation

4px base scale: `4 8 12 16 20 24 32 40 48 64`.

Radius: inputs and buttons 12px, cards 16px, sheets and dialogs 20px, pills full. Soft, generous
radii are most of what reads as "friendly" — this is doing more work than the colours are.

Elevation is restrained. Three levels, and shadows are tinted with the ink hue rather than pure
black, which keeps them from looking dirty over pastel:

```
rest   0 1px 2px rgba(46,42,51,.06)
hover  0 4px 12px rgba(46,42,51,.10)
modal  0 16px 48px rgba(46,42,51,.18)
```

In dark mode shadows are nearly invisible; separation comes from surface lightness instead.

## 5.7 Motion

Fast and subtle. Anything over 250ms feels sluggish in an app built around instant capture.

```
instant   100ms  cubic-bezier(.4,0,.2,1)   hover, colour
quick     160ms                            card lift, menus
smooth    240ms  cubic-bezier(.2,0,0,1)    sheets, editor open
spring    320ms  cubic-bezier(.34,1.4,.64,1)  note added to grid
```

The compose bar expanding into the editor is the one place worth real craft — it should feel
like the card grows, not like a dialog appears. `view-transition-name` on the note card gives
this almost for free in supporting browsers, with a plain fade as the fallback.

Everything respects `prefers-reduced-motion: reduce` → durations collapse to 0.01ms and the
grid-add spring becomes a fade.

## 5.8 The note grid

> **Not used in v1.** Desktop is master-detail — nav rail, list pane, editor — decided in Stage B
> ([docs/06 §6.1a](06-ux-spec.md)). A ~336px list pane cannot be masonry. This section is kept
> because the technique is still the right one if a grid view returns behind a toggle; the DOM-order
> problem below is the reason not to reach for CSS `columns` when it does.

Google Keep's masonry, without its accessibility problems.

Do **not** use CSS `columns`. It reflows notes into an order that does not match the DOM, so
keyboard tabbing jumps around the screen unpredictably and screen readers read a scrambled list.

Use CSS Grid with fine-grained row spanning:

```css
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        grid-auto-rows: 8px; gap: 0 16px; }
.card { grid-row-end: span var(--span); }   /* --span set from ResizeObserver */
```

A single `ResizeObserver` measures each card and sets `--span = ceil((height + 16) / 8)`. DOM
order is preserved, so tab order and screen-reader order are correct, and it degrades to a plain
single-column list if the observer never runs.

Columns: 1 below 640px, 2 to 900, 3 to 1280, 4 to 1600, 5 above. Pinned notes render in their
own grid above the rest, under a small "Pinned" heading.

## 5.9 Accessibility, treated as a requirement

- All interactive text meets 4.5:1; large text and icons meet 3:1. The palette above was built
  backwards from this.
- Colour is never the only signal. A note's colour is decorative; its label is a chip with text,
  its reminder is an icon **plus** a date, and the sync state has words, not just a dot.
- Focus is always visible: 2px accent ring, 2px offset. Never `outline: none` without a
  replacement.
- The note grid is a `role="list"`; cards are `role="listitem"` with the title as accessible
  name. Card actions are real buttons, reachable without a hover.
- Every action has a keyboard path ([§6.6](06-ux-spec.md)). Drag-to-reorder always has a
  "Move to…" menu equivalent.
- Live regions announce sync state changes and undo toasts politely.
- Target size 44×44 minimum on touch, including the small colour swatches — they get transparent
  padding rather than being visually enlarged.
- Test with VoiceOver on macOS and iOS before the hybrid build ships.

## 5.10 Iconography and illustration

Lucide, 20px in chrome, 16px inline, 1.75px stroke. The slightly-heavier-than-default stroke
holds up against soft pastel backgrounds, where 1.5px starts to disappear.

Empty states get a small hand-drawn-feeling SVG in two pastel tones plus `line` — never a
photograph or a 3D render. Keep them under 200×160 so they never dominate the screen.

## 5.11 Ad slots

Ads pay for the free tier ([docs/00 §0.4](00-business-model.md)), and the design job is to let them
exist without damaging the product or breaching policy.

**An ad must never look like a note.** This is both an AdSense policy requirement — ad units may not
be styled to be confused with site content — and basic honesty. Concretely:

- Ad containers use `canvas`/`surface` with the standard `line` border. **Never a pastel note colour,
  never the 16px card radius.** Use 12px and a visibly different treatment.
- A `Advertisement` / `Iklan` label in `ink-subtle`, 11px, uppercase, above every unit.
- **Reserve the height before the ad loads.** An unreserved slot is a guaranteed CLS failure against
  the 0.02 budget in [docs/06 §6.10](06-ux-spec.md), and a layout that jumps as someone starts typing
  is the worst possible moment to shift.
- No hover states, no elevation on hover. Ads are not interactive product surfaces.

Placement: one sidebar unit below the nav, one between the pinned and other grid sections. Never
inside a note, never over content, never interstitial. The whole thing sits behind a feature flag so
it can be switched off and measured against paid conversion.

## 5.12 Upgrade prompts and quota warnings

The tone here decides whether the free tier feels generous or nagging. Aim for *informative*, never
*alarming*.

**Upgrade prompts** use `accent-soft` with `accent-text`, the same treatment as a selected row. They
are inline and dismissible — never a modal, never a full-screen takeover, and never `danger`
colouring. Wanting more notes is not an error.

```
┌────────────────────────────────────────────┐
│  ✦  Sinkronkan ke semua perangkat          │   accent-soft ground
│     Rp 15.000/bulan · Lihat paket    ✕     │   accent-text, dismissible
└────────────────────────────────────────────┘
```

**Storage warnings** are the one place `warning` is correct — at 80% quota the user is genuinely at
risk. Even then, lead with the action that helps them (export a backup) and mention upgrading second.

**Eviction notices** use `danger` and are the only tier-related message that may be modal, because
data has already been lost and the user must know. Apologise, offer import, and mention the paid tier
last — see [docs/00 §0.6](00-business-model.md).

One rule across all three: **a prompt never blocks access to existing notes.** Capping creation is
fair; holding someone's writing hostage is not, and it converts far worse than it seems like it
should.
