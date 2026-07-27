"use client";

import {useSyncExternalStore} from "react";
import type {NoteColor} from "@/features/storage/types";
import {APP_COLOR_KEY} from "./app-color";

/** Client half of the app colour wash — see app-color.ts for the design. */

const EVENT = "nm-app-color-change";

export function getAppColor(): NoteColor | null {
  try {
    return (localStorage.getItem(APP_COLOR_KEY) as NoteColor | null) ?? null;
  } catch {
    return null;
  }
}

export function setAppColor(color: NoteColor | null): void {
  try {
    if (color) localStorage.setItem(APP_COLOR_KEY, color);
    else localStorage.removeItem(APP_COLOR_KEY);
  } catch {
    // Private modes can refuse localStorage; the attribute below still
    // applies the wash for this session.
  }
  if (color) document.documentElement.setAttribute("data-app-color", color);
  else document.documentElement.removeAttribute("data-app-color");
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  // Other tabs write the same key; "storage" keeps them in step.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useAppColor(): NoteColor | null {
  return useSyncExternalStore(subscribe, getAppColor, () => null);
}
