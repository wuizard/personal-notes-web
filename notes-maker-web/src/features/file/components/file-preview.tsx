"use client";

import { Download, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useObjectUrl } from "@/features/image/use-object-url";
import type { LocalFile } from "@/features/storage";
import { downloadBlob, formatBytes } from "../kind";

/**
 * Renders one attachment at full size, by kind.
 *
 * Every branch also offers download, because a preview can fail for reasons
 * this app cannot control — a codec the browser lacks, a PDF viewer that is
 * disabled on mobile. Download is the guarantee; preview is the convenience.
 */
export function FilePreview({ file }: { file: LocalFile }) {
  const t = useTranslations("editor");
  const url = useObjectUrl(file.blob);

  if (!url) return <div className="min-h-40" aria-busy="true" />;

  switch (file.kind) {
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL
        <img
          src={url}
          alt={file.name}
          width={file.width}
          height={file.height}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      );

    case "video":
      return (
        <video
          src={url}
          controls
          // No autoplay: an attachment opening with sound is hostile.
          className="max-h-full max-w-full rounded-lg"
        >
          {t("previewUnavailable")}
        </video>
      );

    case "pdf":
      return (
        // <object> rather than <iframe>: it degrades to its children when the
        // browser has no PDF viewer, which is common on mobile.
        <object data={url} type="application/pdf" className="h-full w-full rounded-lg">
          <FallbackDownload file={file} />
        </object>
      );

    case "markdown":
      return <MarkdownPreview file={file} />;

    default:
      return <FallbackDownload file={file} />;
  }
}

/**
 * Markdown is shown as source, not rendered.
 *
 * Rendering it would mean parsing untrusted text into HTML — an XSS vector
 * against the user, from a file they may not have written. The raw text is a
 * legitimate preview and costs nothing to trust.
 */
function MarkdownPreview({ file }: { file: LocalFile }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Cap the read: a 25MB "markdown" file would otherwise lock the tab.
    file.blob
      .slice(0, 512 * 1024)
      .text()
      .then((value: string) => {
        if (!cancelled) setText(value);
      })
      .catch(() => {
        if (!cancelled) setText("");
      });
    return () => {
      cancelled = true;
    };
  }, [file.blob]);

  if (text === null) return <div className="min-h-40" aria-busy="true" />;

  return (
    <pre className="max-h-full w-full max-w-3xl overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-5 text-left font-mono text-[13px] leading-relaxed text-foreground">
      {text}
    </pre>
  );
}

function FallbackDownload({ file }: { file: LocalFile }) {
  const t = useTranslations("editor");

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-8 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
        <FileText size={24} strokeWidth={1.75} aria-hidden />
      </span>
      <p className="max-w-[32ch] break-all text-[14px] font-medium text-foreground">{file.name}</p>
      <p className="text-[12.5px] text-muted">
        {formatBytes(file.bytes)} · {t("previewUnavailable")}
      </p>
      <button
        type="button"
        onClick={() => downloadBlob(file.blob, file.name)}
        className="mt-1 flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        <Download size={15} strokeWidth={2} aria-hidden />
        {t("download")}
      </button>
    </div>
  );
}
