"use client";

import {useSyncExternalStore} from "react";

/**
 * Reads a CSS media query reactively.
 *
 * useSyncExternalStore rather than useState+useEffect: the server snapshot is
 * `false`, the client subscribes to the real MediaQueryList, and there is no
 * cascading render on mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Matches Tailwind's `md` breakpoint, where the layout becomes two-pane. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
