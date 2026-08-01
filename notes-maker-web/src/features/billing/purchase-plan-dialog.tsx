"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { AuthUser } from "@/features/auth/firebase";
import { isPaddleConfigured, openPaddleCheckout } from "./paddle";

interface Row {
  key: string;
  free: boolean | string;
  premium: boolean | string;
}

/** docs/10 §10.7 (as amended by §10.14's combined item cap). */
const ROWS: Row[] = [
  { key: "items", free: "5", premium: "100" },
  { key: "images", free: "1", premium: "5" },
  // Framed as the benefit ("ad-free"), not the drawback ("ads") — a
  // checkmark under Premium must mean something Premium actually has.
  // Getting this backwards reads as "Premium users see more ads."
  { key: "adFree", free: false, premium: true },
  { key: "sync", free: false, premium: true },
  { key: "reminders", free: false, premium: true },
  { key: "completed", free: false, premium: true },
];

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span className="tabular-nums">{value}</span>;
  return value ? (
    <Check size={16} strokeWidth={2.5} className="text-success" aria-hidden />
  ) : (
    <X size={16} strokeWidth={2} className="text-ink-subtle opacity-50" aria-hidden />
  );
}

/**
 * Free vs Premium — docs/10 §10.7/§10.14, checkout via §10.20.
 *
 * The Subscribe button opens a real Paddle overlay checkout when configured
 * (`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`/`NEXT_PUBLIC_PADDLE_PRICE_ID`) — not a
 * mock. The backend verifies Paddle's webhook and grants the entitlement
 * (see paddle.ts's header comment and docs/10 §10.20).
 */
export function PurchasePlanDialog({
  user,
  onClose,
}: {
  user: AuthUser | null;
  onClose: () => void;
}) {
  const t = useTranslations("billing");
  const titleId = useId();
  const configured = isPaddleConfigured();
  const [checkoutError, setCheckoutError] = useState(false);

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
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-[var(--shadow-modal)]">
        <h2 id={titleId} className="text-[16px] font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1.5 text-[13px] text-muted">{t("subtitle")}</p>

        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[1fr_4.5rem_4.5rem] bg-surface-secondary text-[12px] font-semibold">
            <span className="px-3 py-2" />
            <span className="px-2 py-2 text-center">{t("free")}</span>
            <span className="px-2 py-2 text-center text-accent-soft-foreground">
              {t("premium")}
            </span>
          </div>
          {ROWS.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_4.5rem_4.5rem] border-t border-border text-[12.5px]"
            >
              <span className="px-3 py-2 text-muted">{t(`rows.${row.key}`)}</span>
              <span className="flex items-center justify-center px-2 py-2">
                <Cell value={row.free} />
              </span>
              <span className="flex items-center justify-center px-2 py-2">
                <Cell value={row.premium} />
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[13px] text-muted">
          {t("price")}
        </p>

        {configured ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (!openPaddleCheckout(user)) setCheckoutError(true);
              }}
              className="mt-3 block w-full rounded-xl bg-accent px-3.5 py-2.5 text-center text-[13.5px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              {t("subscribe")}
            </button>
            {checkoutError && (
              <p className="mt-2 text-center text-[12.5px] text-warning-soft-foreground">
                {t("checkoutError")}
              </p>
            )}
          </>
        ) : (
          // Honest about the current state rather than a dead/fake button —
          // this is genuinely where things stand until Paddle is configured
          // (see .env.local.example).
          <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2.5 text-center text-[12.5px] text-warning-soft-foreground">
            {t("notConfigured")}
          </p>
        )}

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
