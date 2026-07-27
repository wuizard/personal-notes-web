"use client";

import {useId} from "react";

/**
 * Blocking confirmation — reserved for actions that cannot be undone or that
 * discard information (docs/06 §6.5, docs/10 §10.8). Everything reversible
 * stays optimistic with an undo snackbar instead, precisely so this dialog
 * still carries weight when it appears.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive actions get the red button; lossy-but-safe ones the accent. */
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const titleId = useId();

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-[var(--shadow-modal)]">
        <h2 id={titleId} className="text-[16px] font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-[13.5px] text-muted">{body}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => void onConfirm()}
            className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              danger
                ? "bg-danger text-danger-foreground hover:opacity-90"
                : "bg-accent text-accent-foreground hover:bg-accent-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
