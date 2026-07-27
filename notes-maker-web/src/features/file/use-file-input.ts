"use client";

import {useCallback, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {ImageError} from "@/features/image/pipeline";
import {FileTooLargeError, QuotaExceededError} from "./repo";

/**
 * The three ways a file enters a note — picker, paste, drag-drop — behind one
 * interface, plus translated error copy.
 *
 * Paste and drop matter more than the button: on desktop they are how people
 * actually attach a screenshot or a PDF.
 */
export function useFileInput(onFiles: (files: File[]) => void | Promise<void>) {
  const t = useTranslations("editor.fileError");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      setBusy(true);
      setError(null);
      try {
        await onFiles(files);
      } catch (err) {
        // Each error type carries a stable code so the copy can be translated;
        // anything else is genuinely unexpected.
        if (err instanceof FileTooLargeError) setError(t("too_large"));
        else if (err instanceof QuotaExceededError) setError(t("quota"));
        else if (err instanceof ImageError) setError(t(err.code));
        else setError(t("unknown"));
      } finally {
        setBusy(false);
      }
    },
    [onFiles, t],
  );

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        // Only prevent default when a file is actually present, or pasting
        // text alongside one would be swallowed.
        e.preventDefault();
        void accept(files);
      }
    },
    [accept],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) {
        e.preventDefault();
        void accept(files);
      }
    },
    [accept],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (Array.from(e.dataTransfer?.items ?? []).some((i) => i.kind === "file")) {
      e.preventDefault();
    }
  }, []);

  /** Spread onto a hidden <input type="file">. */
  const inputProps = {
    ref: inputRef,
    type: "file" as const,
    // No accept filter: any file may be attached (docs/08 §8.4). The 25MB cap
    // and the quota check in the repository are the real gates.
    multiple: true,
    className: "sr-only",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      void accept(Array.from(e.target.files ?? []));
      // Reset so picking the same file twice still fires a change event.
      e.target.value = "";
    },
  };

  return {
    inputProps,
    openPicker,
    onPaste,
    onDrop,
    onDragOver,
    error,
    busy,
    clearError: () => setError(null),
  };
}
