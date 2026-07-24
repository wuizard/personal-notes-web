/**
 * Public surface of the storage feature.
 *
 * Other features import from here, never from the files inside — that barrier
 * is what lets Phase 2 swap the implementation without touching callers
 * (docs/01 §1.5).
 */
export { getDb, isStorageAvailable, wipeDatabase } from "./db";
export {
  QUOTA_WARN_RATIO,
  acknowledgeEviction,
  detectBootState,
  ensureInstallMarker,
  estimateStorage,
  getLastExportAt,
  isPersisted,
  isQuotaCritical,
  markHadNotes,
  markPersistencePrompted,
  measureUserData,
  requestPersistence,
  setLastExportAt,
  wasPersistencePrompted,
  type BootState,
  type UserDataSize,
  type StorageEstimate,
} from "./persistence";
export { buildBackupZip, downloadBackup } from "./export/export";
export { applyBackup, importBackup, readBackup, type ImportMode, type ImportResult } from "./export/import";
export { BACKUP_FORMAT_VERSION, BackupError, backupFilename } from "./export/format";
export {
  MAX_FILE_BYTES,
  META,
  NOTE_COLORS,
  type CapturePhrase,
  type ChecklistItem,
  type FileKind,
  type LocalFile,
  type LocalImage,
  type LocalNote,
  type LocalReminder,
  type NoteColor,
  type NoteDoc,
  type NoteKind,
  type RepeatRule,
} from "./types";
