import type {Metadata, Viewport} from "next";
import {GeistSans} from "geist/font/sans";
import {GeistMono} from "geist/font/mono";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {routing} from "@/i18n/routing";
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

export const metadata: Metadata = {
  title: { default: "Notes Maker", template: "%s · Notes Maker" },
  description: "Free, no account, stored in your own browser.",
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
};

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
