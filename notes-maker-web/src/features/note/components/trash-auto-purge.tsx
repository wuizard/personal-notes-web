"use client";

import { useEffect } from "react";
import { isStorageAvailable } from "@/features/storage";
import { purgeExpiredTrash } from "../repo/note-repo";

/**
 * Runs the 30-day trash purge once per app load — docs/10 §10.8.
 *
 * Mounted in the app layout so it fires whichever screen opens first. Failures
 * are swallowed: a purge that could not run this time runs on the next open,
 * and surfacing an error for housekeeping the user never asked for is noise.
 */
export function TrashAutoPurge() {
  useEffect(() => {
    if (!isStorageAvailable()) return;
    void purgeExpiredTrash().catch(() => {});
  }, []);

  return null;
}
