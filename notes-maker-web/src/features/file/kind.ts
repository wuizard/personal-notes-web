import type {FileKind} from "@/features/storage/types";

/**
 * Classifies an attachment for preview purposes.
 *
 * MIME type is checked first because it is what the browser will actually use
 * to render the file; the extension is a fallback for the cases where the OS
 * hands over an empty or wrong type — markdown in particular is frequently
 * delivered as `text/plain` or nothing at all.
 */
export function classify(mime: string, name: string): FileKind {
  const type = (mime || "").toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type === "text/markdown" || ext === "md" || ext === "markdown") return "markdown";
  return "other";
}

/** True when the kind has a real in-app preview rather than a placeholder. */
export function isPreviewable(kind: FileKind): boolean {
  return kind !== "other";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Triggers a download of a stored blob under its original filename.
 *
 * The object URL is revoked a tick later rather than synchronously — revoking
 * immediately cancels the download in some browsers.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
