import type {MetadataRoute} from "next";
import {routing} from "@/i18n/routing";

const SITE_URL = "https://quickchecklist.app";

// Required for `output: "export"` (next.config.ts) — without it, Next treats
// this route as dynamic and the static export build fails outright.
export const dynamic = "force-static";

/**
 * The indexable pages only: the marketing landing page and the privacy
 * policy, per locale. The actual app screens
 * (notes/archive/completed/reminders/settings/trash) are noindex'd in
 * (app)/layout.tsx and deliberately excluded here too, since a sitemap
 * listing pages that ask not to be indexed just wastes crawl budget.
 *
 * The privacy policy is listed because it genuinely needs to be found —
 * AdSense review looks for a reachable one, and so does anyone deciding
 * whether to trust a notes app with their notes.
 *
 * Resolved entirely at build time (no params, no fetch), which is what
 * makes this compatible with `output: "export"` — see next.config.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routing.locales.flatMap((locale) => [
    {
      url: `${SITE_URL}/${locale}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 1,
    },
    {
      url: `${SITE_URL}/${locale}/privacy`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ]);
}
