"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RsvpWithDetails, RsvpStatus } from "@/types";

export function useEventRsvps(eventId: string | undefined) {
  return useQuery({
    queryKey: ["rsvps", eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<RsvpWithDetails[]> => {
      const res = await fetch(`/api/rsvps?event_id=${eventId}`);
      if (!res.ok) throw new Error("Failed to fetch RSVPs");
      return res.json();
    },
  });
}

export function useMyRsvps(eventId: string, userId: string | undefined) {
  return useQuery({
    queryKey: ["rsvps", eventId, "mine", userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/rsvps/mine?event_id=${eventId}`);
      if (!res.ok) throw new Error("Failed to fetch your RSVPs");
      return res.json() as Promise<{
        selfRsvp: {
          id: string;
          status: string;
          rider_id: string | null;
          assigned_group_id: string | null;
        } | null;
        minorRsvps: { id: string; status: string; rider_id: string; riders: { id: string; first_name: string; last_name: string } }[];
      }>;
    },
  });
}

export function useSubmitRsvp() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      event_id,
      status,
      rider_id,
      on_behalf_of,
      assigned_group_id,
    }: {
      event_id: string;
      status: RsvpStatus;
      rider_id?: string | null;
      on_behalf_of?: string;
      assigned_group_id?: string | null;
    }) => {
      const body: Record<string, unknown> = {
        event_id,
        status,
        rider_id: rider_id ?? null,
      };
      if (on_behalf_of) body.on_behalf_of = on_behalf_of;
      if (assigned_group_id !== undefined) body.assigned_group_id = assigned_group_id;
      const res = await fetch("/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to submit RSVP");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["rsvps", vars.event_id] });
      qc.invalidateQueries({ queryKey: ["event-dashboard", vars.event_id] });
    },
  });
}

export function useClearRsvp() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      event_id,
      rider_id,
      on_behalf_of,
    }: {
      event_id: string;
      rider_id?: string | null;
      on_behalf_of?: string;
    }) => {
      const body: Record<string, unknown> = { event_id };
      if (rider_id) body.rider_id = rider_id;
      if (on_behalf_of) body.on_behalf_of = on_behalf_of;
      const res = await fetch("/api/rsvps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to clear RSVP");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["rsvps", vars.event_id] });
      qc.invalidateQueries({ queryKey: ["event-dashboard", vars.event_id] });
    },
  });
}
