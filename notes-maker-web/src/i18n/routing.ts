import { defineRouting } from "next-intl/routing";

/**
 * Indonesia first, global after — docs/00 §0.1.
 *
 * `id` is the default and therefore un-prefixed (`/notes`), while English
 * lives under `/en`. Marketing pages need real URLs per locale for SEO and
 * AdSense approval (docs/00 §0.4), which is why locale routing exists at all
 * rather than a cookie-only setup.
 */
export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "en",
  /**
   * `always`, not `as-needed`.
   *
   * `as-needed` leaves the default locale un-prefixed and relies on middleware
   * to negotiate at request time — which a static export has no way to do.
   * With `always`, `/id/notes` and `/en/notes` are both prerendered at build
   * time and nothing has to be decided at runtime.
   *
   * It is also better for SEO: each locale gets a real, crawlable URL rather
   * than one URL whose content depends on a header.
   *
   * `/` itself is redirected by the Worker (worker/index.ts), which is the one
   * thing static hosting genuinely cannot do.
   */
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

export const localeNames: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};
