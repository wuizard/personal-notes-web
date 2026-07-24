import { getTranslations, setRequestLocale } from "next-intl/server";
import { CloudOff, ListChecks, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { NOTE_COLORS } from "@/features/storage/types";
import { BrandMark } from "@/shared/ui/brand-mark";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";

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

  return (
    <div className="flex min-h-dvh flex-col">
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

        {/* The palette, shown rather than described — and each swatch starts a
            note in that colour. Anything that looks this much like a button
            has to actually be one, and has to say what it does: without the
            caption, people read these as a decorative theme picker. */}
        <p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-ink-subtle">
          {t("landing.pickColorLabel")}
        </p>
        <ul className="mt-2 flex flex-wrap gap-1" aria-label={t("landing.pickColorLabel")}>
          {NOTE_COLORS.map((c) => (
            <li key={c}>
              <Link
                href={{ pathname: "/notes", query: { color: c } }}
                title={t("landing.startInColor", { color: t(`color.${c}`) })}
                aria-label={t("landing.startInColor", { color: t(`color.${c}`) })}
                // Visually 36px, padded to a 44px target (docs/05 §5.9).
                className="group grid size-11 place-items-center rounded-full"
              >
                <span
                  className="block size-9 rounded-full border border-[var(--card-border)] transition-transform duration-150 group-hover:scale-110"
                  style={{ background: `var(--note-${c})` }}
                />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
