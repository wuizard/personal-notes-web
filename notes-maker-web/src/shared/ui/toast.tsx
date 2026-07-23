"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Toasts with undo — docs/06 §6.5.
 *
 * Every destructive action here is optimistic and undoable rather than
 * confirmed with a dialog. Confirmation dialogs on recoverable actions train
 * people to click through them, which is exactly what you do not want by the
 * time they reach the one action that is genuinely irreversible (empty trash).
 */

const DEFAULT_DURATION_MS = 6000;

interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}

interface ToastApi {
  /** Shows a toast. Returns its id so a caller can dismiss it early. */
  show: (toast: Omit<Toast, "id"> & { durationMs?: number }) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>(
    ({ durationMs = DEFAULT_DURATION_MS, ...toast }) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/*
        `polite` rather than `assertive`: an archive confirmation is not urgent
        enough to interrupt whatever a screen reader is currently saying.
        The region is always rendered so it is not announced as a new landmark
        each time a toast appears.
      */}
      <div
        role="status"
        aria-live="polite"
        // bottom-20 on mobile clears the tab bar; the container ignores
        // pointer events so it never blocks the UI underneath.
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-4 rounded-xl bg-background-inverse px-4 py-3 text-[13.5px] text-background shadow-[var(--shadow-hover)] motion-safe:animate-[toast-in_160ms_cubic-bezier(0.4,0,0.2,1)]"
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  void toast.onAction?.();
                  dismiss(toast.id);
                }}
                className="shrink-0 rounded-md px-1 font-semibold text-[color:var(--accent-hover)] underline-offset-2 hover:underline"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
