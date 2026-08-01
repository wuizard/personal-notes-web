import {defineRouting} from "next-intl/routing";

/**
 * Indonesian is the default; English lives under `/en`. Marketing pages need
 * real URLs per locale for SEO and AdSense approval (docs/00 Â§0.4), which is
 * why locale routing exists at all rather than a cookie-only setup.
 */
export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "id",
  /**
   * `always`, not `as-needed`.
   *
   * `as-needed` leaves the default locale un-prefixed and relies on middleware
   * to negotiate at request time â€” which a static export has no way to do.
   * With `always`, `/id/notes` and `/en/notes` are both prerendered at build
   * time and nothing has to be decided at runtime.
   *
   * It is also better for SEO: each locale gets a real, crawlable URL rather
   * than one URL whose content depends on a header.
   *
   * `/` itself has no prerendered page, so it falls back to a client-side
   * redirect (src/app/page.tsx, public/index.html) — the one thing static
   * hosting genuinely cannot do as a real HTTP redirect.
   */
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

export const localeNames: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};
