"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    startTransition(() => {
      // `params` carries any dynamic segments of the current route so the user
      // stays on the same page rather than being bounced to the root.
      router.replace(
        // @ts-expect-error -- pathname + params are correlated at runtime but
        // not statically provable to next-intl's typed routing.
        { pathname, params },
        { locale: next },
      );
    });
  }

  return (
    <div className="flex items-center">
      <Languages size={16} strokeWidth={1.75} className="mr-1.5 text-muted" aria-hidden />
      <label className="sr-only" htmlFor="locale-switcher">
        {t("label")}
      </label>
      <select
        id="locale-switcher"
        value={locale}
        disabled={isPending}
        onChange={(e) => switchTo(e.target.value as Locale)}
        className="rounded-lg bg-transparent py-1.5 pr-1 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
