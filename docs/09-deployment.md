# 9. Deployment — VPS + Caddy

The app is a **static export**. There are no API routes, no server actions, and no dynamic server
APIs — every note screen renders client-side against IndexedDB. `next build` writes `out/`, and any
static host can serve it.

`notes-maker-web` and `notes-maker-api` share one VPS. Caddy in front does TLS and reverse-proxies
`api.quickchecklist.app` to the Go binary (`notes-maker-api/deploy/`); for `quickchecklist.app` it
just serves the static export directly off disk — no runtime, no process to restart. Cloudflare
sits in front of `quickchecklist.app` in proxy mode (orange cloud) purely for edge/DDoS protection;
it is not the hosting platform. `api.quickchecklist.app` stays DNS-only (grey cloud) so Caddy's own
Let's Encrypt HTTP-01 challenge keeps working for it.

## 9.1 The `/` fallback

Locale routing uses `localePrefix: "always"` (docs/01, `src/i18n/routing.ts`), so the build produces
`/id/**` and `/en/**` and deliberately **no prerendered page at `/`** — every page is prerendered per
locale and nothing is decided at request time, which is what makes a static export possible.

`/` is served by `public/index.html`, a static page that meta-refreshes to `/en` client-side (copied
over `src/app/page.tsx`'s own build output during the export — the two exist for the same fallback,
see the comment in `src/app/page.tsx`). There is no server-side language negotiation; everyone lands
on English and switches languages in-app.

## 9.2 Deploying — CI

Pushing to `main` runs `ci.yml`'s `deploy-web` job:

1. `pnpm --filter notes-maker-web build` — same build command as CI's lint/typecheck/test job.
2. Tar `notes-maker-web/out/` and `scp` it to the VPS (`appleboy/scp-action`), reusing the same
   `VPS_HOST` / `VPS_SSH_KEY` secrets and `deploy` SSH user as `api.yml`.
3. Over SSH: extract into `/opt/notes-maker-web/releases/<commit-sha>/`, verify a few expected files
   exist (`en.html`, `id.html`, `sw.js`), **then** atomically swap the `current` symlink
   to point at the new release. Verification happens *before* the swap, so a broken extract never
   goes live. No systemd restart, no health check needed — Caddy reads whatever `current` points at
   on every request. The last 5 releases are kept for manual rollback (`ln -sfn` back to an older one
   + `mv`), older ones pruned.

To do it by hand instead:

```bash
pnpm --filter notes-maker-web build
tar -C notes-maker-web/out -czf web-release.tar.gz .
scp web-release.tar.gz deploy@<vps-host>:/opt/notes-maker-web/releases/
ssh deploy@<vps-host>
# then run the same extract/verify/swap steps ci.yml's deploy-web job does
```

## 9.3 One-time VPS + Cloudflare setup

Everything below is manual, done once, and documented at the top of
`notes-maker-web/deploy/Caddyfile` — this section is the narrative version.

1. **Directory + permissions**: `deploy` (the same SSH user `api.yml` already uses) needs write
   access to `/opt/notes-maker-web/releases/`. Unlike the API's deploy user, no sudoers grant is
   needed — serving static files never requires restarting anything as root.
2. **TLS**: generate a Cloudflare Origin CA certificate (dashboard → SSL/TLS → Origin Server) for
   `quickchecklist.app` and install it on the VPS. This is used instead of Caddy's usual automatic
   Let's Encrypt HTTP-01 flow because Cloudflare's proxy sits in front of the origin — a public CA
   can't complete that challenge cleanly through a proxied hostname, and Origin CA needs no ACME
   plugin or extra secret. Set Cloudflare's SSL/TLS mode to **Full (strict)**; this only affects
   proxied hostnames, so `api.quickchecklist.app` (DNS-only) is unaffected.
3. **Caddy config**: append `notes-maker-web/deploy/Caddyfile`'s site block into the VPS's existing
   `/etc/caddy/Caddyfile` (which already has the `api.quickchecklist.app` block from
   `notes-maker-api/deploy/Caddyfile`), then `sudo systemctl reload caddy`.
4. **DNS cutover, last**: verify Caddy serves the app correctly by IP/Host header first, then remove
   the domain from wherever it previously pointed and add a plain `A` record for
   `quickchecklist.app` → the VPS IP, proxied (orange cloud) in Cloudflare.

## 9.4 The caching trap

The Caddyfile sets `Cache-Control: no-cache` on `/sw.js`. **Do not remove it.**

A cached service worker pins every user to the deploy that installed it. They keep getting the old
app, no later release ever reaches them, and nothing in your logs looks wrong. It is the most common
way a PWA on a CDN or edge cache silently breaks.

The rest of the Caddyfile's header rules are the inverse: `/_next/static/*` is content-hashed and
cached for a year with `immutable`.

## 9.5 The offline page must not redirect

The service worker precaches `/offline` — **without** the `.html` extension. The Caddyfile's
`try_files {path} {path}.html {path}/index.html` serves `offline.html` for a request to `/offline`
directly, with no redirect involved, so `cache.add()` in the service worker never sees a redirected
response. If routing here ever changes, re-check this — a redirect leaves the offline fallback
silently uninstalled, discovered only by a user who goes offline.

## 9.6 Pre-deploy checklist

```bash
pnpm --filter notes-maker-web check:messages   # locale catalogs in sync
pnpm --filter notes-maker-web lint
pnpm --filter notes-maker-web typecheck
pnpm --filter notes-maker-web test
```

CI runs all of these before `deploy-web` is allowed to run.

After deploying, verify in a fresh private window:

- `/` redirects to `/en`
- `/sw.js` responds `Cache-Control: no-cache`
- the app installs as a PWA and opens with the network disabled
- a note written before a redeploy is still there afterwards — the strongest signal that nothing
  about the deploy disturbed IndexedDB
