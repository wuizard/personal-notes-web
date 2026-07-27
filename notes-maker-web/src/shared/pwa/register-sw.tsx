"use client";

import {useEffect} from "react";

/**
 * Registers the service worker in production only.
 *
 * In development a live service worker caches stale chunks and produces
 * bewildering "why is my change not appearing" sessions, so it is skipped —
 * and any previously registered worker is torn down, which matters because a
 * worker registered once will otherwise outlive the build that created it.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => void r.unregister()));
      return;
    }

    const onLoad = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    };

    // Registering after load keeps the worker off the critical path for LCP.
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
