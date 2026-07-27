"use client";

import {useEffect} from "react";

type Handler = (event: KeyboardEvent) => void;

/**
 * True when the event came from somewhere the user is typing.
 *
 * Without this check, `e` archives a note the moment someone types the letter
 * "e" into the search box — the single most common way a shortcut system
 * becomes actively hostile.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    // ProseMirror's editable surface is contenteditable, but a nested node
    // view may not be — walking up catches those.
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

/**
 * Registers single-key shortcuts — docs/06 §6.6.
 *
 * Keys are matched on `event.key`, so they follow the user's keyboard layout
 * rather than assuming QWERTY physical positions.
 */
export function useHotkeys(
  map: Record<string, Handler>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Never shadow browser or OS chords.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const handler = map[e.key];
      if (!handler) return;

      // Escape is the exception: it must work *from* a field, since its whole
      // job is getting out of one.
      if (e.key !== "Escape" && isTypingTarget(e.target)) return;

      e.preventDefault();
      handler(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [map, enabled]);
}
