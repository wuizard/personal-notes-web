import { wipeDatabase } from "./db";

/**
 * Erases every trace of the app from this browser: the database (notes,
 * attachments, suggestion history, meta flags), web storage (theme choice
 * lives in localStorage), Cache Storage, and any service worker registration
 * — so the next visit genuinely behaves like a first open.
 *
 * Two things it deliberately does NOT touch:
 *  - The Firebase session. Signing out is an account action, not a storage
 *    one; the caller decides (reset-panel.tsx signs out first).
 *  - Browser-level permissions (notifications, persistent storage). Only the
 *    user can revoke those, and a stale grant is harmless.
 *
 * Each step runs even if an earlier one throws: a wipe that dies halfway
 * must still remove as much as it can, and the caller reports one error at
 * the end rather than stopping at the first locked resource.
 */
export async function wipeDevice(): Promise<void> {
  let failed = false;

  try {
    await wipeDatabase();
  } catch {
    failed = true;
  }

  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Storage access can be denied wholesale (private modes); nothing to
    // clear is equivalent to cleared.
  }

  try {
    if ("caches" in globalThis) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    failed = true;
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    failed = true;
  }

  if (failed) throw new Error("wipeDevice: some storage could not be removed");
}
