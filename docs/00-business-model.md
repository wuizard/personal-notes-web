# 0. Business model

> Read this before the technical docs. The architecture in §1 exists to serve the model here — most
> notably, the free tier runs entirely in the browser so that free users cost approximately nothing.

## 0.1 The model in one paragraph

Notes Maker is free, works without an account, and stores everything in the user's own browser. That
makes it genuinely private and genuinely free to operate — but also single-device, and vulnerable to
the user clearing their browser data. The paid tier fixes exactly those two weaknesses: your notes
live on every device and cannot be lost. Ads support the free tier; subscriptions are the business.

The upsell is not manufactured. It is the honest, structural consequence of local-only storage, and
we say so plainly in the product rather than hiding it.

## 0.2 Tiers

| | **Free** | **Paid** |
| --- | --- | --- |
| Account required | No | Yes |
| Storage | Browser only (IndexedDB) | Cloud + local |
| Notes | Capped — see §0.8 | Unlimited |
| Images per note | 1 | Up to 10 |
| Voice notes | Yes (v1.1) | Yes |
| Note colours, pin, archive, search | Yes | Yes |
| Reminders | **In-app only** — fire when the app is open | **Real push** — fire with the app closed |
| Multi-device | No | Yes |
| Offline | Yes | Yes |
| Export / backup | Yes | Yes |
| Ads | Yes | No |

Two entries deserve explanation.

**Reminders.** True background notifications require a push server, which requires an account and
costs money per user. Free users get reminders that fire when a tab is open and an "Overdue" group
when they next open the app. This is a real technical boundary, not artificial crippling — and the
UI must say so, because letting a free user believe a reminder will wake them up is how you earn a
one-star review.

**Export is free, deliberately.** It would be easy to make backup a paid feature. Don't. Holding
someone's notes hostage in a browser that might evict them is indefensible, and a user who trusts
you enough to keep using the free tier is the only user who will ever upgrade.

## 0.3 Why the free tier costs nothing

Free users never touch a server. Notes, images, and reminders are local; the only cost is static
hosting of a PWA, which is effectively free at any scale a solo project will reach, plus a CDN bill
that scales with *installs*, not usage.

This is the single most important property of the design. It means:

- The free tier can grow to any size without a bill that outruns revenue.
- There is no urgency to convert users, so the upgrade prompt can stay gentle.
- v1 ships with no backend at all (see [docs/07](07-roadmap.md)), which is why it takes ~4 weeks
  rather than ~12.

Paid users cost real money — object storage, bandwidth, push infrastructure, database. Those costs
arrive only alongside the revenue that covers them.

## 0.4 Monetization reality

**Be honest about ads: they will not fund this business.**

Rough order of magnitude, to be replaced with your own numbers once traffic exists — Indonesian
AdSense RPM sits somewhere around **$0.30–$1.00 per 1,000 pageviews**, versus roughly 5–15× that for
US and Western European traffic. A notes utility generates few pageviews per session; people open it,
write something, and leave.

At those rates, **$100/month in ad revenue needs on the order of 200,000 monthly pageviews.** The
same $100/month is **50 subscribers.** Fifty. That ratio should decide where effort goes.

Three consequences:

1. **Never compromise the product for ad inventory.** No interstitials, no ads inside notes, no
   artificially added pageviews. The revenue at stake does not justify the damage.
2. **AdSense approval requires substantial original content.** A bare app shell gets rejected. The
   SEO/content pages are therefore a *prerequisite* for ad revenue, not a later nice-to-have — which
   is why they sit in Stage E of the roadmap rather than "someday".
3. **Ads may cost more than they earn.** If showing ads reduces paid conversion by even a fraction
   of a percent, an ad-free free tier is worth more. Worth measuring rather than assuming. Ads are
   feature-flagged in the code specifically so this can be tested.

Treat ads as partial defrayal of a cost that is already near zero, and treat subscriptions as the
actual revenue line.

## 0.5 Pricing

The initial idea was **$2/month ≈ Rp 32,000**. Two problems with that number for an Indonesia-first
launch.

**It is proportionally expensive locally.** For reference, Spotify and Netflix mobile plans in
Indonesia sit in the Rp 50–55k range. A notes utility at Rp 32k asks for a meaningful fraction of an
entertainment subscription, for something most people currently get free from Google.

**Monthly billing at low prices is destroyed by fees.** A flat processor fee of roughly $0.30 is
**18% of a $2 charge** — but under **2% of a $24 annual charge**. Payment processing is the second
largest cost in this business after storage, and annual billing largely eliminates it.

**Recommendation:**

| Plan | IDR | USD | Notes |
| --- | --- | --- | --- |
| Monthly | Rp 15,000–20,000 | $1.00–1.30 | Entry point, expect most churn here |
| Annual | Rp 150,000 | ~$9–10 | ~2 months free; push this hard |

