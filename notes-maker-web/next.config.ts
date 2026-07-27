import type {NextConfig} from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /**
   * Static export — deployed to Cloudflare Workers via Static Assets.
   *
   * This app is local-first: every note screen renders client-side against
   * IndexedDB, there are no API routes, no server actions, and no dynamic
   * server APIs. There is genuinely nothing for a server to render, so paying
   * for a runtime would buy nothing.
   *
   * It is also the constraint the Phase 3 Capacitor build needs anyway
   * (docs/01 §1.3) — a static bundle is exactly what ships onto a device.
   * Honouring it now means the mobile port is a packaging step, not a rewrite.
   *
   * Consequences, both accepted:
   *  - No middleware. `src/proxy.ts` was deleted; locale routing is now
   *    `localePrefix: "always"` so every route is prerendered per locale.
   *  - `/` cannot negotiate a locale at the edge, so a small Worker does the
   *    Accept-Language redirect. See worker/index.ts.
   */
  output: "export",

  // The export target has no image optimisation server. Attached images are
  // blob: URLs on plain <img> anyway, so this costs nothing here.
  images: { unoptimized: true },

  // Emit `/notes/index.html` rather than `/notes.html`, which is what static
  // asset servers expect when resolving a directory-style path.
  trailingSlash: false,

  reactStrictMode: true,
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
