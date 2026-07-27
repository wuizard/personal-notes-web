"use client";

import {useSearchParams} from "next/navigation";
import {useCallback, useMemo} from "react";
import {usePathname, useRouter} from "@/i18n/navigation";
import {useIsDesktop} from "@/shared/hooks/use-media-query";
import {useHotkeys} from "@/shared/hooks/use-hotkeys";
import {NoteList} from "./note-list";
import {NoteEditor} from "./note-editor";
import {NoNoteSelected} from "./no-note-selected";

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

  // docs/06 §6.6. Only the shortcuts that have a meaning in v1 — advertising
  // a key that does nothing is worse than not having it.
  useHotkeys(
    useMemo(
      () => ({
        c: () => document.querySelector<HTMLElement>("[data-compose-trigger]")?.click(),
        "/": () => document.getElementById("note-search")?.focus(),
        Escape: () => {
          const search = document.getElementById("note-search");
          if (document.activeElement === search) (search as HTMLInputElement).blur();
          else if (selectedId) select(null);
        },
      }),
      [selectedId, select],
    ),
  );

  const showEditor = isDesktop || selectedId !== null;
  const showList = isDesktop || selectedId === null;

  return (
    // Rounded card frame on desktop, where both panes sit side by side with
    // room to breathe — mobile shows one full-bleed pane at a time, where a
    // card inset would just eat width for no benefit.
    <div className="flex h-full min-h-0 md:gap-3 md:p-3">
      {showList && (
        <div className="flex min-h-0 w-full flex-col md:w-[21rem] md:shrink-0 md:overflow-hidden md:rounded-2xl md:border md:border-[var(--card-border)] md:bg-surface md:shadow-[var(--shadow-rest)]">
          <NoteList selectedId={selectedId} onSelect={select} />
        </div>
      )}

      {showEditor && (
        <div className="flex min-h-0 w-full flex-col md:overflow-hidden md:rounded-2xl md:border md:border-[var(--card-border)] md:bg-surface md:shadow-[var(--shadow-rest)]">
          {selectedId ? (
            <NoteEditor
              key={selectedId}
              noteId={selectedId}
              onClose={() => select(null)}
              showBack={!isDesktop}
            />
          ) : (
            <div className="hidden flex-1 md:flex">
              <NoNoteSelected />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
