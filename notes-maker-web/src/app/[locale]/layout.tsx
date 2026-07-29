import type {Metadata, Viewport} from "next";
import {GeistSans} from "geist/font/sans";
import {GeistMono} from "geist/font/mono";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {routing, type Locale} from "@/i18n/routing";
import {AdSense} from "@/shared/ads/adsense";
import {appColorBootScript} from "@/shared/app-color";
import {Providers} from "@/shared/providers";
import {RegisterServiceWorker} from "@/shared/pwa/register-sw";
import "../globals.css";

/**
 * Fonts ship in the `geist` package rather than via `next/font/google`.
 *
 * Both self-host the font at runtime, but `next/font/google` *downloads* it
 * from Google at BUILD time — which makes every deploy depend on a third-party
 * network call. That is a real failure mode, not a theoretical one: it broke a
 * local build and is the prime suspect for the Cloudflare build failure.
 *
 * The npm package carries the .woff2 files, so the build is hermetic.
 */

const SITE_URL = "https://quickchecklist.app";

/**
 * Per-locale metadata — title/description come from messages/*.json's `seo`
 * namespace so they can be keyword-targeted independently of the friendlier
 * on-page hero copy (landing.heroTitle/heroBody), while staying in the same
 * translation files check:messages already keeps in sync across locales.
 *
 * `alternates.languages` emits hreflang tags so Google attributes /en and
 * /id as translations of each other rather than as duplicate content in
 * different languages — without it, two fully-translated URLs for the same
 * page can compete against each other in search instead of each ranking in
 * its own market.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  const title = t("title");
  const description = t("description");
  const path = `/${locale}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: "%s · Notes Maker" },
    description,
    applicationName: "Notes Maker",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Notes Maker" },
    icons: {
      icon: [
        { url: "/icons/favicon.svg", type: "image/svg+xml" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    alternates: {
      canonical: path,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}`]),
      ) as Record<Locale, string>,
    },
    openGraph: {
      type: "website",
      url: path,
      siteName: "Notes Maker",
      title,
      description,
      locale,
      images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: ["/icons/icon-512.png"],
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#141118" },
  ],
  // Notes contain user text; never block them from zooming it.
  maximumScale: 5,
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Opts this route into static rendering — without it every page becomes
  // dynamic the moment a translation is read.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      // next-themes writes class="dark" here on the client; suppressing the
      // hydration warning is the documented cost of avoiding a theme flash.
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full`}
    >
      <head>
        <meta name="google-adsense-account" content="ca-pub-3014369083955512" />
      </head>
      <body className="min-h-full">
        {/* Applies the stored app colour wash before first paint — the same
            no-flash trick next-themes uses for the dark class. */}
        <script dangerouslySetInnerHTML={{ __html: appColorBootScript }} />
        <NextIntlClientProvider>
          <Providers locale={locale}>{children}</Providers>
        </NextIntlClientProvider>
        <RegisterServiceWorker />
        <AdSense />
      </body>
    </html>
  );
}
