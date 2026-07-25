/**
 * App-wide colour wash — the note palette applied to the app canvas.
 *
 * Deliberately NOT part of next-themes: light/dark is a mode, this is a
 * decoration on top of either mode. It lives as a `data-app-color` attribute
 * on <html> (globals.css keys the wash off it) and persists in localStorage,
 * which also means "delete all data" resets it for free.
 *
 * This file is server-safe on purpose — the locale layout (a server
 * component) inlines `appColorBootScript`. The client half (hook, setter)
 * lives in use-app-color.ts, because importing React hooks here would drag
 * them into the server graph, which Turbopack rejects.
 */

export const APP_COLOR_KEY = "nm-app-color";

/**
 * Inlined by the locale layout so the stored wash is applied before first
 * paint — the same no-flash trick next-themes uses for the dark class.
 */
export const appColorBootScript = `try{var c=localStorage.getItem(${JSON.stringify(
  APP_COLOR_KEY,
)});if(c)document.documentElement.setAttribute("data-app-color",c)}catch(e){}`;
