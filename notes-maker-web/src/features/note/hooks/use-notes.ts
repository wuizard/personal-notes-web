"use client";

import {useLiveQuery} from "dexie-react-hooks";
import {listNotes, type NoteFilter} from "../repo/note-repo";

/**
 * Live note list.
 *
 * `useLiveQuery` re-runs whenever the underlying Dexie tables change, so any
 * write anywhere in the app updates every view — no cache invalidation, no
 * refetch, no store. This is the payoff of a local-first data layer.
 *
 * Returns `undefined` while the first query is in flight, which callers use to
 * distinguish "loading" from "genuinely empty". Rendering the empty state
 * during load is a real bug: an existing user briefly sees "no notes yet".
 */
export function useNotes(filter: NoteFilter = "active") {
  return useLiveQuery(() => listNotes(filter), [filter]);
}
