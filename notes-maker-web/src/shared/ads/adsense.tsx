"use client";

import Script from "next/script";
import {useSyncExternalStore} from "react";
import {usePlan} from "@/features/plan/use-plan";

const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * AdSense loader — docs/10 §10.7, §10.13.
 *
 * Free tier only, and only while online: an offline visitor has no
 * connection to serve an ad over, so loading the script would just leave a
 * dead slot ("the offline app never holds a blank ad slot", §10.7). Premium
 * status here already accounts for the offline grace period (usePlan), so a
 * premium user who goes offline never sees ads start up underneath them.
 *
 * `NEXT_PUBLIC_ADSENSE_CLIENT_ID` unset — e.g. every local/dev environment —
 * renders nothing, the same "absent config disables the feature" pattern as
 * features/auth/firebase.ts.
 */
export function AdSense() {
  const { plan } = usePlan();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  if (!CLIENT_ID || plan !== "free" || !online) return null;

  return (
    <Script
      async
      strategy="afterInteractive"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT_ID}`}
      crossOrigin="anonymous"
    />
  );
}
