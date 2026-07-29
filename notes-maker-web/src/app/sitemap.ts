import type {MetadataRoute} from "next";
import {routing} from "@/i18n/routing";

const SITE_URL = "https://quickchecklist.app";

// Required for `output: "export"` (next.config.ts) — without it, Next treats
// this route as dynamic and the static export build fails outright.
export const dynamic = "force-static";

/**
 * Only the marketing landing page per locale — the actual app screens
 * (notes/archive/completed/reminders/settings/trash) are noindex'd in
 * (app)/layout.tsx and deliberately excluded here too, since a sitemap
 * listing pages that ask not to be indexed just wastes crawl budget.
 *
 * Resolved entirely at build time (no params, no fetch), which is what
 * makes this compatible with `output: "export"` — see next.config.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.map((locale) => ({
    url: `${SITE_URL}/${locale}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 1,
  }));
}
