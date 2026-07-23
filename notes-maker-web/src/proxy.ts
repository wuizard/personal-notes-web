import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, and anything with a file extension
  // (so the manifest, icons, and the service worker are never rewritten).
  matcher: ["/((?!api|_next|_vercel|sw.js|manifest.webmanifest|.*\\..*).*)"],
};