Annual is not just better margin — annual subscribers churn far less, and cash up front funds the
infrastructure their own usage will consume.

Structure prices as **per-currency values, never a converted USD number.** Rp 16,000 reads as
deliberate; Rp 16,347 reads as a rounding error. The data model carries currency and amount
separately from day one so the global expansion in §0.9 doesn't need a migration.

**Payments are deferred entirely in v1** — see §0.7.

## 0.6 The conversion mechanic

Free users convert at the moments where local-only storage becomes visibly painful:

| Trigger | What the user feels | Prompt |
| --- | --- | --- |
| Opening on a second device | "Where are my notes?" | Sync across devices |
| Hitting the note cap | "I want to keep using this" | Unlimited notes |
| Adding a second image | "Only one?" | Up to 10 per note |
| Setting a reminder | "Will this wake me up?" | Real notifications |
| Storage warning at 80% | "I might lose these" | Safe in the cloud |
| Browser eviction detected | "I *did* lose these" | Never again |

Rules for all of them: **contextual, dismissible, and never blocking existing work.** A user who hits
the note cap keeps full access to the notes they already have — capping creation is acceptable,
holding existing data hostage is not.

The eviction case is the sharpest possible upgrade moment and also the worst possible user
experience. Handle it with an apology and an import offer first, and the upgrade path second.

## 0.7 Validation before building the paid tier

v1 ships with **no accounts, no payments, and no backend.** The paid tier is a waitlist: an email
capture describing cloud sync and real reminders at the target price.

This is deliberate. Building billing, object storage, sync, and push is roughly eight weeks of work
that is worthless if nobody returns to the free app. The waitlist costs an afternoon and answers the
question.

**Gates before Phase 2 begins:**

| Metric | Why it matters |
| --- | --- |
| Day-7 retention | Do people come back at all? A notes app they don't return to has no paid future |
| Notes per active user | Are they actually using it, or did they try it once? |
| % hitting the note cap | Is the cap doing its job, or is it invisible? |
| Waitlist conversion | Direct signal on price and demand |
| Organic traffic | Does the SEO/content strategy work, or is acquisition the real problem? |

If retention is weak, the answer is not to build a paid tier — it is to fix the free product or stop.

## 0.8 The note cap

The original concept was **5 notes.** That is likely too tight.

The cap needs to bite *after* the habit forms, not before. A user who hits a wall on day one hasn't
yet experienced the thing they'd be paying for; they just leave, and they don't come back. Habits in
a notes app form over a week or two of small captures.

**Recommendation: 20–25 notes**, or better — **leave notes uncapped and gate on the things that
actually cost money and read as premium**: multiple images, sync, real push, multi-device. That
framing is also easier to defend, because every gated feature has an obvious cost behind it, whereas
"you may only write five things" feels arbitrary and slightly insulting.

The number lives in one config constant precisely so it can be tuned against real data.

## 0.9 Risks

**The competitive question, currently unanswered: why pay for this when Google Keep is free, good,
and already installed?**

"Keep, but paid" has no wedge, and this is the risk most likely to kill the paid tier. Plausible
wedges, one of which needs choosing:

- **Local-first privacy** — notes never touch a server unless you pay us to sync them. Defensible,
  true, increasingly resonant, and already how the product works.
- **No Google account** — meaningful for users who don't want more of their life in one company.
- **Indonesian-first** — UI, support, and content in Indonesian, built by someone local. Google
  localizes; it does not care.
- **Voice notes with Indonesian transcription** — a concrete capability Keep handles poorly.

This must be answered **before Phase 2**, not before v1. v1's only job is finding out whether people
want the free thing at all.

**Other risks:**

- **Browser eviction** — the free tier's data can vanish. Mitigated by `navigator.storage.persist()`,
  quota warnings, and free export ([docs/08](08-local-storage.md)), but never eliminated. This is a
  permanent, structural property of the free tier and the docs and UI must be straight about it.
- **AdSense rejection or later policy action** — plan for ad revenue to be zero and treat anything
  else as upside.
- **Solo maintenance** — a paid tier is a support obligation and an uptime promise. Annual billing
  and a small user base make that survivable; aggressive growth would not.
- **Price anchoring** — launching at Rp 32k and cutting later is much harder than launching at Rp
  15–20k and raising with added value.

## 0.10 What this means for the build

The technical consequences, spelled out because they drive every other doc:

- Free tier is **client-only**. No API, no database, no auth in v1.
- Local notes carry `client_id` and `rev` **from day one** so that a future upgrade is an *upload*,
  not a migration ([docs/02](02-data-model.md)).
- Ads, the note cap, and every paid gate are **feature-flagged** so they can be tuned or switched off
  without a release.
- i18n (`id`/`en`) and multi-currency are structured in from the start — retrofitting either is
  miserable, and §0.9 guarantees both are needed.
