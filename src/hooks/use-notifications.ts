"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  NotificationPreferences,
  ScheduledNotification,
  NotificationTargetType,
} from "@/types";

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: async (): Promise<NotificationPreferences> => {
      const res = await fetch("/api/notifications/preferences");
      if (!res.ok) throw new Error("Failed to load preferences");
      return res.json();
    },
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: Partial<NotificationPreferences>) => {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update preferences");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "preferences"] });
    },
  });
}

export function useScheduledNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications", "scheduled"],
    enabled,
    queryFn: async (): Promise<ScheduledNotification[]> => {
      const res = await fetch("/api/admin/notifications");
      if (!res.ok) throw new Error("Failed to load scheduled notifications");
      return res.json();
    },
  });
}

export function useCreateScheduledNotification() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: {
      title: string;
      body: string;
      url?: string;
      scheduled_for: string;
      target_type: NotificationTargetType;
      target_id?: string | null;
      category?: "announcement" | "reminder" | "event_update" | "custom_message";
      event_id?: string | null;
    }) => {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to schedule notification");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "scheduled"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useDeleteScheduledNotification() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/notifications/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to delete notification");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "scheduled"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useUpdateScheduledNotification() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: {
      id: string;
      scheduled_for?: string;
      target_type?: NotificationTargetType;
    }) => {
      const res = await fetch(`/api/admin/notifications/${values.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_for: values.scheduled_for,
          target_type: values.target_type,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update notification");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "scheduled"] });
    },
  });
}

export function useUpcomingEventsForNotifications() {
  const from = useMemo(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString();
  }, []);

  return useQuery({
    queryKey: ["events", "notifications", from],
    queryFn: async () => {
      const res = await fetch(`/api/events?from=${encodeURIComponent(from)}&limit=50`);
      if (!res.ok) throw new Error("Failed to load events");
      return res.json();
    },
  });
}

export function useEventNotifications(eventId: string) {
  return useQuery({
    queryKey: ["events", eventId, "notifications"],
    queryFn: async (): Promise<ScheduledNotification[]> => {
      const res = await fetch(`/api/events/${eventId}/notifications`);
      if (!res.ok) throw new Error("Failed to load event notifications");
      return res.json();
    },
  });
}

export function useCreateEventNotification(eventId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: {
      category: "announcement" | "reminder";
      scheduled_for: string;
      target_type: NotificationTargetType;
    }) => {
      const res = await fetch(`/api/events/${eventId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to schedule notification");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events", eventId, "notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications", "scheduled"] });
    },
  });
}
