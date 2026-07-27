"use client";

import {useTranslations} from "next-intl";
import {useId, useState} from "react";
import {authErrorKey, isUserCancelled, registerWithEmail, signInWithEmail, signInWithGoogle,} from "./firebase";

type Mode = "signIn" | "create";

/**
 * The two sign-in methods, and no more (docs/10 §10.6): Google and
 * email/password, both through Firebase Auth. The dialog also carries the
 * local-first promise — signing in never uploads notes — because that is the
 * question every privacy-minded user is silently asking at this exact moment.
 */
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("auth");
  const titleId = useId();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setErrorKey(null);
    try {
      await action();
      onClose();
    } catch (error) {
      if (!isUserCancelled(error)) {
        const key = authErrorKey(error);
        // Anything landing in the generic bucket is, by definition, a code
        // we haven't mapped — usually a Firebase Console misconfiguration
        // (provider disabled, unauthorized domain) rather than something the
        // person in front of the dialog did. Logging it is the only way a
        // solo maintainer finds out without a support ticket.
        if (key === "unknown") console.error("[auth] unmapped sign-in error:", error);
        setErrorKey(key);
      }
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-[var(--shadow-modal)]">
        <h2 id={titleId} className="text-[16px] font-semibold">
          {t("dialogTitle")}
        </h2>

        <button
          type="button"
          disabled={busy}
          onClick={() => void run(signInWithGoogle)}
          className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-[13.5px] font-medium transition-colors hover:bg-surface-secondary disabled:opacity-50"
        >
          <GoogleMark />
          {t("google")}
        </button>

        <div className="my-4 flex items-center gap-3 text-[11.5px] uppercase tracking-[0.12em] text-ink-subtle">
          <span className="h-px flex-1 bg-border" aria-hidden />
          {t("or")}
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>

        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              mode === "signIn"
                ? signInWithEmail(email, password)
                : registerWithEmail(email, password),
            );
          }}
        >
          <label className="flex flex-col gap-1 text-[12.5px] font-medium text-muted">
            {t("email")}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium text-muted">
            {t("password")}
            <input
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </label>

          {errorKey && (
            <p role="alert" className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-[12.5px] text-danger-soft-foreground">
              {t(`error.${errorKey}`)}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-xl bg-accent px-3.5 py-2.5 text-[13.5px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {mode === "signIn" ? t("submitSignIn") : t("submitCreate")}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "signIn" ? "create" : "signIn"));
            setErrorKey(null);
          }}
          className="mt-3 text-[12.5px] text-accent-soft-foreground hover:underline"
        >
          {mode === "signIn" ? t("toggleToCreate") : t("toggleToSignIn")}
        </button>

        {/* The local-first promise, where the doubt arises — docs/10 §10.6. */}
        <p className="mt-4 rounded-xl bg-surface-secondary px-3 py-2 text-[12px] leading-relaxed text-muted">
          {t("localFirstNote")}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-secondary"
        >
          {t("close")}
        </button>
      </div>
    </div>
  );
}

/** The four-colour G, inline so no external asset is fetched. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}
