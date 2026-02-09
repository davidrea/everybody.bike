import { z } from "zod";

// ─── Shared Enums ──────────────────────────────────────────────

export const eventTypeEnum = z.enum(["ride", "clinic", "social", "meeting", "other"]);
export const rsvpStatusEnum = z.enum(["yes", "no", "maybe"]);
export const roleEnum = z.enum(["super_admin", "admin", "roll_model", "parent", "rider"]);

// ─── Group ─────────────────────────────────────────────────────

export const groupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  description: z.string().max(500).optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export type GroupFormValues = z.infer<typeof groupSchema>;

// ─── Event ─────────────────────────────────────────────────────

export const eventSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  type: eventTypeEnum,
  description: z.string().max(5000).optional().or(z.literal("")),
  location: z.string().max(300).optional().or(z.literal("")),
  map_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  starts_at: z.string().min(1, "Start date/time is required"),
  ends_at: z.string().optional().or(z.literal("")),
  rsvp_deadline: z.string().optional().or(z.literal("")),
  capacity: z.coerce.number().int().positive().optional().or(z.literal("")),
  weather_notes: z.string().max(500).optional().or(z.literal("")),
  group_ids: z.array(z.string().uuid()).min(1, "Select at least one group"),
  is_recurring: z.boolean(),
  recurrence_rule: z.string().optional().or(z.literal("")),
});

export type EventFormValues = z.infer<typeof eventSchema>;

// ─── RSVP ──────────────────────────────────────────────────────

// Loose UUID pattern — accepts any 8-4-4-4-12 hex string regardless of
// version/variant bits.  Needed because seed / test data may use non-RFC-4122 IDs.
const looseUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID",
);

export const rsvpSchema = z.object({
  event_id: looseUuid,
  status: rsvpStatusEnum,
  rider_id: looseUuid.nullable().optional(),
  on_behalf_of: looseUuid.optional(),
  assigned_group_id: looseUuid.nullable().optional(),
});

export type RsvpFormValues = z.infer<typeof rsvpSchema>;

// ─── Invite ────────────────────────────────────────────────────

export const inviteSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Must be a valid email address"),
  roles: z.array(roleEnum).min(1, "Select at least one role"),
});

export type InviteFormValues = z.infer<typeof inviteSchema>;

// ─── Rider (Minor) ─────────────────────────────────────────────

export const riderSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  date_of_birth: z.string().optional().or(z.literal("")),
  group_id: z.string().uuid("Select a group").optional().or(z.literal("")),
  emergency_contact: z.string().max(300).optional().or(z.literal("")),
  medical_notes: z.string().max(1000).optional().or(z.literal("")),
});

export type RiderFormValues = z.infer<typeof riderSchema>;

// ─── CSV Import ────────────────────────────────────────────────

export const csvRiderRowSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  date_of_birth: z.string().optional(),
  group_name: z.string().min(1, "Group name is required"),
  parent_emails: z.string().min(1, "At least one parent email is required"),
});

export const csvAdultRowSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  email: z.string().email("Must be a valid email"),
  roles: z.string().min(1, "At least one role is required"),
});

// ─── Role Update ───────────────────────────────────────────────

export const roleUpdateSchema = z.object({
  roles: z.array(roleEnum).min(1, "Must have at least one role"),
});

export type RoleUpdateValues = z.infer<typeof roleUpdateSchema>;

// ─── Notifications ────────────────────────────────────────────

export const notificationPreferencesSchema = z.object({
  new_event: z.boolean().optional(),
  rsvp_reminder: z.boolean().optional(),
  event_update: z.boolean().optional(),
  custom_message: z.boolean().optional(),
});

export const pushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  user_agent: z.string().optional(),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const scheduledNotificationSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(120),
    body: z.string().min(1, "Body is required").max(500),
    url: z.string().optional().or(z.literal("")),
    scheduled_for: z.string().min(1, "Scheduled time is required"),
    target_type: z.enum(["all", "group", "event_rsvpd", "event_not_rsvpd"]),
    target_id: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.url && data.url.length > 0) {
      const isAbsolute = /^https?:\/\//i.test(data.url);
      const isRelative = data.url.startsWith("/");
      if (!isAbsolute && !isRelative) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL must be absolute or start with /",
          path: ["url"],
        });
      }
    }
    const needsTarget =
      data.target_type === "group" ||
      data.target_type === "event_rsvpd" ||
      data.target_type === "event_not_rsvpd";
    if (needsTarget && !data.target_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Target is required for this notification type",
        path: ["target_id"],
      });
    }
    if (!needsTarget && data.target_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Target is not allowed for this notification type",
        path: ["target_id"],
      });
    }
  });
