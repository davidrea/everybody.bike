import { describe, it, expect } from "vitest";
import {
  hasEventAnnouncementRecord,
  shouldShowOnDemandAnnouncement,
} from "../event-list-helpers";
import type { ScheduledNotification } from "@/types";

const scheduledFor = "2026-04-01T10:00:00Z";
const createdAt = "2026-03-01T10:00:00Z";

function buildNotification(
  overrides: Partial<ScheduledNotification> = {},
): ScheduledNotification {
  return {
    id: "notification-1",
    title: "Title",
    body: "Body",
    url: "/events/event-1",
    scheduled_for: scheduledFor,
    target_type: "event_all",
    target_id: "event-1",
    category: "announcement",
    event_id: "event-1",
    sent: false,
    created_by: "user-1",
    created_at: createdAt,
    ...overrides,
  };
}

describe("hasEventAnnouncementRecord", () => {
  it("returns true when an announcement exists for the event", () => {
    const notifications = [
      buildNotification({ category: "announcement", event_id: "event-1" }),
      buildNotification({ id: "n2", category: "reminder", event_id: "event-1" }),
    ];

    expect(hasEventAnnouncementRecord(notifications, "event-1")).toBe(true);
  });

  it("returns false when only non-announcement notifications exist", () => {
    const notifications = [
      buildNotification({ category: "reminder", event_id: "event-1" }),
      buildNotification({ id: "n2", category: "event_update", event_id: "event-1" }),
    ];

    expect(hasEventAnnouncementRecord(notifications, "event-1")).toBe(false);
  });

  it("returns false when announcement belongs to a different event", () => {
    const notifications = [
      buildNotification({ category: "announcement", event_id: "event-2" }),
    ];

    expect(hasEventAnnouncementRecord(notifications, "event-1")).toBe(false);
  });
});

describe("shouldShowOnDemandAnnouncement", () => {
  it("returns true for admins when no announcement exists", () => {
    const notifications = [buildNotification({ category: "reminder", event_id: "event-1" })];

    expect(
      shouldShowOnDemandAnnouncement({
        isAdmin: true,
        eventId: "event-1",
        notifications,
      }),
    ).toBe(true);
  });

  it("returns false for admins when announcement already exists", () => {
    const notifications = [
      buildNotification({ category: "announcement", event_id: "event-1" }),
    ];

    expect(
      shouldShowOnDemandAnnouncement({
        isAdmin: true,
        eventId: "event-1",
        notifications,
      }),
    ).toBe(false);
  });

  it("returns false for non-admins", () => {
    const notifications = [buildNotification({ category: "reminder", event_id: "event-1" })];

    expect(
      shouldShowOnDemandAnnouncement({
        isAdmin: false,
        eventId: "event-1",
        notifications,
      }),
    ).toBe(false);
  });

  it("returns false while notifications are not loaded", () => {
    expect(
      shouldShowOnDemandAnnouncement({
        isAdmin: true,
        eventId: "event-1",
        notifications: undefined,
      }),
    ).toBe(false);
  });
});

