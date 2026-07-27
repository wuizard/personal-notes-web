import {getDb} from "./db";
import {type InstallMeta, META} from "./types";

/**
 * Storage durability — docs/08 §8.3.
 *
 * By default browsers treat site data as *best-effort* and may delete it under
 * storage pressure, with no warning and no user action. For a tier where the
 * browser is the only copy of someone's notes, that is silent data loss.
 * `navigator.storage.persist()` upgrades the origin to *persistent*, after
 * which data is only removed if the user clears it themselves.
 *
 * This is risk reduction, never a guarantee — which is why export exists.
 */

export async function isPersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}

/**
 * Ask the browser to make storage persistent.
 *
 * Call this AFTER the first note is saved, never on load. In browsers that
 * prompt (Firefox), a prompt shown before the app has done anything for the
 * user gets a reflexive deny — and the answer tends to stick.
 *
 * Chromium does not prompt at all; it decides from engagement signals,
 * notably whether the PWA is installed. That is a concrete reason to surface
 * the install prompt: installing measurably improves data durability.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await isPersisted()) return true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  /** 0–1. NaN-safe: some browsers report a zero quota. */
  ratio: number;
  supported: boolean;
}

export async function estimateStorage(): Promise<StorageEstimate> {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: 0, ratio: 0, supported: false };
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota, ratio: quota > 0 ? usage / quota : 0, supported: true };
}

export interface UserDataSize {
  noteBytes: number;
  fileBytes: number;
  total: number;
}

/**
 * Measures what the USER actually stored — notes plus attachments.
 *
 * `estimateStorage()` reports the whole origin: IndexedDB, Cache Storage, and
 * service-worker overhead. Presenting that alone next to a note count is
 * actively misleading — a fresh install with one note reported ~4MB, of which
 * 99% was cached application code, not anything the user wrote.
 *
 * Reading blob sizes does not decode them, so this stays cheap.
 */
export async function measureUserData(): Promise<UserDataSize> {
  const db = getDb();
  const [notes, files] = await Promise.all([db.notes.toArray(), db.files.toArray()]);

  const noteBytes = notes.reduce(
    // A rough but honest byte count for the JSON a note serialises to.
    (sum, note) => sum + new Blob([JSON.stringify(note)]).size,
    0,
  );
  const fileBytes = files.reduce(
    (sum, file) => sum + (file.blob?.size ?? 0) + (file.thumb?.size ?? 0),
    0,
  );

  return { noteBytes, fileBytes, total: noteBytes + fileBytes };
}

/** Above this, warn and stop accepting new images — but never block text. */
export const QUOTA_WARN_RATIO = 0.8;

export function isQuotaCritical(estimate: StorageEstimate): boolean {
  return estimate.supported && estimate.quota > 0 && estimate.ratio >= QUOTA_WARN_RATIO;
}

// ── install marker & eviction detection ───────────────────────────────────

async function readInstallMeta(): Promise<InstallMeta | null> {
  const row = await getDb().meta.get(META.install);
  return (row?.value as InstallMeta) ?? null;
}

async function writeInstallMeta(value: InstallMeta): Promise<void> {
  await getDb().meta.put({ key: META.install, value });
}

/** Idempotent; safe to call on every boot. */
export async function ensureInstallMarker(): Promise<InstallMeta> {
  const existing = await readInstallMeta();
  if (existing) return existing;
  const fresh: InstallMeta = { installedAt: Date.now(), everHadNotes: false };
  await writeInstallMeta(fresh);
  return fresh;
}

/** Called on first note creation. Latches true and never goes back. */
export async function markHadNotes(): Promise<void> {
  const meta = await ensureInstallMarker();
  if (meta.everHadNotes) return;
  await writeInstallMeta({ ...meta, everHadNotes: true });
}

export type BootState =
  | { kind: "fresh" }
  | { kind: "returning"; noteCount: number }
  /** The marker says notes existed, but none remain — the browser evicted them. */
  | { kind: "evicted" };

/**
 * Distinguishes eviction from a fresh install.
 *
 * An empty database on its own is ambiguous. The install marker resolves it:
 * if this browser is known to have held notes and now holds none, the data was
 * taken away rather than never created.
 *
 * Note the marker lives in the same database, so a *total* wipe looks like a
 * fresh install and is silently unrecoverable-but-harmless. Partial eviction —
 * the common case, where the origin is culled but not every store — is caught.
 */
export async function detectBootState(): Promise<BootState> {
  const db = getDb();
  const [meta, noteCount] = await Promise.all([readInstallMeta(), db.notes.count()]);

  if (!meta) {
    await ensureInstallMarker();
    return { kind: "fresh" };
  }
  if (meta.everHadNotes && noteCount === 0) return { kind: "evicted" };
  return { kind: "returning", noteCount };
}

/**
 * Clears the eviction flag after the user has acknowledged it, so the notice
 * is not shown on every subsequent boot.
 */
export async function acknowledgeEviction(): Promise<void> {
  const meta = await readInstallMeta();
  if (meta) await writeInstallMeta({ ...meta, everHadNotes: false });
}

// ── misc meta helpers ─────────────────────────────────────────────────────

export async function getLastExportAt(): Promise<number | null> {
  const row = await getDb().meta.get(META.lastExportAt);
  return (row?.value as number) ?? null;
}

export async function setLastExportAt(ts: number): Promise<void> {
  await getDb().meta.put({ key: META.lastExportAt, value: ts });
}

export async function wasPersistencePrompted(): Promise<boolean> {
  const row = await getDb().meta.get(META.persistencePrompted);
  return Boolean(row?.value);
}

export async function markPersistencePrompted(): Promise<void> {
  await getDb().meta.put({ key: META.persistencePrompted, value: true });
}
