"use client";

import {useEffect, useState} from "react";

/**
 * Turns a Blob into an object URL and revokes it when it is no longer needed.
 *
 * Object URLs pin their Blob in memory until revoked. In a note app that means
 * scrolling a library of photos leaks every image you pass — the kind of thing
 * that never shows up in development and kills a phone.
 *
 * ## Why the URL is created inside the effect
 *
 * The obvious implementation derives it with `useMemo` and revokes in an
 * effect cleanup. That is broken under StrictMode, which mounts, unmounts and
 * remounts every component in development:
 *
 *   mount    → useMemo creates URL_A
 *   unmount  → cleanup revokes URL_A
 *   remount  → useMemo is NOT recomputed (hook state survives the simulated
 *              remount), so the <img> keeps pointing at a revoked URL
 *
 * The image then renders blank until something changes the blob — which is
 * precisely why an image opened from a thumbnail appeared empty until you
 * paged to the next one.
 *
 * Creating the URL in the effect makes creation and revocation symmetric: each
 * mount creates its own URL and revokes exactly that one. The cost is one
 * extra render on mount, which is why the setState-in-effect rule is disabled
 * here — the rule guards against cascading renders, and correctness for an
 * external resource with a lifecycle wins over avoiding a single re-render.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;

    const next = URL.createObjectURL(blob);

    // The URL must be created and revoked by the same mount, or StrictMode's
    // remount leaves an already-revoked URL in the DOM. The disable directive
    // has to sit immediately above the call — a comment between them would
    // consume it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(next);

    return () => {
      URL.revokeObjectURL(next);
    };
  }, [blob]);

  // Guarding on `blob` here rather than clearing state in the effect: with no
  // blob there is nothing to show, and a second setState would cost another
  // render to say so. Any stale url left in state is simply never returned.
  return blob ? url : null;
}
