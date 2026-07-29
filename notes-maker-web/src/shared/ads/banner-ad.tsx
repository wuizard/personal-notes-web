"use client";

import {useEffect} from "react";
import {useAdsEnabled} from "./use-ads-enabled";

const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const SLOT_ID = process.env.NEXT_PUBLIC_ADSENSE_BANNER_SLOT;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * The actual ad unit — docs/10 §10.13 wired the AdSense script loader
 * (adsense.tsx) but never placed an `<ins>` slot, so free-tier users never
 * saw an ad despite the script loading. This is that slot: one banner,
 * bottom-center of the app screens (not the marketing landing page).
 *
 * Requires an AdSense "Display ad" unit's slot ID in
 * NEXT_PUBLIC_ADSENSE_BANNER_SLOT — same "absent config disables the
 * feature" pattern as the client ID.
 */
export function BannerAd() {
  const enabled = useAdsEnabled();

  useEffect(() => {
    if (!enabled || !CLIENT_ID || !SLOT_ID) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense script not loaded yet (e.g. blocked by an ad blocker) —
      // nothing useful to do client-side about that.
    }
  }, [enabled]);

  if (!enabled || !CLIENT_ID || !SLOT_ID) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-20 flex justify-center border-t border-border bg-background py-1 md:bottom-0">
      <ins
        className="adsbygoogle"
        style={{ display: "inline-block", width: 320, height: 50 }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={SLOT_ID}
      />
    </div>
  );
}
