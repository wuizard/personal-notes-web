"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { signOutUser } from "@/features/auth/firebase";
import { useAuth } from "@/features/auth/use-auth";
import { countRemoteNotes, deleteRemoteNotes, wipeDevice } from "..";

/**
 * The word the user must type, identical in both locales on purpose: it is a
 * speed bump, not a vocabulary test, and matching the visible prompt exactly
 * matters more than translating it.
 */
const CONFIRM_WORD = "DELETE";

/**
 * Settings → Danger zone: delete everything and start over.
 *
 * The one action in the app that destroys data without a trash can under it,
 * so it confirms harder than anything else: a modal that spells out the blast
 * radius, plus typed confirmation (docs/06 §6.5 reserves blocking dialogs for
 * exactly this). On confirm it signs out, wipes the device, and hard-navigates
 * to the landing page — a full load, so no in-memory state survives.
 *
 * When the account holds remote notes (Phase 2, see ../remote.ts) the dialog
 * additionally asks whether to keep them for a later sync or delete them too.
 */
export function ResetPanel() {
  const t = useTranslations();
  const locale = useLocale();
  const { user } = useAuth();
  const titleId = useId();
  const inputId = useId();

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [remoteCount, setRemoteCount] = useState(0);
  const [remoteChoice, setRemoteChoice] = useState<"keep" | "delete">("keep");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function openDialog() {
    setTyped("");
    setRemoteChoice("keep");
    setError(false);
    // Counted at open time, not render time: the answer decides whether the
    // remote step exists at all, and it must reflect this moment.
    setRemoteCount(user ? await countRemoteNotes(user.uid).catch(() => 0) : 0);
    setOpen(true);
  }

  async function onConfirm() {
    setBusy(true);
    setError(false);
    try {
      if (user && remoteChoice === "delete" && remoteCount > 0) {
        await deleteRemoteNotes(user.uid);
      }
      if (user) {
        // Best-effort: an offline sign-out must not keep the wipe hostage —
        // the session token dies with the storage wipe below anyway.
        await signOutUser().catch(() => {});
      }
      await wipeDevice();
      // Full navigation, not a router push: the point is to boot fresh, and
      // every live query and provider above us still holds the old world.
      window.location.assign(`/${locale}`);
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-danger">
        <Trash2 size={17} strokeWidth={1.75} aria-hidden />
        {t("storage.reset")}
      </h2>
      <p className="mt-1.5 text-[13px] text-muted">{t("storage.resetExplain")}</p>

      <button
        type="button"
        onClick={() => void openDialog()}
        className="mt-4 rounded-xl border border-danger px-4 py-2 text-[13px] font-semibold text-danger transition-colors hover:bg-danger hover:text-danger-foreground"
      >
        {t("storage.reset")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-[var(--shadow-modal)]">
            <h2 id={titleId} className="text-[16px] font-semibold">
              {t("storage.resetTitle")}
            </h2>

            <p className="mt-2 text-[13.5px] text-muted">{t("storage.resetExplain")}</p>
            <p className="mt-2 text-[13px] text-muted">{t("storage.resetBackupHint")}</p>

            {user && remoteCount > 0 ? (
              <fieldset className="mt-4 rounded-xl border border-border p-3.5">
                <legend className="px-1 text-[13px] font-medium">
                  {t("storage.resetRemoteFound", { count: remoteCount })}
                </legend>
                <div className="flex flex-col gap-2.5">
                  {(
                    [
                      { value: "keep", label: "resetRemoteKeep", hint: "resetRemoteKeepHint" },
                      { value: "delete", label: "resetRemoteDelete", hint: null },
                    ] as const
                  ).map(({ value, label, hint }) => (
                    <label key={value} className="flex items-start gap-2.5 text-[13px]">
                      <input
                        type="radio"
                        name="remote-notes"
                        value={value}
                        checked={remoteChoice === value}
                        onChange={() => setRemoteChoice(value)}
                        className="mt-0.5 accent-[var(--accent)]"
                      />
                      <span>
                        {t(`storage.${label}`)}
                        {hint && (
                          <span className="mt-0.5 block text-[12px] text-ink-subtle">
                            {t(`storage.${hint}`)}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                {remoteChoice === "delete" && (
                  <p className="mt-3 flex gap-2 rounded-lg bg-danger-soft p-2.5 text-[12.5px] text-danger-soft-foreground">
                    <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
                    {t("storage.resetRemoteWarn")}
                  </p>
                )}
              </fieldset>
            ) : (
              user && <p className="mt-2 text-[13px] text-muted">{t("storage.resetSignOutNote")}</p>
            )}

            <label htmlFor={inputId} className="mt-4 block text-[13px] font-medium">
              {t("storage.resetConfirm")}
            </label>
            <input
              id={inputId}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              // Initial focus must land inside a modal; the input is the
              // dialog's entire purpose.
              autoFocus
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13.5px] tracking-widest outline-none focus:border-danger"
            />

            {error && (
              <p className="mt-3 rounded-xl bg-danger-soft p-3 text-[13px] text-danger-soft-foreground">
                {t("storage.resetError")}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-secondary disabled:opacity-60"
              >
                {t("trash.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void onConfirm()}
                disabled={!armed || busy}
                className="rounded-xl bg-danger px-3.5 py-2 text-[13px] font-semibold text-danger-foreground transition-colors hover:opacity-90 disabled:opacity-40"
              >
                {busy ? t("storage.resetDeleting") : t("storage.resetCta")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
