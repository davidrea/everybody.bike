import type { Database } from "@/lib/supabase/types";

// ─── Base Row Types ────────────────────────────────────────────
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type Rider = Database["public"]["Tables"]["riders"]["Row"];
export type RiderInsert = Database["public"]["Tables"]["riders"]["Insert"];
export type Group = Database["public"]["Tables"]["groups"]["Row"];
export type GroupInsert = Database["public"]["Tables"]["groups"]["Insert"];
export type Event = Database["public"]["Tables"]["events"]["Row"];
export type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
export type Rsvp = Database["public"]["Tables"]["rsvps"]["Row"];
export type RsvpInsert = Database["public"]["Tables"]["rsvps"]["Insert"];
export type NotificationPreferences = {
  new_event: boolean;
  rsvp_reminder: boolean;
  event_update: boolean;
  custom_message: boolean;
};
export type NotificationTargetType =
  | "all"
  | "group"
  | "event_all"
  | "event_rsvpd"
  | "event_not_rsvpd";
export type NotificationCategory =
  | "announcement"
  | "reminder"
  | "event_update"
  | "custom_message";
export type ScheduledNotification = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  scheduled_for: string;
  target_type: NotificationTargetType;
  target_id: string | null;
  category: NotificationCategory;
  event_id: string | null;
  sent: boolean;
  created_by: string | null;
  created_at: string;
};

// ─── Enums ─────────────────────────────────────────────────────
export const EVENT_TYPES = ["ride", "clinic", "social", "meeting", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const RSVP_STATUSES = ["yes", "no", "maybe"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const ROLES = ["super_admin", "admin", "roll_model", "parent", "rider"] as const;
export type Role = (typeof ROLES)[number];

export const INVITE_STATUSES = ["pending", "accepted"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

// ─── Enriched / Joined Types ──────────────────────────────────

export interface EventWithGroups extends Event {
  event_groups: { group_id: string; groups: Group }[];
  profiles: Pick<Profile, "id" | "full_name"> | null;
}

export interface AdminProfile extends Profile {
  push_enabled?: boolean;
  push_count?: number;
}

export interface RsvpWithDetails extends Rsvp {
  profiles: Pick<Profile, "id" | "full_name" | "avatar_url" | "roles" | "rider_group_id">;
  riders: Pick<Rider, "id" | "first_name" | "last_name" | "group_id"> | null;
}

export interface RiderWithParents extends Rider {
  rider_parents: {
    parent_id: string;
    relationship: string;
    is_primary: boolean;
    profiles: Pick<Profile, "id" | "full_name" | "email">;
  }[];
}

export interface GroupWithMembers extends Group {
  riders: Pick<Rider, "id" | "first_name" | "last_name">[];
  adult_riders: Pick<Profile, "id" | "full_name" | "email">[];
  roll_models: Pick<Profile, "id" | "full_name" | "email">[];
}

// ─── CSV Import Types ─────────────────────────────────────────

export interface CsvPreviewRow {
  row_number: number;
  data: Record<string, string>;
  action: "create" | "update" | "skip";
  errors: string[];
}

export interface CsvImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
  invites_sent: number;
}

// ─── Event Dashboard Types ────────────────────────────────────

export interface DashboardRollModel {
  id: string;
  full_name: string;
  avatar_url: string | null;
  medical_alerts: string | null;
  media_opt_out: boolean;
  assigned_group_id: string | null;
  assigned_group_name: string | null;
}

export interface DashboardRiderEntry {
  id: string;
  name: string;
  avatar_url: string | null;
  group_id: string | null;
  group_name: string;
  is_minor: boolean;
  status: string | null;
  medical_alerts: string | null;
  media_opt_out: boolean;
}

export interface EventDashboardData {
  event: EventWithGroups;
  roll_models: {
    confirmed: DashboardRollModel[];
    maybe: DashboardRollModel[];
    no: DashboardRollModel[];
    not_responded: DashboardRollModel[];
    confirmed_unassigned: DashboardRollModel[];
  };
  riders_by_group: {
    group: Group;
    confirmed: DashboardRiderEntry[];
    maybe: DashboardRiderEntry[];
    no: DashboardRiderEntry[];
    not_responded: DashboardRiderEntry[];
    coach_counts: {
      confirmed: number;
      maybe: number;
      no: number;
    };
    coach_rider_ratio: number | null;
    coaches: {
      confirmed: DashboardRollModel[];
      maybe: DashboardRollModel[];
      no: DashboardRollModel[];
    };
  }[];
  counts: {
    total_roll_models: number;
    confirmed_roll_models: number;
    total_riders: number;
    confirmed_riders: number;
  };
  ratio: number | null;
}
