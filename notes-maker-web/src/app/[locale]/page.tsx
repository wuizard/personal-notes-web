import {getTranslations, setRequestLocale} from "next-intl/server";
import {CloudOff, ListChecks, ShieldCheck} from "lucide-react";
import {Link} from "@/i18n/navigation";
import {AppColorSwatches} from "@/shared/ui/app-color-swatches";
import {BrandMark} from "@/shared/ui/brand-mark";
import {ThemeToggle} from "@/shared/ui/theme-toggle";
import {LocaleSwitcher} from "@/shared/ui/locale-switcher";

/**
 * Marketing landing page.
 *
 * This is one of the few server-rendered surfaces in the app — it needs SEO
 * for organic traffic and AdSense approval (docs/00 §0.4), and it is NOT part
 * of the eventual Capacitor bundle (docs/01 §1.3), so server rendering here
 * costs nothing later.
 */
export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  // SoftwareApplication rich-result eligibility: name/description reuse the
  // same seo.* strings as <meta name="description">, so the structured data
  // never drifts out of sync with what's actually in the page's own <head>.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Notes Maker",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    description: t("seo.description"),
    url: `https://quickchecklist.app/${locale}`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="flex items-center gap-3 px-6 py-4">
        <BrandMark size={28} />
        <span className="font-semibold tracking-tight">{t("app.name")}</span>
        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {t("landing.heroTitle")}
        </h1>
        <p className="max-w-prose text-lg text-muted">{t("landing.heroBody")}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/notes"
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            {t("landing.cta")}
          </Link>
          <span className="text-sm text-muted">{t("landing.noAccount")}</span>
        </div>

        {/* The wedge, spelled out — docs/00 §0.9 via docs/10 §10.9: local-first
            privacy is the differentiator, so the marketing page says exactly
            where notes live instead of gesturing at "privacy". */}
        <ul className="mt-12 grid gap-3 sm:grid-cols-3" role="list">
          {(
            [
              { key: "privacy", icon: ShieldCheck },
              { key: "checklist", icon: ListChecks },
              { key: "offline", icon: CloudOff },
            ] as const
          ).map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="rounded-2xl border border-[var(--card-border)] bg-surface p-4 shadow-[var(--shadow-rest)]"
            >
              <Icon size={18} strokeWidth={1.75} className="text-accent" aria-hidden />
              <h2 className="mt-2.5 text-[14px] font-semibold">
                {t(`landing.features.${key}Title`)}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {t(`landing.features.${key}Body`)}
              </p>
            </li>
          ))}
        </ul>

        {/* The palette, shown rather than described — each swatch is now a
            real theme picker: it sets the app-wide colour wash and enters
            the app (people read these as a theme picker anyway, so that is
            what they became). */}
        <AppColorSwatches />
      </main>
    </div>
  );
}
