import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAnnouncementScheduleTime,
  getDefaultReminderTimes,
  buildEventNotificationContent,
  DEFAULT_REMINDER_OFFSETS,
} from "../event-notifications";

const MIN_SCHEDULE_MS = 5 * 60 * 1000; // 5 minutes, matching the source

describe("getAnnouncementScheduleTime", () => {
  it("returns roughly now (clamped to +5min) when before 9pm cutoff", () => {
    // 2pm on a Tuesday
    const now = new Date("2026-03-10T14:00:00Z");
    const startsAt = new Date("2026-03-15T10:00:00Z");

    const result = getAnnouncementScheduleTime(now, startsAt);
    expect(result).not.toBeNull();

    // Should be at least now + 5 min
    const minTime = new Date(now.getTime() + MIN_SCHEDULE_MS);
    expect(result!.getTime()).toBeGreaterThanOrEqual(minTime.getTime());
    // Should be before event start
    expect(result!.getTime()).toBeLessThan(startsAt.getTime());
  });

  it("schedules next morning at 9am when after 9pm cutoff", () => {
    // 10pm local time on a Tuesday
    const now = new Date(2026, 2, 10, 22, 0, 0, 0);
    const startsAt = new Date(2026, 2, 15, 10, 0, 0, 0);

    const result = getAnnouncementScheduleTime(now, startsAt);
    expect(result).not.toBeNull();

    // Should be next day at 9am local time
    expect(result!.getHours()).toBe(9);
    expect(result!.getMinutes()).toBe(0);
    expect(result!.getDate()).toBe(now.getDate() + 1);
  });

  it("schedules next morning when exactly at 9pm", () => {
    // Exactly 9pm local time
    const now = new Date(2026, 2, 10, 21, 0, 0, 0);
    const startsAt = new Date(2026, 2, 15, 10, 0, 0, 0);

    const result = getAnnouncementScheduleTime(now, startsAt);
    expect(result).not.toBeNull();
    expect(result!.getHours()).toBe(9);
    expect(result!.getDate()).toBe(now.getDate() + 1);
  });

  it("returns null when event is in the past", () => {
    const now = new Date("2026-03-15T12:00:00Z");
    const startsAt = new Date("2026-03-15T10:00:00Z");

    // now + 5 min > startsAt, and startsAt < now, so should return null
    const result = getAnnouncementScheduleTime(now, startsAt);
    expect(result).toBeNull();
  });

  it("clamps to minTime when candidate would be after event start", () => {
    // Event starts in 10 minutes, before 9pm
    const now = new Date("2026-03-10T14:00:00Z");
    const startsAt = new Date("2026-03-10T14:10:00Z");

    const result = getAnnouncementScheduleTime(now, startsAt);
    expect(result).not.toBeNull();
    // minTime = now + 5 min = 14:05, which is before 14:10, so should clamp
    const minTime = new Date(now.getTime() + MIN_SCHEDULE_MS);
    expect(result!.getTime()).toBeGreaterThanOrEqual(minTime.getTime());
    expect(result!.getTime()).toBeLessThan(startsAt.getTime());
  });

  it("returns null when event starts in less than 5 minutes", () => {
    const now = new Date("2026-03-10T14:00:00Z");
    const startsAt = new Date("2026-03-10T14:03:00Z"); // only 3 min away

    const result = getAnnouncementScheduleTime(now, startsAt);
    // minTime (now+5min) >= startsAt, so should return null
    expect(result).toBeNull();
  });
});

