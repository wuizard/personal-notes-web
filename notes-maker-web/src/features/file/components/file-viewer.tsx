"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { LocalFile } from "@/features/storage";
import { downloadBlob, formatBytes } from "../kind";
import { FilePreview } from "./file-preview";

/**
 * Full-size attachment viewer.
 *
 * Renders `file.blob` — the stored original — not the thumbnail, so the bytes
 * a user's quota is paying for can actually be seen. Download is always
 * present, because a preview can fail for reasons this app cannot control.
 */
export function FileViewer({
  files,
  index,
  onIndexChange,
  onClose,
}: {
  files: LocalFile[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("editor");
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const file = files[index];
  const many = files.length > 1;

  // Remember what had focus so it can be handed back on close — otherwise
  // dismissing the viewer drops keyboard users at the top of the document.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => restoreRef.current?.focus?.();
  }, []);

  // Escape and arrows are bound in the capture phase: while a modal is open it
  // owns the keyboard, and the list shortcuts underneath must not also fire.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (many && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        // Arrow keys are how you scrub a <video>, so leave them alone when the
        // focus is inside one.
        if ((e.target as HTMLElement)?.tagName === "VIDEO") return;
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        onIndexChange((index + delta + files.length) % files.length);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [index, files.length, many, onIndexChange, onClose]);

  // The body must not scroll behind the overlay.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!file) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      // Closing on backdrop click only — a click that started on the content
      // and ended on the backdrop (a drag) must not dismiss it.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex flex-col bg-black/85 motion-safe:animate-[toast-in_120ms_ease-out]"
    >
      <div className="flex items-center gap-3 p-3 text-white/80">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{file.name}</p>
          <p className="text-[11.5px] text-white/55">
            {formatBytes(file.bytes)}
            {many && ` · ${t("imageCount", { current: index + 1, total: files.length })}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => downloadBlob(file.blob, file.name)}
          aria-label={t("download")}
          className="ml-auto grid size-10 place-items-center rounded-xl hover:bg-white/10"
        >
          <Download size={19} strokeWidth={2} aria-hidden />
        </button>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("closeImage")}
          className="grid size-10 place-items-center rounded-xl hover:bg-white/10"
        >
          <X size={20} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 p-4 pt-0">
        {many && (
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + files.length) % files.length)}
            aria-label={t("prevImage")}
            className="grid size-10 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={22} strokeWidth={2} aria-hidden />
          </button>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          {/* Remounted per file so <video> and <object> reload their source
              rather than keeping the previous one. */}
          <FilePreview key={file.id} file={file} />
        </div>

        {many && (
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % files.length)}
            aria-label={t("nextImage")}
            className="grid size-10 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronRight size={22} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
