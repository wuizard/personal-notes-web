"use client";

import { Archive, Bell, NotebookText, Settings, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { ThemeToggle } from "./theme-toggle";
import { LocaleSwitcher } from "./locale-switcher";

const NAV = [
  { href: "/notes", key: "notes", icon: NotebookText },
  { href: "/reminders", key: "reminders", icon: Bell },
  { href: "/archive", key: "archive", icon: Archive },
  { href: "/trash", key: "trash", icon: Trash2 },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

/**
 * App chrome — docs/06 §6.1.
 *
 * Persistent sidebar on desktop, bottom tab bar on mobile. No drawer: a
 * hamburger hides the primary navigation behind an extra tap for the exact
 * users who have the least screen patience, and thumbs reach the bottom of a
 * phone far more easily than the top-left corner.
 *
 * Chrome stays near-neutral so notes carry all the colour (docs/05 §5.1).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    // h-dvh + overflow-hidden so the list and editor panes scroll
    // independently instead of the whole document scrolling as one.
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      {/* ── desktop sidebar ── */}
      <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col gap-0.5 border-r border-border bg-background p-2.5 md:flex">
        <Link
          href="/notes"
          className="flex items-center gap-2.5 rounded-lg px-2.5 pb-4 pt-1"
        >
          <span className="flex size-6.5 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-accent-foreground">
            N
          </span>
          <span className="text-[14.5px] font-semibold tracking-tight">{t("app.name")}</span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {NAV.filter((n) => n.key !== "settings").map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[13.5px] transition-colors ${
                isActive(href)
                  ? "bg-accent-soft font-semibold text-accent-soft-foreground"
                  : "text-muted hover:bg-surface-secondary hover:text-foreground"
              }`}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-0.5">
          <Link
            href="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[13.5px] transition-colors ${
              isActive("/settings")
                ? "bg-accent-soft font-semibold text-accent-soft-foreground"
                : "text-muted hover:bg-surface-secondary hover:text-foreground"
            }`}
          >
            <Settings size={16} strokeWidth={1.75} aria-hidden />
            {t("nav.settings")}
          </Link>

          {/* Local-only storage is a promise, not a limitation — say so. */}
          <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted">
            <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
            {t("storage.local")}
          </p>

          <div className="flex items-center gap-1 px-1 pb-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ── content ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar: brand + controls only. Navigation lives at the bottom. */}
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5 md:hidden">
          <span className="flex size-6.5 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-accent-foreground">
            N
          </span>
          <span className="text-[14.5px] font-semibold tracking-tight">{t("app.name")}</span>
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </header>

        {/* pb-16 on mobile keeps content clear of the fixed tab bar.
            Pages own their own scrolling. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* ── mobile bottom tab bar ── */}
      <nav
        aria-label={t("nav.menu")}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              // min-h-[3.25rem] keeps every tab at a 44px+ touch target.
              className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 text-[10px] transition-colors ${
                active ? "font-semibold text-accent-soft-foreground" : "text-muted"
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {t(`nav.${key}`)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
