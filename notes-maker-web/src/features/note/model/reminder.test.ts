import { describe, expect, it } from "vitest";
import type { LocalReminder } from "@/features/storage/types";
import { isDue, needsNotification, nextOccurrence } from "./reminder";

// A fixed local reference: Wednesday 2026-07-22, 10:30 local time.
const WED = new Date(2026, 6, 22, 10, 30);

describe("nextOccurrence — daily", () => {
  it("is today when the time is still ahead", () => {
    const at = new Date(nextOccurrence({ repeat: "daily", time: "18:00" }, WED));
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([22, 18, 0]);
  });

  it("rolls to tomorrow once the time has passed", () => {
    const at = new Date(nextOccurrence({ repeat: "daily", time: "07:00" }, WED));
    expect([at.getDate(), at.getHours()]).toEqual([23, 7]);
  });

  it("defaults to the start of the local day", () => {
    const at = new Date(nextOccurrence({ repeat: "daily" }, WED));
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([23, 0, 0]);
  });
});

describe("nextOccurrence — weekly", () => {
  it("lands on the requested weekday", () => {
    // 5 = Friday, two days after the Wednesday reference.
    const at = new Date(nextOccurrence({ repeat: "weekly", weekday: 5, time: "09:00" }, WED));
    expect([at.getDay(), at.getDate(), at.getHours()]).toEqual([5, 24, 9]);
  });

  it("skips a full week when today's slot already passed", () => {
    const at = new Date(nextOccurrence({ repeat: "weekly", weekday: 3, time: "07:00" }, WED));
    expect([at.getDay(), at.getDate()]).toEqual([3, 29]);
  });

  it("stays today when today's slot is still ahead", () => {
    const at = new Date(nextOccurrence({ repeat: "weekly", weekday: 3, time: "20:00" }, WED));
    expect([at.getDay(), at.getDate(), at.getHours()]).toEqual([3, 22, 20]);
  });
});

describe("due and notification state", () => {
  const base: LocalReminder = {
    remind_at: 1000,
    repeat: "daily",
    state: "scheduled",
    fired_at: null,
  };

  it("is due once the occurrence instant passes", () => {
    expect(isDue(base, 999)).toBe(false);
    expect(isDue(base, 1000)).toBe(true);
  });

  it("wants a notification only once per occurrence", () => {
    expect(needsNotification(base, 2000)).toBe(true);
    expect(needsNotification({ ...base, fired_at: 1500 }, 2000)).toBe(false);
    // A past fired_at from the previous occurrence does not suppress this one.
    expect(needsNotification({ ...base, fired_at: 500 }, 2000)).toBe(true);
  });

  it("never fires a dismissed reminder", () => {
    expect(needsNotification({ ...base, state: "dismissed" }, 2000)).toBe(false);
  });
});
