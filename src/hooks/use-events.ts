"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EventWithGroups } from "@/types";
import type { EventFormValues } from "@/lib/validators";

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

export function useUpcomingEvents(limit = 5) {
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
        body: JSON.stringify(values),
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
        body: JSON.stringify({ ...values, edit_mode: editMode }),
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
