/**
 * Cloudflare Worker in front of the static export.
 *
 * The build produces `/id/**` and `/en/**` and — deliberately — no `/`.
 * `localePrefix: "always"` means every page is prerendered per locale, which
 * is what makes a static export possible at all, but it leaves the bare origin
 * with nothing to serve.
 *
 * Negotiating that redirect is the one job static hosting genuinely cannot do,
 * and it is why this is a Worker rather than plain asset hosting. Everything
 * else is served straight from the assets binding at no compute cost.
 */

const LOCALES = ["id", "en"] as const;
type Locale = (typeof LOCALES)[number];
const DEFAULT_LOCALE: Locale = "id";

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

/**
 * Picks a locale from Accept-Language.
 *
 * Parses quality values properly rather than taking the first tag: a browser
 * sending `en;q=0.5, id;q=0.9` prefers Indonesian, and naive parsing gets that
 * backwards. Matching is on the primary subtag, so `id-ID` matches `id`.
 */
function negotiateLocale(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      const quality = q === undefined ? 1 : Number.parseFloat(q);
      return {
        primary: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { primary } of ranked) {
    const match = LOCALES.find((locale) => locale === primary);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      const locale = negotiateLocale(request.headers.get("accept-language"));
      url.pathname = `/${locale}`;
      return new Response(null, {
        // 307, not 301: the redirect target depends on a request header, and a
        // permanent redirect would be cached by browsers and intermediaries —
        // pinning one visitor's language onto everyone behind that cache.
        status: 307,
        headers: {
          Location: url.toString(),
          // Tells caches the response varies by language rather than being
          // one shared answer for the origin.
          Vary: "Accept-Language",
          "Cache-Control": "no-store",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

export default handler;
