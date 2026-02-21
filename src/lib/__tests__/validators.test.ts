import { describe, it, expect } from "vitest";
import {
  eventTypeEnum,
  rsvpStatusEnum,
  roleEnum,
  groupSchema,
  eventSchema,
  rsvpSchema,
  inviteSchema,
  riderSchema,
  csvRiderRowSchema,
  csvAdultRowSchema,
  roleUpdateSchema,
  notificationPreferencesSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  scheduledNotificationSchema,
} from "../validators";

// ─── Enums ──────────────────────────────────────────────────────

describe("eventTypeEnum", () => {
  const validTypes = ["ride", "clinic", "social", "meeting", "other"];

  it.each(validTypes)("accepts '%s'", (type) => {
    expect(eventTypeEnum.safeParse(type).success).toBe(true);
  });

  it("rejects invalid event type", () => {
    expect(eventTypeEnum.safeParse("race").success).toBe(false);
    expect(eventTypeEnum.safeParse("").success).toBe(false);
    expect(eventTypeEnum.safeParse(123).success).toBe(false);
  });
});

describe("rsvpStatusEnum", () => {
  it.each(["yes", "no", "maybe"])("accepts '%s'", (status) => {
    expect(rsvpStatusEnum.safeParse(status).success).toBe(true);
  });

  it("rejects invalid RSVP status", () => {
    expect(rsvpStatusEnum.safeParse("pending").success).toBe(false);
    expect(rsvpStatusEnum.safeParse("").success).toBe(false);
  });
});

describe("roleEnum", () => {
  const validRoles = ["super_admin", "admin", "roll_model", "parent", "rider"];

  it.each(validRoles)("accepts '%s'", (role) => {
    expect(roleEnum.safeParse(role).success).toBe(true);
  });

  it("rejects invalid roles", () => {
    expect(roleEnum.safeParse("coach").success).toBe(false);
    expect(roleEnum.safeParse("superadmin").success).toBe(false);
  });
});

// ─── Group Schema ───────────────────────────────────────────────

