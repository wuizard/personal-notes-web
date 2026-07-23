# 9. Deployment — Cloudflare

The app is a **static export**. There are no API routes, no server actions, and no dynamic server
APIs — every note screen renders client-side against IndexedDB. `next build` writes `out/`, and any
static host can serve it.

Two Cloudflare products can host it. **Workers is what this repo is configured for**, and is the
recommendation; Pages is documented because it is the more familiar name and works fine.

| | Workers (configured) | Pages |
| --- | --- | --- |
| Serves `out/` | yes | yes |
| Can negotiate `/` by language | **yes** — small fetch handler | no — needs a fixed redirect |
| Config lives in repo | `wrangler.jsonc` | dashboard (or `wrangler.jsonc`) |
| Cloudflare's direction | actively developed | maintenance for new framework work |

## 9.1 Why the `/` redirect needs a Worker

Locale routing uses `localePrefix: "always"` (docs/01, `src/i18n/routing.ts`), so the build produces
`/id/**` and `/en/**` and deliberately **no `/`**. That is what makes a static export possible: every
page is prerendered per locale and nothing is decided at request time.

The cost is that the bare origin has nothing to serve. `worker/index.ts` handles exactly that one
request: it parses `Accept-Language` — including q-values, so `en;q=0.5, id;q=0.9` correctly resolves
to Indonesian — and issues a `307` with `Vary: Accept-Language`.

**307, never 301.** The target depends on a request header; a permanent redirect would be cached by
browsers and intermediaries, pinning one visitor's language onto everyone behind that cache.

Everything else is served straight from the assets binding with no compute.

## 9.2 Deploying to Workers

```bash
pnpm run deploy      # from the repo root
```

### Why `wrangler.jsonc` sits at the repository root

It looks misplaced — the app is in `notes-maker-web/` — and it is there on purpose.

Cloudflare Workers Builds runs its deploy command from the repository root. With no config there,
wrangler falls back to workspace detection, finds several candidate packages, and refuses:

```
✘ [ERROR] The Cloudflare application detection logic has been run in the root of a
  workspace instead of targeting a specific project. Change your working directory
  to one of the applications in the workspace and try again.
Failed: error occurred while running deploy command
```

This is a nasty one to diagnose because **the build succeeds first** — you get a full green build
log and then a failure that reads like a wrangler bug.

Two ways to fix it. Putting the config where the deploy actually runs is the one chosen here,
because the alternative depends on a dashboard field staying in sync with the repo by hand — and a
setting that lives only in a web UI is not reviewable, not versioned, and silently wrong the moment
someone recreates the project.

Paths inside it are therefore relative to the root (`notes-maker-web/worker/index.ts`,
`./notes-maker-web/out`). `wrangler` is a **root** devDependency for the same reason: it is a
repository-level deploy tool, not something the app imports.

The upshot is that a bare `npx wrangler deploy` at the root just works, which is what Cloudflare
runs by default.

### Workers Builds (deploy on push)

| Setting | Value |
| --- | --- |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` *(Cloudflare's default — no change needed)* |
| Root directory | *(repo root)* |
| `NODE_VERSION` | `24` |

Because the config is at the root, the default deploy command works unmodified. `pnpm run deploy`
is equivalent and additionally rebuilds first, which is what you want locally.

Root directory stays at the repository root even though the app is a subdirectory: the pnpm
workspace lockfile lives at the top, and `pnpm install --frozen-lockfile` needs to see it. The
build script filters to the package; the deploy reads `wrangler.jsonc`, which is already there.

Set `NODE_VERSION` explicitly. Cloudflare's default image has shipped Node 22 while this project is
developed and tested on 24 — the `engines` floor is 20.9 so 22 does build, but pinning it removes a
difference you would otherwise only discover from a version-specific failure.

First time only:

```bash
pnpm exec wrangler login
```

Local verification against the real runtime — worth doing before every deploy, because it catches
asset-handling differences that `next start` cannot:

```bash
pnpm run cf:dev                             # build + wrangler dev (workerd)
```

`wrangler.jsonc` is the whole configuration. Two settings there are load-bearing:

- `html_handling: "auto-trailing-slash"` — the export writes `en/notes.html`, and this is what maps a
  request for `/en/notes` onto it.
- `not_found_handling: "404-page"` — explicitly **not** `single-page-application`. SPA fallback would
  return `200` plus the app shell for genuinely missing URLs, which search engines index as duplicate
  content.

## 9.3 Deploying to Pages instead

Connect the repo in the Cloudflare dashboard, then:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `pnpm install && pnpm --filter notes-maker-web build` |
| Build output directory | `notes-maker-web/out` |
| Root directory | *(repo root — the build command already filters)* |
| `NODE_VERSION` | `24` |

The monorepo is the only fiddly part: set the root to the repository root and let the pnpm filter
select the package, rather than setting root to `notes-maker-web` — the workspace lockfile lives at
the top and pnpm needs to see it.

`public/_headers` is honoured by Pages exactly as it is by Workers, so caching behaves identically.

**What you lose:** the `/` language redirect. Options, worst to best:

1. Add `/ /id 302` to a `_redirects` file — every visitor lands on Indonesian regardless of browser.
2. Add a Pages Function at `functions/index.ts` with the same logic as `worker/index.ts` — at which
   point you are running a Worker anyway, which is the argument for using Workers directly.

## 9.4 The caching trap

`public/_headers` sets `Cache-Control: no-cache` on `/sw.js`. **Do not remove it.**

A cached service worker pins every user to the deploy that installed it. They keep getting the old
app, no later release ever reaches them, and nothing in your logs looks wrong. It is the most common
way a PWA on a CDN silently breaks.

The rest of that file is the inverse: `/_next/static/*` is content-hashed and cached for a year with
`immutable`.

## 9.5 The offline page must not redirect

The service worker precaches `/offline` — **without** the `.html` extension.

Cloudflare's `auto-trailing-slash` handling 307s `/offline.html` to `/offline`, and `cache.add()`
rejects a redirected response. Requesting the `.html` form leaves the offline fallback silently
uninstalled, discovered only by a user who goes offline. If asset handling is ever changed, re-check
this.

## 9.6 Custom domain

Workers: add the route under the Worker's **Settings → Domains & Routes**. Pages: **Custom domains**.
Either way Cloudflare provisions the certificate; if the domain is already on Cloudflare DNS the
record is created for you.

Set `start_url` and `scope` in `public/manifest.webmanifest` only if the app is served from a
subpath — at a domain root the current values are correct.

## 9.7 Pre-deploy checklist

```bash
pnpm --filter notes-maker-web check:messages   # locale catalogs in sync
pnpm --filter notes-maker-web lint
pnpm --filter notes-maker-web typecheck
pnpm --filter notes-maker-web typecheck:worker
pnpm --filter notes-maker-web test
```

CI runs all but the worker typecheck; add it there when the Worker grows beyond the redirect.

After deploying, verify in a fresh private window:

- `/` redirects by browser language, and `Vary: Accept-Language` is present
- `/sw.js` responds `Cache-Control: no-cache`
- the app installs as a PWA and opens with the network disabled
- a note written before a redeploy is still there afterwards — the strongest signal that nothing
  about the deploy disturbed IndexedDB
