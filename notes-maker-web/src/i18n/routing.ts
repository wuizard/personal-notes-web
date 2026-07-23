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
  defaultLocale: "id",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

export const localeNames: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};
