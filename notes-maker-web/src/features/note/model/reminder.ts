import type {LocalReminder} from "@/features/storage/types";

/**
 * Reminder occurrence math — docs/10 §10.4.
 *
 * All computation is wall-clock in the environment's CURRENT timezone, via
 * plain Date fields. That is the point, not a shortcut: a reminder set for
 * "07:00" must fire at 07:00 wherever the user now is, through DST and
 * travel, which a stored UTC instant cannot do. The IANA zone recorded on the
 * reminder is for Phase 2's server, which must compute the same thing without
 * a browser to ask.
 */

export interface ReminderSpec {
  repeat: "daily" | "weekly";
  /** "HH:mm" — defaults to the start of the local day (docs/10 §10.4). */
  time?: string;
  /** 0 (Sunday) – 6 (Saturday). Weekly only; defaults to today's weekday. */
  weekday?: number;
}

export const DEFAULT_REMINDER_TIME = "00:00";

function parseTime(time: string | undefined): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  if (!match) return { h: 0, m: 0 };
  const h = Math.min(23, Number(match[1]));
  const m = Math.min(59, Number(match[2]));
  return { h, m };
}

/** Next occurrence strictly after `from`, as an epoch instant. */
export function nextOccurrence(spec: ReminderSpec, from: Date = new Date()): number {
  const { h, m } = parseTime(spec.time);
  const next = new Date(from);
  next.setHours(h, m, 0, 0);

  if (spec.repeat === "daily") {
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime();
  }

  const weekday = spec.weekday ?? from.getDay();
  const ahead = (weekday - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + ahead);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 7);
  return next.getTime();
}

/** The current IANA zone, recorded on the reminder for Phase 2. */
export function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Due = scheduled and its occurrence instant has passed. */
export function isDue(reminder: LocalReminder, at = Date.now()): boolean {
  return reminder.state === "scheduled" && reminder.remind_at <= at;
}

/**
 * True when the current occurrence has not been surfaced as a notification
 * yet. Notifying sets fired_at without rolling remind_at forward, so the item
 * stays in the overdue list until the user dismisses it.
 */
export function needsNotification(reminder: LocalReminder, at = Date.now()): boolean {
  return isDue(reminder, at) && (reminder.fired_at === null || reminder.fired_at < reminder.remind_at);
}
