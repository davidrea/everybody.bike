"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Filter } from "lucide-react";
import Link from "next/link";
import { useEvents } from "@/hooks/use-events";
import { useGroups } from "@/hooks/use-groups";
import { useAuth } from "@/hooks/use-auth";
import { useScheduledNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { EventCard } from "./event-card";
import { EVENT_TYPES } from "@/types";
import { shouldShowOnDemandAnnouncement } from "./event-list-helpers";

const typeLabels: Record<string, string> = {
  ride: "Ride",
  clinic: "Clinic",
  social: "Social",
  meeting: "Meeting",
  other: "Other",
};

export function EventList() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const admin = isAdmin();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const { data: groups } = useGroups();
  const { data: scheduledNotifications } = useScheduledNotifications(admin);

  const filters: Record<string, string> = {};
  if (typeFilter !== "all") filters.type = typeFilter;
  if (groupFilter !== "all") filters.group_id = groupFilter;

  const { data: events, isLoading } = useEvents(
    Object.keys(filters).length > 0 ? filters : undefined,
  );
  const now = new Date();
  const upcomingEvents =
    events?.filter((event) => new Date(event.starts_at) >= now) ?? [];
  const pastEvents =
    events?.filter((event) => new Date(event.starts_at) < now) ?? [];

  const announceNow = useMutation({
    mutationFn: async (event: { id: string; title: string }) => {
      const res = await fetch(`/api/events/${event.id}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "announcement",
          target_type: "event_all",
          scheduled_for: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to schedule announcement");
      }
      return res.json();
    },
    onSuccess: (_data, event) => {
      toast.success(`Announcement scheduled for ${event.title}`);
      qc.invalidateQueries({ queryKey: ["notifications", "scheduled"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to schedule announcement");
    },
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {typeLabels[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {groups?.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {admin && (
          <Button asChild>
            <Link href="/events/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Event
            </Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : events && events.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-muted-foreground">
          No events found. {admin && "Create your first event."}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-semibold">
                Upcoming Events
              </h2>
              <span className="text-sm text-muted-foreground">
                {upcomingEvents.length}
                {upcomingEvents.length === 1 ? " event" : " events"}
              </span>
            </div>
            {upcomingEvents.length === 0 ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed p-8 text-muted-foreground">
                No upcoming events.
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="space-y-2">
                    <EventCard event={event} />
                    {shouldShowOnDemandAnnouncement({
                      isAdmin: admin,
                      eventId: event.id,
                      notifications: scheduledNotifications,
                    }) && (
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            announceNow.mutate({ id: event.id, title: event.title })
                          }
                          disabled={announceNow.isPending}
                        >
                          {announceNow.isPending &&
                          announceNow.variables?.id === event.id
                            ? "Scheduling..."
                            : "Announce now"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {pastEvents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-xl font-semibold">
                  Past Events
                </h2>
                <span className="text-sm text-muted-foreground">
                  {pastEvents.length}
                  {pastEvents.length === 1 ? " event" : " events"}
                </span>
              </div>
              <div className="space-y-3">
                {pastEvents.map((event) => (
                  <EventCard key={event.id} event={event} variant="past" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
