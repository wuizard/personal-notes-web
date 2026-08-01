"use client";

import {useSyncExternalStore} from "react";
import {getServerSyncStatus, getSyncStatus, subscribeSyncStatus, type SyncStatus} from "./status";

/** Read-only view of the engine's state, for the pill and the settings panel. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getServerSyncStatus);
}
