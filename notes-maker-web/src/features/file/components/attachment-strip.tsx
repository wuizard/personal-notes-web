"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, FileText, FileType, Film, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useObjectUrl } from "@/features/image/use-object-url";
import type { FileKind, LocalFile } from "@/features/storage";
import { deleteFile, listFiles } from "../repo";
import { downloadBlob, formatBytes } from "../kind";
import { FileViewer } from "./file-viewer";

const KIND_ICON: Record<Exclude<FileKind, "image">, typeof FileText> = {
  video: Film,
  pdf: FileType,
  markdown: FileText,
  other: FileText,
};

/**
 * Attachment strip for a note — docs/06 §6.3.
 *
 * Images show their ~400px thumbnail; everything else gets a typed tile with
 * its name and size. Both open the viewer, and both offer download — the
 * download is the guarantee, since a preview can fail for reasons outside the
 * app's control.
 */
export function AttachmentStrip({ noteId }: { noteId: string }) {
  const t = useTranslations("editor");
  const files = useLiveQuery(() => listFiles(noteId), [noteId]);
  const [viewing, setViewing] = useState<number | null>(null);

  if (!files?.length) return null;

  return (
    <>
      <ul className="flex flex-wrap gap-2" role="list" aria-label={t("attachments")}>
        {files.map((file, i) => (
          <AttachmentTile key={file.id} file={file} onOpen={() => setViewing(i)} />
        ))}
      </ul>

      {viewing !== null && (
        <FileViewer
          files={files}
          // Deleting the last attachment while the viewer is open would leave
          // the index past the end; clamping keeps it on a real file.
          index={Math.min(viewing, files.length - 1)}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

function AttachmentTile({ file, onOpen }: { file: LocalFile; onOpen: () => void }) {
  const t = useTranslations("editor");
  // Only images have a thumb; passing undefined allocates nothing.
  const thumbUrl = useObjectUrl(file.kind === "image" ? file.thumb : undefined);
  const Icon = file.kind === "image" ? FileText : KIND_ICON[file.kind];

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t("openFile")}: ${file.name}`}
        title={`${t("openFile")}: ${file.name}`}
        className="block overflow-hidden rounded-lg border border-[var(--card-border)] transition-transform hover:scale-[1.03]"
      >
        {file.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: URL
          <img
            src={thumbUrl ?? undefined}
            alt={file.name}
            width={72}
            height={72}
            className="size-18 object-cover"
          />
        ) : (
          <span className="flex size-18 flex-col items-center justify-center gap-1 bg-surface px-1.5 text-center">
            <Icon size={20} strokeWidth={1.75} className="text-muted" aria-hidden />
            <span className="line-clamp-2 break-all text-[9.5px] leading-tight text-muted">
              {file.name}
            </span>
            <span className="text-[9px] text-ink-subtle">{formatBytes(file.bytes)}</span>
          </span>
        )}
      </button>

      <div className="absolute -right-1.5 -top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => downloadBlob(file.blob, file.name)}
          aria-label={`${t("download")}: ${file.name}`}
          title={t("download")}
          className="grid size-6 place-items-center rounded-full bg-background-inverse text-background transition-opacity hover:opacity-80"
        >
          <Download size={11} strokeWidth={2.5} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void deleteFile(file.id)}
          aria-label={`${t("removeFile")}: ${file.name}`}
          title={t("removeFile")}
          className="grid size-6 place-items-center rounded-full bg-background-inverse text-background transition-opacity hover:opacity-80"
        >
          <X size={11} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </li>
  );
}

/** Local previews for files not yet attached to a saved note (compose). */
export function PendingAttachmentStrip({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  const t = useTranslations("editor");
  if (!files.length) return null;

  return (
    <ul className="flex flex-wrap gap-2" role="list">
      {files.map((file, i) => (
        <PendingTile
          key={`${file.name}-${file.lastModified}-${i}`}
          file={file}
          removeLabel={t("removeFile")}
          onRemove={() => onRemove(i)}
        />
      ))}
    </ul>
  );
}

function PendingTile({
  file,
  removeLabel,
  onRemove,
}: {
  file: File;
  removeLabel: string;
  onRemove: () => void;
}) {
  const isImage = file.type.startsWith("image/");
  const url = useObjectUrl(isImage ? file : undefined);

  return (
    <li className="group relative">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL
        <img
          src={url ?? undefined}
          alt={file.name}
          width={56}
          height={56}
          className="size-14 rounded-lg border border-[var(--card-border)] object-cover"
        />
      ) : (
        <span className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-[var(--card-border)] bg-surface px-1 text-center">
          <FileText size={16} strokeWidth={1.75} className="text-muted" aria-hidden />
          <span className="line-clamp-1 break-all text-[8.5px] text-muted">{file.name}</span>
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background-inverse text-background opacity-0 transition-opacity hover:opacity-80 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={11} strokeWidth={2.5} aria-hidden />
      </button>
    </li>
  );
}
