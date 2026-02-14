"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EventWithGroups } from "@/types";
import type { EventFormValues } from "@/lib/validators";

/**
 * Convert a datetime-local string (e.g. "2026-02-15T14:00") to UTC ISO-8601.
 * datetime-local inputs omit timezone info; new Date() in the browser interprets
 * them as local time, and .toISOString() converts to UTC. This ensures the server
 * always receives unambiguous UTC timestamps regardless of the user's timezone.
 */
function toUTCISO(value: string | undefined): string | undefined {
  if (!value) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** Normalize event datetime fields from local datetime-local to UTC ISO. */
function withUTCDates(values: EventFormValues): EventFormValues {
  return {
    ...values,
    starts_at: toUTCISO(values.starts_at) ?? values.starts_at,
    ends_at: toUTCISO(values.ends_at),
    rsvp_deadline: toUTCISO(values.rsvp_deadline),
  };
}

interface EventFilters {
  group_id?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
}

function buildQueryString(filters?: EventFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.group_id) params.set("group_id", filters.group_id);
  if (filters.type) params.set("type", filters.type);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useEvents(filters?: EventFilters) {
  return useQuery({
    queryKey: ["events", "list", filters],
    queryFn: async (): Promise<EventWithGroups[]> => {
      const res = await fetch(`/api/events${buildQueryString(filters)}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ["events", "detail", id],
    enabled: !!id,
    queryFn: async (): Promise<EventWithGroups> => {
      const res = await fetch(`/api/events/${id}`);
      if (!res.ok) throw new Error("Failed to fetch event");
      return res.json();
    },
  });
}

export function useUpcomingEvents(limit?: number) {
  // Stabilize `from` to the start of the current minute so the query key
  // doesn't change on every render (which would cause an infinite loop).
  const from = useMemo(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString();
  }, []);

  return useEvents({ from, limit });
}

export function useCreateEvent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: EventFormValues) => {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withUTCDates(values)),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create event");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events", "list"] });
    },
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      values,
      editMode,
    }: {
      id: string;
      values: EventFormValues;
      editMode: "single" | "series";
    }) => {
      const res = await fetch(`/api/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...withUTCDates(values), edit_mode: editMode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update event");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["events", "list"] });
      qc.invalidateQueries({ queryKey: ["events", "detail", vars.id] });
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      deleteMode,
    }: {
      id: string;
      deleteMode: "single" | "series";
    }) => {
      const res = await fetch(`/api/events/${id}?mode=${deleteMode}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to delete event");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events", "list"] });
    },
  });
}

export function useCancelEvent() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/events/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to cancel event");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["events", "list"] });
      qc.invalidateQueries({ queryKey: ["events", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["event-dashboard", vars.id] });
      qc.invalidateQueries({ queryKey: ["rsvps", vars.id] });
    },
  });
}
