/**
 * "Skip the landing page next time" — once a visitor has entered the app
 * (the "Start writing" CTA, or any other way into /notes), later landing-page
 * visits jump straight to /notes instead of showing the marketing page again.
 *
 * Server-safe on purpose, same reason as app-color.ts: the landing page (a
 * server component) inlines `returningVisitorBootScript`, while the app
 * shell (client) calls `markVisitedApp()` on mount.
 */

export const VISITED_APP_KEY = "nm-visited-app";

/**
 * Inlined at the top of the landing page's own markup so the redirect fires
 * before the page paints — same no-flash technique as appColorBootScript.
 * `location.replace`, not a Next.js navigation: this runs before hydration,
 * and `replace` (rather than `assign`) keeps the landing page out of
 * history, so Back from the app doesn't bounce here and redirect forward
 * again.
 *
 * Scoped to the landing page's own script rather than the shared locale
 * layout — /notes (and every other app screen) never runs this check, which
 * is the structural guarantee against a redirect loop: nothing the app ever
 * renders can re-trigger this redirect once it has already happened.
 */
export function returningVisitorBootScript(locale: string): string {
  const target = `/${locale}/notes`;
  return `try{if(localStorage.getItem(${JSON.stringify(
    VISITED_APP_KEY,
  )}))location.replace(${JSON.stringify(target)})}catch(e){}`;
}

/** Called once the app shell mounts — covers the CTA and any other entry. */
export function markVisitedApp(): void {
  try {
    localStorage.setItem(VISITED_APP_KEY, "1");
  } catch {
    // Best-effort — private browsing, storage disabled, etc. Worst case the
    // landing page just shows again next time.
  }
}
