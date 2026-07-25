/**
 * Cloudflare Worker in front of the static export.
 *
 * The build produces `/id/**` and `/en/**`; the exported `/` is only a
 * client-side redirect shell (src/app/page.tsx), so the Worker answers `/`
 * with a real HTTP redirect before it ever reaches the assets binding.
 * Everything else is served straight from assets at no compute cost.
 *
 * `/` always goes to the default locale — English. Accept-Language
 * negotiation was deliberately removed: the site should present the same
 * default to everyone, and Indonesian users reach `/id` via the in-app
 * language switcher (or a direct link), not via a header they never chose.
 */

const DEFAULT_LOCALE = "en";

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      url.pathname = `/${DEFAULT_LOCALE}`;
      return new Response(null, {
        // 307, not 301: a permanent redirect gets pinned in browser and
        // intermediary caches, which would make it painful to ever change
        // where `/` lands (e.g. reinstating language negotiation).
        status: 307,
        headers: {
          Location: url.toString(),
          "Cache-Control": "no-store",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

export default handler;
