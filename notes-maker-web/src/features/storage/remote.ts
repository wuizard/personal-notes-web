/**
 * Remote-data seam for the full-wipe flow — Phase 2 (docs/04).
 *
 * Sync does not exist yet: Firebase is auth-only and no server stores notes,
 * so today no account has remote data and both functions resolve to "nothing
 * there". The wipe dialog (components/reset-panel.tsx) is already wired
 * through them — it only offers the "keep or delete the notes in your
 * account" choice when the count is non-zero — so implementing these against
 * the sync API lights that step up without touching the UI.
 */

export async function countRemoteNotes(uid: string): Promise<number> {
  void uid;
  return 0;
}

export async function deleteRemoteNotes(uid: string): Promise<void> {
  // Nothing is stored remotely until the sync protocol ships (docs/04).
  void uid;
}
