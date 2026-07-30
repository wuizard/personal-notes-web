/**
 * Sync status, for the pill in the app bar and the Settings panel.
 *
 * In memory, not localStorage: unlike the plan verdict this is about *this
 * session's* connection, and a stale "Synced" restored from a previous tab
 * would be a lie.
 *
 * Same store shape as features/plan/plan-cache.ts — a module-level value plus
 * an event — so a write never has to call setState from inside an effect. The
 * snapshot object is memoized for the same hard-won reason documented there:
 * useSyncExternalStore compares with Object.is on every render, and returning
 * a fresh object each call is an infinite render loop.
 */

export type SyncState =
  /** Not signed in, not premium, or no API configured. Sync is not running. */
  | "disabled"
  /** Up to date as far as we know. */
  | "idle"
  | "syncing"
  /** Unreachable. Changes are queued and will go when the connection returns. */
  | "offline"
  /** The server answered, and refused. Retrying unchanged will not help. */
  | "error";

export interface SyncStatus {
  state: SyncState;
  /** Local changes not yet accepted by the server. */
  queued: number;
  lastSyncedAt: number | null;
  error: string | null;
}

export const SYNC_CHANGE_EVENT = "nm-sync-change";

let status: SyncStatus = {
  state: "disabled",
  queued: 0,
  lastSyncedAt: null,
  error: null,
};

const SERVER_SNAPSHOT: SyncStatus = {
  state: "disabled",
  queued: 0,
  lastSyncedAt: null,
  error: null,
};

export function getSyncStatus(): SyncStatus {
  return status;
}

/** Server render has no sync; a stable constant keeps hydration quiet. */
export function getServerSyncStatus(): SyncStatus {
  return SERVER_SNAPSHOT;
}

export function setSyncStatus(patch: Partial<SyncStatus>): void {
  const next = { ...status, ...patch };
  // Only publish real changes — a no-op write would re-render every subscriber.
  if (
    next.state === status.state &&
    next.queued === status.queued &&
    next.lastSyncedAt === status.lastSyncedAt &&
    next.error === status.error
  ) {
    return;
  }
  status = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SYNC_CHANGE_EVENT));
  }
}

export function subscribeSyncStatus(onChange: () => void): () => void {
  window.addEventListener(SYNC_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(SYNC_CHANGE_EVENT, onChange);
}

/** Test seam — resets module state between cases. */
export function resetSyncStatus(): void {
  status = { state: "disabled", queued: 0, lastSyncedAt: null, error: null };
}
