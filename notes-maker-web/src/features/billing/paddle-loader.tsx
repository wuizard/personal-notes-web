"use client";

import Script from "next/script";

const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;

/**
 * Loads Paddle.js globally — docs/10 §10.18. Unlike AdSense (gated to free +
 * online users, since ads only make sense there), this loads unconditionally
 * whenever configured: anyone who might open the upgrade dialog needs
 * Paddle.js ready beforehand, and it's a single small script either way.
 *
 * `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` unset — e.g. every local/dev environment
 * without it configured — renders nothing, the same "absent config disables
 * the feature" pattern as shared/ads/adsense.tsx.
 */
export function PaddleLoader() {
  if (!CLIENT_TOKEN) return null;

  return <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" />;
}
