"use client";

import { CircleUserRound, FileText, LogIn, LogOut, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PurchasePlanDialog } from "@/features/billing/purchase-plan-dialog";
import { Link } from "@/i18n/navigation";
import { isFirebaseConfigured, signOutUser } from "./firebase";
import { useAuth } from "./use-auth";
import { SignInDialog } from "./sign-in-dialog";

const ABOUT_US_URL = "https://wuebuild.com";
const FEEDBACK_EMAIL = "wwcolaborationprojects@gmail.com";

const itemClass =
  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface-secondary";

/**
 * The profile icon — docs/10 §10.6, revamped per user request into a full
 * menu (About Us, Feedback, Purchase Plan, then Sign in/out last) rather
 * than a bare avatar button.
 *
 * Always renders, signed in or not: About Us / Feedback / Purchase Plan
 * don't need an account, so gating the whole menu behind Firebase config
 * would hide three unrelated features because of one unconfigured one. Only
 * the sign-in row itself is conditional on Firebase being set up — signed
 * out AND unconfigured, it's simply omitted (anonymous usage stays
 * first-class, docs/10 §10.6).
 */
export function AuthMenu({ direction = "down" }: { direction?: "up" | "down" }) {
  const t = useTranslations("auth");
  const tLegal = useTranslations("legal");
  const { user, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const authReady = isFirebaseConfigured();

  if (authReady && loading) {
    return <span className="grid size-9 place-items-center" aria-busy="true" />;
  }

  const initial = (user?.displayName ?? user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label={t("menu")}
        aria-expanded={menuOpen}
        className="grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
      >
        {user?.photoURL ? (
          // Firebase avatars come from Google's CDN; next/image would need a
          // remotePatterns allowance for no gain on a 28px thumbnail.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="size-7 rounded-full"
          />
        ) : user ? (
          <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-[12.5px] font-semibold text-accent-soft-foreground">
            {initial}
          </span>
        ) : (
          <CircleUserRound size={18} strokeWidth={1.75} aria-hidden />
        )}
      </button>

      {menuOpen && (
        <>
          {/* Invisible backdrop: any click outside closes the menu. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className={`absolute z-50 w-60 rounded-2xl border border-[var(--card-border)] bg-surface p-1.5 shadow-[var(--shadow-modal)] ${
              direction === "up" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"
            }`}
          >
            <a
              href={ABOUT_US_URL}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className={itemClass}
              onClick={() => setMenuOpen(false)}
            >
              <ShieldCheck size={15} strokeWidth={1.75} aria-hidden />
              {t("aboutUs")}
            </a>
            <a
              href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(t("feedbackSubject"))}`}
              role="menuitem"
              className={itemClass}
              onClick={() => setMenuOpen(false)}
            >
              <Mail size={15} strokeWidth={1.75} aria-hidden />
              {t("feedback")}
            </a>
            {/* Reachable from inside the app, not only from the marketing
                page — the moment someone wonders where their notes go is
                while they are using it, not while they are being sold it. */}
            <Link
              href="/privacy"
              role="menuitem"
              className={itemClass}
              onClick={() => setMenuOpen(false)}
            >
              <FileText size={15} strokeWidth={1.75} aria-hidden />
              {tLegal("privacy")}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setPurchasing(true);
              }}
              className={itemClass}
            >
              <Sparkles size={15} strokeWidth={1.75} aria-hidden />
              {t("purchasePlan")}
            </button>

            {/* Account actions sit last and separated — everything above
                works the same whether or not anyone is signed in. */}
            <div className="mt-1 border-t border-border pt-1">
              {user ? (
                <>
                  <p className="truncate px-2.5 pb-1 pt-1.5 text-[12px] text-muted">
                    {t("signedInAs")}
                    <span className="mt-0.5 block truncate text-[13px] font-medium text-foreground">
                      {user.displayName ?? user.email}
                    </span>
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      await signOutUser();
                      setMenuOpen(false);
                    }}
                    className={itemClass}
                  >
                    <LogOut size={15} strokeWidth={1.75} aria-hidden />
                    {t("signOut")}
                  </button>
                </>
              ) : (
                authReady && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setSigningIn(true);
                    }}
                    className={itemClass}
                  >
                    <LogIn size={15} strokeWidth={1.75} aria-hidden />
                    {t("signIn")}
                  </button>
                )
              )}
            </div>
          </div>
        </>
      )}

      {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
      {purchasing && <PurchasePlanDialog user={user} onClose={() => setPurchasing(false)} />}
    </div>
  );
}
