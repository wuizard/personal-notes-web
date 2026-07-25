import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

/**
 * `/` → `/en` (the default locale).
 *
 * `localePrefix: "always"` means no page exists at the bare origin, which left
 * `next dev` returning a 404 on localhost:3000. In dev this is a live 307; in
 * the static export it becomes a client-side redirect shell — a fallback only,
 * because in production the Worker answers `/` with the same redirect as a
 * real HTTP response (worker/index.ts).
 */
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`);
}
