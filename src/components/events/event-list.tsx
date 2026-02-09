"use client";

import { useState } from "react";
import { Plus, Filter } from "lucide-react";
import Link from "next/link";
import { useEvents } from "@/hooks/use-events";
import { useGroups } from "@/hooks/use-groups";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EventCard } from "./event-card";
import { EVENT_TYPES } from "@/types";

const typeLabels: Record<string, string> = {
  ride: "Ride",
  clinic: "Clinic",
  social: "Social",
  meeting: "Meeting",
  other: "Other",
};

export function EventList() {
  const { isAdmin } = useAuth();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const { data: groups } = useGroups();

  const filters: Record<string, string> = {};
  if (typeFilter !== "all") filters.type = typeFilter;
  if (groupFilter !== "all") filters.group_id = groupFilter;

  const { data: events, isLoading } = useEvents(
    Object.keys(filters).length > 0 ? filters : undefined,
  );

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

        {isAdmin() && (
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
          No events found. {isAdmin() && "Create your first event."}
        </div>
      ) : (
        <div className="space-y-3">
          {events?.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </>
  );
}
