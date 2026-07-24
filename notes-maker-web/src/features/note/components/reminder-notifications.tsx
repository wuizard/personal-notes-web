"use client";

import { useEffect } from "react";
import { isStorageAvailable } from "@/features/storage";
import { needsNotification } from "../model/reminder";
import { listReminderNotes, markReminderNotified } from "../repo/note-repo";

const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Best-effort local notifications — docs/10 §10.4, free half.
 *
 * Sweeps once per minute while the app is open and shows a system
 * notification for each newly-due reminder. This is exactly as far as a
 * serverless PWA can go: nothing fires with the tab closed, which the UI
 * says out loud wherever reminders are set. fired_at is only stamped when a
 * notification was actually shown, so a user who grants permission later
 * still gets the pending one — the in-app overdue list works regardless.
 */
export function ReminderNotifications() {
  useEffect(() => {
    if (!isStorageAvailable()) return;

    let cancelled = false;

    async function show(title: string, body: string): Promise<boolean> {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return false;
      }
      // Android Chrome forbids `new Notification` entirely — page-created
      // notifications must go through the service worker registration.
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) {
          await reg.showNotification(title, { body, tag: `reminder-${title}` });
          return true;
        }
      } catch {
        // fall through to the constructor
      }
      try {
        new Notification(title, { body });
        return true;
      } catch {
        return false;
      }
    }

    async function sweep() {
      const notes = await listReminderNotes();
      for (const note of notes) {
        if (cancelled) return;
        if (!note.reminder || !needsNotification(note.reminder)) continue;
        const shown = await show(
          note.title || note.body_text.split("\n")[0] || "Reminder",
          note.title ? note.body_text.split("\n")[0] ?? "" : "",
        );
        if (shown) await markReminderNotified(note.client_id);
      }
    }

    void sweep().catch(() => {});
    const timer = setInterval(() => void sweep().catch(() => {}), SWEEP_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return null;
}
