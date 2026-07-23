"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useIsDesktop } from "@/shared/hooks/use-media-query";
import { NoteList } from "./note-list";
import { NoteEditor } from "./note-editor";

/**
 * Master-detail workspace — the desktop layout of Evernote / Apple Notes
 * rather than Keep's centred modal.
 *
 * Reading and editing a note while the rest of the library stays visible is
 * the whole point; a centred dialog hides the list at exactly the moment you
 * want to move between notes. (This supersedes the Keep-style modal originally
 * specified in docs/06 §6.2 — see the note there.)
 *
 * Selection lives in `?note=` rather than component state so that a note is
 * linkable, survives reload, and — the reason that actually matters — the
 * mobile back button closes the editor instead of leaving the app.
 */
export function NoteWorkspace() {
  const t = useTranslations("editor");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isDesktop = useIsDesktop();

  const selectedId = params.get("note");

  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("note", id);
      else next.delete("note");

      const href = `${pathname}${next.size ? `?${next}` : ""}`;
      // On mobile the editor is a full screen, so it earns a history entry and
      // Back closes it. On desktop it is just a pane — pushing there would
      // turn ten clicks into ten history entries the user must escape.
      if (isDesktop) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [isDesktop, params, pathname, router],
  );

  const showEditor = isDesktop || selectedId !== null;
  const showList = isDesktop || selectedId === null;

  return (
    <div className="flex h-full min-h-0">
      {showList && (
        <div className="flex min-h-0 w-full flex-col border-border md:w-[21rem] md:shrink-0 md:border-r">
          <NoteList selectedId={selectedId} onSelect={select} />
        </div>
      )}

      {showEditor && (
        <div className="flex min-h-0 w-full flex-col">
          {selectedId ? (
            <NoteEditor
              key={selectedId}
              noteId={selectedId}
              onClose={() => select(null)}
              showBack={!isDesktop}
            />
          ) : (
            <div className="hidden flex-1 items-center justify-center p-8 md:flex">
              <p className="max-w-[28ch] text-center text-sm text-muted">{t("none")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
