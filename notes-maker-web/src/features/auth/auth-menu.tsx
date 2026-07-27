"use client";

import {CircleUserRound, LogOut} from "lucide-react";
import {useTranslations} from "next-intl";
import {useState} from "react";
import {isFirebaseConfigured, signOutUser} from "./firebase";
import {useAuth} from "./use-auth";
import {SignInDialog} from "./sign-in-dialog";

/**
 * The profile icon — docs/10 §10.6. Signed-out it opens the sign-in dialog;
 * signed-in it shows the avatar with a small menu. When Firebase is not
 * configured (no .env.local) it renders nothing at all: anonymous usage is a
 * first-class mode, and dead chrome is worse than no chrome.
 */
export function AuthMenu({ direction = "down" }: { direction?: "up" | "down" }) {
  const t = useTranslations("auth");
  const { user, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!isFirebaseConfigured()) return null;
  if (loading) {
    return <span className="grid size-9 place-items-center" aria-busy="true" />;
  }

  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSigningIn(true)}
          aria-label={t("signIn")}
          title={t("signIn")}
          className="grid size-9 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
        >
          <CircleUserRound size={18} strokeWidth={1.75} aria-hidden />
        </button>
        {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
      </>
    );
  }

  const initial = (user.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label={t("profile")}
        aria-expanded={menuOpen}
        className="grid size-9 place-items-center rounded-xl transition-colors hover:bg-surface-secondary"
      >
        {user.photoURL ? (
          // Firebase avatars come from Google's CDN; next/image would need a
          // remotePatterns allowance for no gain on a 28px thumbnail.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="size-7 rounded-full"
          />
        ) : (
          <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-[12.5px] font-semibold text-accent-soft-foreground">
            {initial}
          </span>
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
            className={`absolute z-50 w-56 rounded-2xl border border-[var(--card-border)] bg-surface p-1.5 shadow-[var(--shadow-modal)] ${
              direction === "up" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"
            }`}
          >
            <p className="truncate px-2.5 pb-1.5 pt-1 text-[12px] text-muted">
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
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface-secondary"
            >
              <LogOut size={15} strokeWidth={1.75} aria-hidden />
              {t("signOut")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
