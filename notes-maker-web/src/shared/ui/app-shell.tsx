"use client";

import {Archive, Bell, CheckCheck, NotebookText, Settings, Trash2} from "lucide-react";
import {useTranslations} from "next-intl";
import type {ReactNode} from "react";
import {Link, usePathname} from "@/i18n/navigation";
import {AuthMenu} from "@/features/auth/auth-menu";
import {SyncPill} from "@/features/sync/components/sync-pill";
import {useSyncEngine} from "@/features/sync/use-sync";
import {useSyncStatus} from "@/features/sync/use-sync-status";
import {BannerAd} from "@/shared/ads/banner-ad";
import {ThemeToggle} from "./theme-toggle";
import {LocaleSwitcher} from "./locale-switcher";
import {AppColorPicker} from "./app-color-picker";
import {BrandMark} from "./brand-mark";

const NAV = [
  { href: "/notes", key: "notes", icon: NotebookText },
  { href: "/reminders", key: "reminders", icon: Bell },
  { href: "/archive", key: "archive", icon: Archive },
  // Premium (docs/10 §10.13a) — visible to everyone as an upgrade surface,
  // functional only once a checklist has actually been settled complete.
  { href: "/completed", key: "completed", icon: CheckCheck },
  { href: "/trash", key: "trash", icon: Trash2 },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

/**
 * App chrome — docs/06 §6.1, amended: horizontal top bar on desktop instead
 * of the original sidebar (user request, 2026-07). Primary navigation sits
 * left of the bar with labels; every control that is an icon — palette,
 * locale, theme, settings, profile — clusters on the right. Mobile keeps the
 * bottom tab bar: thumbs still reach the bottom of a phone far more easily
 * than the top corners.
 *
 * The bar stays visible above both workspace panes, so the palette and theme
 * controls remain reachable while a note is open.
 *
 * Chrome stays near-neutral so notes carry the colour (docs/05 §5.1); the
 * one sanctioned exception is the app-wide wash behind it (app-color.ts).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();

  // The app's only mount point for the sync engine — it does nothing at all
  // unless the account is signed in and premium (docs/01 §1.0). Mounted here
  // rather than in Providers so it never runs on the marketing pages.
  useSyncEngine();
  const { state: syncState } = useSyncStatus();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    // h-dvh + overflow-hidden so the list and editor panes scroll
    // independently instead of the whole document scrolling as one.
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* ── top bar ── */}
      <header className="flex items-center gap-1 border-b border-border bg-background px-3 py-2 md:px-4">
        {/* Brand click goes to the marketing landing page, not deeper into the
            app — logo-as-home is the standard convention, and "/notes" is
            already one click away via primary nav. */}
        <Link href="/" className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
          <BrandMark size={26} className="shrink-0" />
          <span className="text-[14.5px] font-semibold tracking-tight">{t("app.name")}</span>
        </Link>

        {/* Primary navigation: desktop only — mobile navigates at the bottom.
            "Notes" is where people live, so it alone keeps a text label;
            everything else is an icon revealed by hover/tooltip, so the bar
            doesn't read as a wall of equally-weighted words. */}
        <nav className="ml-3 hidden items-center gap-0.5 md:flex">
          {NAV.filter((n) => n.key !== "settings").map(({ href, key, icon: Icon }) => {
            const label = key === "notes" ? t("nav.myNotes") : t(`nav.${key}`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                aria-label={label}
                title={key === "notes" ? undefined : label}
                className={`flex items-center gap-2 rounded-[10px] transition-colors ${
                  key === "notes" ? "px-2.5 py-1.5 text-[13.5px]" : "size-9 justify-center"
                } ${
                  isActive(href)
                    ? "bg-accent-soft font-semibold text-accent-soft-foreground"
                    : "text-muted hover:bg-surface-secondary hover:text-foreground"
                }`}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                {key === "notes" && label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* One slot, two truths. Without sync, local-only storage is a
              promise rather than a limitation — say so. With sync running,
              the same slot carries its state, because "stored on this device"
              would then be the less interesting half of the story. */}
          {syncState === "disabled" ? (
            <p className="hidden items-center gap-2 rounded-full border border-border bg-surface-tertiary px-3 py-1.5 text-xs text-muted lg:flex">
              <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
              {t("storage.local")}
            </p>
          ) : (
            <SyncPill />
          )}

          {/* Two functional clusters, each in its own rounded pill, so the
              bar doesn't read as one undifferentiated row of icons: pick a
              look (colour, language) vs. manage the app (theme, settings,
              account). */}
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface-tertiary p-0.5">
            <AppColorPicker />
            <LocaleSwitcher />
          </div>

          <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface-tertiary p-0.5">
            <ThemeToggle />
            {/* Settings joins the icon cluster on desktop; on mobile it is a
                bottom tab, and a second entrance would just be noise. */}
            <Link
              href="/settings"
              aria-label={t("nav.settings")}
              title={t("nav.settings")}
              aria-current={isActive("/settings") ? "page" : undefined}
              className={`hidden size-9 place-items-center rounded-full transition-colors md:grid ${
                isActive("/settings")
                  ? "bg-accent-soft text-accent-soft-foreground"
                  : "text-muted hover:bg-surface-secondary hover:text-foreground"
              }`}
            >
              <Settings size={18} strokeWidth={1.75} aria-hidden />
            </Link>
            <AuthMenu />
          </div>
        </div>
      </header>

      {/* pb-16 on mobile keeps content clear of the fixed tab bar.
          Pages own their own scrolling. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-32 md:pb-16">
        {children}
      </main>

      {/* Fixed like the tab bar below it, for the same reason: the app's
          panes (note list, editor) assume they own the full height of
          <main> and won't shrink to make room for an in-flow sibling.
          `pb-32`/`md:pb-16` above reserves space unconditionally — same
          approach as the tab bar's own always-on `pb-16` — so nothing ever
          renders under it, whether or not an ad actually loads. */}
      <BannerAd />

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
