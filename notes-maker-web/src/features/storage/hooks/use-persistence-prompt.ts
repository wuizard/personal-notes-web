"use client";

import {useCallback} from "react";
import {markPersistencePrompted, requestPersistence, wasPersistencePrompted,} from "../persistence";

/**
 * Requests storage persistence at the right moment — docs/08 §8.3.
 *
 * "The right moment" is after the user's first note is saved, not on load.
 * Firefox shows a real permission prompt, and a prompt fired before the app
 * has done anything for the user gets a reflexive deny that tends to stick.
 * Chromium does not prompt at all and decides from engagement signals, so
 * calling it early there is merely useless rather than harmful.
 *
 * Asked at most once per browser; the answer is recorded in `meta`.
 */
export function usePersistencePrompt() {
  const maybePrompt = useCallback(async (): Promise<boolean | null> => {
    if (await wasPersistencePrompted()) return null;
    await markPersistencePrompted();
    return requestPersistence();
  }, []);

  return { maybePrompt };
}
