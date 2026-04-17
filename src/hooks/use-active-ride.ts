"use client";

import { useMemo, useState, useEffect } from "react";
import { useEvents } from "@/hooks/use-events";
import { useMyRsvpsBulk } from "@/hooks/use-rsvp";
import type { EventWithGroups } from "@/types";

const WINDOW_BEFORE_MS = 30 * 60 * 1000; // 30 minutes
const FALLBACK_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const PAST_WINDOW_MS = 6 * 60 * 60 * 1000; // look back 6 hours for in-progress rides

function isInActiveWindow(event: EventWithGroups, now: Date): boolean {
  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at
    ? new Date(event.ends_at)
    : new Date(startsAt.getTime() + FALLBACK_DURATION_MS);
  const windowOpen = new Date(startsAt.getTime() - WINDOW_BEFORE_MS);
  return now >= windowOpen && now <= endsAt;
}

export function useActiveRide(userId: string | undefined) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Fetch rides in [now - 6h, now + 31min] to catch both in-progress and imminent rides
  const from = useMemo(
    () => new Date(now.getTime() - PAST_WINDOW_MS).toISOString(),
    [now],
  );
  const to = useMemo(
    () => new Date(now.getTime() + WINDOW_BEFORE_MS + 60_000).toISOString(),
    [now],
  );

  const { data: candidateEvents } = useEvents({ from, to, type: "ride" });

  const rideEventIds = useMemo(
    () => (candidateEvents ?? []).map((e) => e.id),
    [candidateEvents],
  );

  const { data: rsvpMap } = useMyRsvpsBulk(rideEventIds, userId);

  const activeRide = useMemo<EventWithGroups | null>(() => {
    if (!candidateEvents || !rsvpMap) return null;
    const sorted = [...candidateEvents].sort((a, b) =>
      a.starts_at.localeCompare(b.starts_at),
    );
    for (const event of sorted) {
      const selfRsvp = rsvpMap[event.id]?.selfRsvp;
      if (!selfRsvp || selfRsvp.status === "no") continue;
      if (isInActiveWindow(event, now)) return event;
    }
    return null;
  }, [candidateEvents, rsvpMap, now]);

  return activeRide;
}
