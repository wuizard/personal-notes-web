"use client";

import {I18nProvider} from "@heroui/react";
import {ThemeProvider} from "next-themes";
import type {ReactNode} from "react";
import {ToastProvider} from "./ui/toast";

/**
 * HeroUI v3 needs no provider of its own — it is built on
 * react-aria-components and reads styling from CSS tokens.
 *
 * `I18nProvider` is still required so react-aria formats dates, numbers, and
 * collation for the active locale. Without it, an Indonesian user sees US
 * date formats in the reminder picker.
 *
 * `ThemeProvider` writes `class="dark"` on <html>, which is what the
 * `.dark` selector in globals.css keys off.
 */
export function Providers({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  return (
    <I18nProvider locale={locale}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
