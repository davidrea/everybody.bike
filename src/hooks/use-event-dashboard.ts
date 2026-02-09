"use client";

import { useQuery } from "@tanstack/react-query";
import type { EventDashboardData } from "@/types";

export function useEventDashboard(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event-dashboard", eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<EventDashboardData> => {
      const res = await fetch(`/api/events/${eventId}/dashboard`);
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
  });
}