describe("getDefaultReminderTimes", () => {
  it("returns 3 reminders for an event far in the future", () => {
    const now = new Date("2026-03-01T10:00:00Z");
    const startsAt = new Date("2026-03-20T10:00:00Z"); // 19 days away

    const reminders = getDefaultReminderTimes(startsAt, now);
    expect(reminders).toHaveLength(3);
  });

  it("returns reminders sorted from earliest to latest", () => {
    const now = new Date("2026-03-01T10:00:00Z");
    const startsAt = new Date("2026-03-20T10:00:00Z");

    const reminders = getDefaultReminderTimes(startsAt, now);
    for (let i = 1; i < reminders.length; i++) {
      expect(reminders[i].getTime()).toBeGreaterThan(reminders[i - 1].getTime());
    }
  });

  it("excludes reminders that would be in the past", () => {
    const now = new Date("2026-03-18T10:00:00Z");
    const startsAt = new Date("2026-03-20T10:00:00Z"); // 2 days away

    const reminders = getDefaultReminderTimes(startsAt, now);
    // 1 week before = March 13 (past), 3 days before = March 17 (past)
    // 1 day before = March 19 (future) — but only if > now + 5min
    expect(reminders.length).toBeLessThanOrEqual(1);
    for (const r of reminders) {
      expect(r.getTime()).toBeGreaterThan(now.getTime() + MIN_SCHEDULE_MS);
    }
  });

  it("returns empty array when event is too close", () => {
    const now = new Date("2026-03-20T09:00:00Z");
    const startsAt = new Date("2026-03-20T10:00:00Z"); // 1 hour away

    const reminders = getDefaultReminderTimes(startsAt, now);
    // All offsets (1 week, 3 days, 1 day) would be in the past
    expect(reminders).toHaveLength(0);
  });

  it("excludes reminders that equal or exceed event start time", () => {
    const now = new Date("2026-03-01T10:00:00Z");
    const startsAt = new Date("2026-03-02T10:00:00Z"); // 1 day away

    const reminders = getDefaultReminderTimes(startsAt, now);
    for (const r of reminders) {
      expect(r.getTime()).toBeLessThan(startsAt.getTime());
    }
  });

  it("uses correct offsets from DEFAULT_REMINDER_OFFSETS", () => {
    expect(DEFAULT_REMINDER_OFFSETS).toHaveLength(3);
    expect(DEFAULT_REMINDER_OFFSETS[0].label).toBe("1 week");
    expect(DEFAULT_REMINDER_OFFSETS[1].label).toBe("3 days");
    expect(DEFAULT_REMINDER_OFFSETS[2].label).toBe("1 day");
  });
});

describe("buildEventNotificationContent", () => {
  const event = {
    id: "abc-123",
    title: "Saturday Trail Ride",
    starts_at: "2026-03-15T10:00:00Z",
    location: "Whistler Mountain",
  };

  it("generates announcement content", () => {
    const content = buildEventNotificationContent(event, "announcement");
    expect(content.title).toBe("New event: Saturday Trail Ride");
    expect(content.body).toContain("Whistler Mountain");
    expect(content.body).toContain("RSVP in the app");
    expect(content.url).toBe("/events/abc-123");
  });

  it("generates reminder content", () => {
    const content = buildEventNotificationContent(event, "reminder");
    expect(content.title).toBe("Reminder: Saturday Trail Ride");
    expect(content.body).toContain("RSVP if you haven't yet");
    expect(content.url).toBe("/events/abc-123");
  });

  it("generates event update content", () => {
    const content = buildEventNotificationContent(event, "event_update");
    expect(content.title).toBe("Update: Saturday Trail Ride");
    expect(content.body).toContain("Event details updated");
    expect(content.url).toBe("/events/abc-123");
  });

  it("omits location when null", () => {
    const noLocationEvent = { ...event, location: null };
    const content = buildEventNotificationContent(noLocationEvent, "announcement");
    expect(content.body).not.toContain(" at ");
  });

  it("includes formatted date/time in body", () => {
    const content = buildEventNotificationContent(event, "announcement");
    // The body should contain a human-readable date
    expect(content.body).toMatch(/\w{3}, \w{3} \d+/); // e.g., "Sun, Mar 15"
  });

  it("always returns a url pointing to the event", () => {
    for (const category of ["announcement", "reminder", "event_update"] as const) {
      const content = buildEventNotificationContent(event, category);
      expect(content.url).toBe(`/events/${event.id}`);
    }
  });
});