describe("groupSchema", () => {
  const validGroup = { name: "Shredders", color: "#FF5733" };

  it("accepts a valid group", () => {
    const result = groupSchema.safeParse(validGroup);
    expect(result.success).toBe(true);
  });

  it("accepts optional description and sort_order", () => {
    const result = groupSchema.safeParse({
      ...validGroup,
      description: "Advanced riders",
      sort_order: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Advanced riders");
      expect(result.data.sort_order).toBe(3);
    }
  });

  it("allows empty string description", () => {
    const result = groupSchema.safeParse({ ...validGroup, description: "" });
    expect(result.success).toBe(true);
  });

  it("defaults sort_order to 0", () => {
    const result = groupSchema.safeParse(validGroup);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_order).toBe(0);
    }
  });

  it("rejects empty name", () => {
    const result = groupSchema.safeParse({ ...validGroup, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const result = groupSchema.safeParse({ ...validGroup, name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid hex color", () => {
    expect(groupSchema.safeParse({ ...validGroup, color: "red" }).success).toBe(false);
    expect(groupSchema.safeParse({ ...validGroup, color: "#GGG" }).success).toBe(false);
    expect(groupSchema.safeParse({ ...validGroup, color: "#12345" }).success).toBe(false);
    expect(groupSchema.safeParse({ ...validGroup, color: "FF5733" }).success).toBe(false);
  });

  it("accepts valid hex colors (case insensitive)", () => {
    expect(groupSchema.safeParse({ ...validGroup, color: "#aabbcc" }).success).toBe(true);
    expect(groupSchema.safeParse({ ...validGroup, color: "#AABBCC" }).success).toBe(true);
    expect(groupSchema.safeParse({ ...validGroup, color: "#000000" }).success).toBe(true);
  });

  it("rejects description over 500 characters", () => {
    const result = groupSchema.safeParse({ ...validGroup, description: "x".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("rejects negative sort_order", () => {
    const result = groupSchema.safeParse({ ...validGroup, sort_order: -1 });
    expect(result.success).toBe(false);
  });

  it("coerces string sort_order to number", () => {
    const result = groupSchema.safeParse({ ...validGroup, sort_order: "5" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_order).toBe(5);
    }
  });
});

// ─── Event Schema ───────────────────────────────────────────────

describe("eventSchema", () => {
  const validEvent = {
    title: "Saturday Ride",
    type: "ride",
    starts_at: "2026-03-15T10:00:00Z",
    is_recurring: false,
  };

  it("accepts a minimal valid event", () => {
    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated event", () => {
    const result = eventSchema.safeParse({
      ...validEvent,
      description: "Meet at the trailhead",
      location: "Whistler Mountain",
      map_url: "https://maps.google.com/abc",
      ends_at: "2026-03-15T12:00:00Z",
      rsvp_deadline: "2026-03-14T18:00:00Z",
      capacity: 30,
      weather_notes: "Dress warm",
      group_ids: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
      is_recurring: true,
      recurrence_rule: "FREQ=WEEKLY;BYDAY=SA",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    expect(eventSchema.safeParse({ ...validEvent, title: "" }).success).toBe(false);
  });

  it("rejects title over 200 characters", () => {
    expect(eventSchema.safeParse({ ...validEvent, title: "a".repeat(201) }).success).toBe(false);
  });

  it("rejects invalid event type", () => {
    expect(eventSchema.safeParse({ ...validEvent, type: "race" }).success).toBe(false);
  });

  it("rejects missing starts_at", () => {
    expect(eventSchema.safeParse({ ...validEvent, starts_at: "" }).success).toBe(false);
  });

  it("rejects invalid map_url", () => {
    expect(eventSchema.safeParse({ ...validEvent, map_url: "not-a-url" }).success).toBe(false);
  });

  it("allows empty string for optional fields", () => {
    const result = eventSchema.safeParse({
      ...validEvent,
      description: "",
      location: "",
      map_url: "",
      ends_at: "",
      weather_notes: "",
      recurrence_rule: "",
    });
    expect(result.success).toBe(true);
  });

  it("defaults group_ids to empty array", () => {
    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.group_ids).toEqual([]);
      expect(result.data.send_announcement_notification).toBe(true);
      expect(result.data.send_default_reminder_notifications).toBe(true);
    }
  });

  it("accepts disabling default event notifications", () => {
    const result = eventSchema.safeParse({
      ...validEvent,
      send_announcement_notification: false,
      send_default_reminder_notifications: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.send_announcement_notification).toBe(false);
      expect(result.data.send_default_reminder_notifications).toBe(false);
    }
  });

  it("rejects invalid UUID in group_ids", () => {
    const result = eventSchema.safeParse({ ...validEvent, group_ids: ["not-a-uuid"] });
    expect(result.success).toBe(false);
  });

  it("rejects description over 5000 characters", () => {
    expect(
      eventSchema.safeParse({ ...validEvent, description: "x".repeat(5001) }).success
    ).toBe(false);
  });

  it("coerces string capacity to number", () => {
    const result = eventSchema.safeParse({ ...validEvent, capacity: "25" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capacity).toBe(25);
    }
  });

  it("rejects zero or negative capacity", () => {
    expect(eventSchema.safeParse({ ...validEvent, capacity: 0 }).success).toBe(false);
    expect(eventSchema.safeParse({ ...validEvent, capacity: -5 }).success).toBe(false);
  });
});

// ─── RSVP Schema ────────────────────────────────────────────────

describe("rsvpSchema", () => {
  const validUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("accepts a self-RSVP (no rider_id)", () => {
    const result = rsvpSchema.safeParse({
      event_id: validUuid,
      status: "yes",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a parent RSVP with rider_id", () => {
    const result = rsvpSchema.safeParse({
      event_id: validUuid,
      status: "maybe",
      rider_id: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it("accepts nullable rider_id", () => {
    const result = rsvpSchema.safeParse({
      event_id: validUuid,
      status: "no",
      rider_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts loose UUIDs (non-standard version bits)", () => {
    // UUID with non-standard version nibble (0 instead of 4)
    const looseId = "00000000-0000-0000-0000-000000000001";
    const result = rsvpSchema.safeParse({
      event_id: looseId,
      status: "yes",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID format", () => {
    const result = rsvpSchema.safeParse({
      event_id: "not-a-uuid",
      status: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid RSVP status", () => {
    const result = rsvpSchema.safeParse({
      event_id: validUuid,
      status: "attending",
    });
    expect(result.success).toBe(false);
  });
});

// ─── Invite Schema ──────────────────────────────────────────────

describe("inviteSchema", () => {
  const validInvite = {
    full_name: "Jane Smith",
    email: "jane@example.com",
    roles: ["parent"],
  };

  it("accepts a valid invite", () => {
    expect(inviteSchema.safeParse(validInvite).success).toBe(true);
  });

  it("accepts multiple roles", () => {
    const result = inviteSchema.safeParse({
      ...validInvite,
      roles: ["parent", "roll_model"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(inviteSchema.safeParse({ ...validInvite, full_name: "" }).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(inviteSchema.safeParse({ ...validInvite, email: "not-email" }).success).toBe(false);
    expect(inviteSchema.safeParse({ ...validInvite, email: "" }).success).toBe(false);
  });

  it("rejects empty roles array", () => {
    expect(inviteSchema.safeParse({ ...validInvite, roles: [] }).success).toBe(false);
  });

  it("rejects invalid role in array", () => {
    expect(inviteSchema.safeParse({ ...validInvite, roles: ["coach"] }).success).toBe(false);
  });
});

// ─── Rider Schema ───────────────────────────────────────────────

describe("riderSchema", () => {
  const validRider = {
    first_name: "Alex",
    last_name: "Johnson",
  };

  it("accepts a minimal rider", () => {
    expect(riderSchema.safeParse(validRider).success).toBe(true);
  });

  it("accepts a fully populated rider", () => {
    const result = riderSchema.safeParse({
      ...validRider,
      date_of_birth: "2015-06-15",
      group_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      emergency_contact: "Mom: 555-1234",
      medical_notes: "Allergic to bee stings",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty first_name", () => {
    expect(riderSchema.safeParse({ ...validRider, first_name: "" }).success).toBe(false);
  });

  it("rejects empty last_name", () => {
    expect(riderSchema.safeParse({ ...validRider, last_name: "" }).success).toBe(false);
  });

  it("rejects invalid group_id UUID", () => {
    expect(riderSchema.safeParse({ ...validRider, group_id: "bad" }).success).toBe(false);
  });

  it("allows empty string for optional fields", () => {
    const result = riderSchema.safeParse({
      ...validRider,
      date_of_birth: "",
      group_id: "",
      emergency_contact: "",
      medical_notes: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects medical_notes over 1000 characters", () => {
    expect(
      riderSchema.safeParse({ ...validRider, medical_notes: "x".repeat(1001) }).success
    ).toBe(false);
  });
});

// ─── CSV Schemas ────────────────────────────────────────────────

describe("csvRiderRowSchema", () => {
  const validRow = {
    first_name: "Sam",
    last_name: "Lee",
    group_name: "Shredders",
    parent_emails: "parent@example.com",
  };

  it("accepts a valid rider CSV row", () => {
    expect(csvRiderRowSchema.safeParse(validRow).success).toBe(true);
  });

  it("accepts optional date_of_birth", () => {
    expect(
      csvRiderRowSchema.safeParse({ ...validRow, date_of_birth: "2015-03-10" }).success
    ).toBe(true);
  });

  it("rejects missing first_name", () => {
    expect(csvRiderRowSchema.safeParse({ ...validRow, first_name: "" }).success).toBe(false);
  });

  it("rejects missing group_name", () => {
    expect(csvRiderRowSchema.safeParse({ ...validRow, group_name: "" }).success).toBe(false);
  });

  it("rejects missing parent_emails", () => {
    expect(csvRiderRowSchema.safeParse({ ...validRow, parent_emails: "" }).success).toBe(false);
  });
});

describe("csvAdultRowSchema", () => {
  const validRow = {
    full_name: "Coach Dave",
    email: "dave@example.com",
    roles: "roll_model",
  };

  it("accepts a valid adult CSV row", () => {
    expect(csvAdultRowSchema.safeParse(validRow).success).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(csvAdultRowSchema.safeParse({ ...validRow, email: "not-email" }).success).toBe(false);
  });

  it("rejects empty roles", () => {
    expect(csvAdultRowSchema.safeParse({ ...validRow, roles: "" }).success).toBe(false);
  });
});

// ─── Role Update Schema ────────────────────────────────────────

describe("roleUpdateSchema", () => {
  it("accepts valid roles array", () => {
    expect(roleUpdateSchema.safeParse({ roles: ["admin", "parent"] }).success).toBe(true);
  });

  it("rejects empty roles array", () => {
    expect(roleUpdateSchema.safeParse({ roles: [] }).success).toBe(false);
  });

  it("rejects invalid role", () => {
    expect(roleUpdateSchema.safeParse({ roles: ["manager"] }).success).toBe(false);
  });
});

// ─── Notification Preferences ──────────────────────────────────

describe("notificationPreferencesSchema", () => {
  it("accepts all preferences", () => {
    const result = notificationPreferencesSchema.safeParse({
      new_event: true,
      rsvp_reminder: false,
      event_update: true,
      custom_message: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial preferences (all optional)", () => {
    expect(notificationPreferencesSchema.safeParse({}).success).toBe(true);
    expect(notificationPreferencesSchema.safeParse({ new_event: false }).success).toBe(true);
  });

  it("rejects non-boolean values", () => {
    expect(
      notificationPreferencesSchema.safeParse({ new_event: "yes" }).success
    ).toBe(false);
  });
});

// ─── Push Subscription Schema ──────────────────────────────────

describe("pushSubscriptionSchema", () => {
  const validSub = {
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: {
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWRk",
        auth: "tBHItJI5svbpC7fDjQ-GNw",
      },
    },
  };

  it("accepts a valid push subscription", () => {
    expect(pushSubscriptionSchema.safeParse(validSub).success).toBe(true);
  });

  it("accepts optional user_agent", () => {
    const result = pushSubscriptionSchema.safeParse({
      ...validSub,
      user_agent: "Mozilla/5.0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid endpoint URL", () => {
    const result = pushSubscriptionSchema.safeParse({
      subscription: { ...validSub.subscription, endpoint: "not-a-url" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty p256dh key", () => {
    const result = pushSubscriptionSchema.safeParse({
      subscription: {
        ...validSub.subscription,
        keys: { ...validSub.subscription.keys, p256dh: "" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty auth key", () => {
    const result = pushSubscriptionSchema.safeParse({
      subscription: {
        ...validSub.subscription,
        keys: { ...validSub.subscription.keys, auth: "" },
      },
    });
    expect(result.success).toBe(false);
  });
});

// ─── Push Unsubscribe Schema ───────────────────────────────────

describe("pushUnsubscribeSchema", () => {
  it("accepts a valid endpoint URL", () => {
    expect(
      pushUnsubscribeSchema.safeParse({ endpoint: "https://example.com/push" }).success
    ).toBe(true);
  });

  it("rejects invalid URL", () => {
    expect(pushUnsubscribeSchema.safeParse({ endpoint: "not-url" }).success).toBe(false);
  });
});

// ─── Scheduled Notification Schema ─────────────────────────────

describe("scheduledNotificationSchema", () => {
  const validUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const baseNotification = {
    title: "Ride tomorrow!",
    body: "Don't forget your helmet",
    scheduled_for: "2026-03-15T08:00:00Z",
    target_type: "all" as const,
  };

  it("accepts a valid 'all' notification", () => {
    expect(scheduledNotificationSchema.safeParse(baseNotification).success).toBe(true);
  });

  it("accepts a group-targeted notification with target_id", () => {
    const result = scheduledNotificationSchema.safeParse({
      ...baseNotification,
      target_type: "group",
      target_id: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it("accepts event-targeted notifications with target_id", () => {
    for (const targetType of ["event_all", "event_rsvpd", "event_not_rsvpd"]) {
      const result = scheduledNotificationSchema.safeParse({
        ...baseNotification,
        target_type: targetType,
        target_id: validUuid,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects group target_type without target_id", () => {
    const result = scheduledNotificationSchema.safeParse({
      ...baseNotification,
      target_type: "group",
    });
    expect(result.success).toBe(false);
  });

  it("rejects event target_type without target_id", () => {
    const result = scheduledNotificationSchema.safeParse({
      ...baseNotification,
      target_type: "event_rsvpd",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 'all' target_type with a target_id", () => {
    const result = scheduledNotificationSchema.safeParse({
      ...baseNotification,
      target_type: "all",
      target_id: validUuid,
    });
    expect(result.success).toBe(false);
  });

  it("accepts absolute URL", () => {
    const result = scheduledNotificationSchema.safeParse({
      ...baseNotification,
      url: "https://everybody.bike/events/123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts relative URL starting with /", () => {
    const result = scheduledNotificationSchema.safeParse({
      ...baseNotification,
      url: "/events/123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects URL that is neither absolute nor relative", () => {
    const result = scheduledNotificationSchema.safeParse({
      ...baseNotification,
      url: "events/123",
    });
    expect(result.success).toBe(false);
  });

  it("allows empty string URL", () => {
    const result = scheduledNotificationSchema.safeParse({
      ...baseNotification,
      url: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    expect(
      scheduledNotificationSchema.safeParse({ ...baseNotification, title: "" }).success
    ).toBe(false);
  });

  it("rejects title over 120 characters", () => {
    expect(
      scheduledNotificationSchema.safeParse({ ...baseNotification, title: "x".repeat(121) }).success
    ).toBe(false);
  });

  it("rejects body over 500 characters", () => {
    expect(
      scheduledNotificationSchema.safeParse({ ...baseNotification, body: "x".repeat(501) }).success
    ).toBe(false);
  });

  it("rejects empty scheduled_for", () => {
    expect(
      scheduledNotificationSchema.safeParse({ ...baseNotification, scheduled_for: "" }).success
    ).toBe(false);
  });
});
