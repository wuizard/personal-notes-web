import type {Metadata} from "next";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {routing} from "@/i18n/routing";
import {PolicyDocument} from "@/features/legal/policy-document";
import {privacyPolicyFor} from "@/features/legal/privacy-content";
import {BrandMark} from "@/shared/ui/brand-mark";

/**
 * The privacy policy — server-rendered and indexable.
 *
 * Unlike the app screens (which are deliberately noindex, docs/10 §10.9),
 * this page must be crawlable: AdSense review checks for a reachable privacy
 * policy, and so does anyone deciding whether to trust a notes app with their
 * notes. It sits outside the (app) route group so it carries no app chrome —
 * a legal page should read like a document, not like a screen in a product.
 */

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const policy = privacyPolicyFor(locale);

  return {
    title: policy.title,
    description: policy.summary[0],
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}/privacy`]),
      ),
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const format = await getFormatter();
  const policy = privacyPolicyFor(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border px-5 py-3">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <BrandMark size={24} className="shrink-0" />
          <span className="text-[14.5px] font-semibold tracking-tight">{t("app.name")}</span>
        </Link>
      </header>

      <main className="flex-1">
        <PolicyDocument
          policy={policy}
          updatedLabel={t("legal.lastUpdated")}
          formattedDate={format.dateTime(new Date(policy.updated), {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        />
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-[13px] text-muted">
        <Link href="/" className="underline underline-offset-2">
          {t("legal.backHome")}
        </Link>
      </footer>
    </div>
  );
}
