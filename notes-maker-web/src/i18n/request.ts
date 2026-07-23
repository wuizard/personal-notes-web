import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Reminders are computed against the user's own clock; keep formatting
    // consistent with it. Timezone handling matters more in Phase 2 when
    // reminders fire server-side (docs/03 §3.7).
    now: new Date(),
  };
});
