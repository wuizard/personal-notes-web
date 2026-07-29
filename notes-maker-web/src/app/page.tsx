import {redirect} from "next/navigation";
import {routing} from "@/i18n/routing";

/**
 * `/` → `/en` (the default locale).
 *
 * `localePrefix: "always"` means no page exists at the bare origin, which left
 * `next dev` returning a 404 on localhost:3000. In dev this is a live 307; in
 * the static export it becomes a client-side redirect shell. `public/index.html`
 * is the one actually served at `/` in production (it's copied over this
 * page's output during the export) and does the same redirect without
 * depending on this component ever hydrating.
 */
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`);
}
