"use client";

import Link from "next/link";
import { MapPin, Clock, Repeat, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EventTypeBadge } from "./event-type-badge";
import { cn } from "@/lib/utils";
import type { EventWithGroups } from "@/types";
import { Badge } from "@/components/ui/badge";
import type { BulkRsvpEntry } from "@/app/api/rsvps/mine/bulk/route";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    day: d.getDate(),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    time: d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

const rsvpStatusConfig = {
  yes: { label: "Going", icon: CheckCircle2, className: "text-green-600 dark:text-green-400" },
  no: { label: "Not going", icon: XCircle, className: "text-red-600 dark:text-red-400" },
  maybe: { label: "Maybe", icon: HelpCircle, className: "text-amber-600 dark:text-amber-400" },
} as const;

function RsvpStatusChip({ status, name }: { status: string; name?: string }) {
  const config = rsvpStatusConfig[status as keyof typeof rsvpStatusConfig];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", config.className)}>
      <Icon className="h-3.5 w-3.5" />
      {name ? `${name}: ${config.label}` : config.label}
    </span>
  );
}

export function EventCard({
  event,
  variant = "default",
  rsvpEntry,
}: {
  event: EventWithGroups;
  variant?: "default" | "past";
  rsvpEntry?: BulkRsvpEntry;
}) {
  const date = formatDate(event.starts_at);
  const groups = event.event_groups?.map((eg) => eg.groups) ?? [];
  const isPast = variant === "past";
  const isCanceled = !!event.canceled_at;

  return (
    <Link href={`/events/${event.id}`}>
      <Card
        className={cn(
          "transition-colors hover:bg-muted/50",
          isPast && "opacity-70",
        )}
      >
        <CardContent className="flex gap-4 p-4">
          <div
            className={cn(
              "flex min-w-[60px] flex-col items-center rounded-lg bg-primary/10 px-3 py-2 text-primary",
              isPast && "bg-muted/60 text-muted-foreground",
            )}
          >
            <span className="text-xs font-medium uppercase">{date.month}</span>
            <span className="text-2xl font-bold leading-none">{date.day}</span>
            <span className="text-xs">{date.weekday}</span>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-heading text-lg font-semibold leading-tight">
                {event.title}
              </h3>
              <div className="flex items-center gap-2">
                {isCanceled && <Badge variant="destructive">Canceled</Badge>}
                <EventTypeBadge type={event.type} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {date.time}
              </span>
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="truncate">{event.location}</span>
                </span>
              )}
              {event.recurrence_rule && (
                <span className="flex items-center gap-1">
                  <Repeat className="h-3.5 w-3.5" />
                  Recurring
                </span>
              )}
            </div>

            {groups.length > 0 && (
              <div className="flex gap-1.5 pt-1">
                {groups.map(
                  (g) =>
                    g && (
                      <span
                        key={g.id}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        {g.name}
                      </span>
                    ),
                )}
              </div>
            )}

            {rsvpEntry && (rsvpEntry.selfRsvp || rsvpEntry.minorRsvps.length > 0) && (
              <div className="flex flex-wrap gap-3 pt-1">
                {rsvpEntry.selfRsvp && (
                  <RsvpStatusChip status={rsvpEntry.selfRsvp.status} />
                )}
                {rsvpEntry.minorRsvps.map((mr) => (
                  <RsvpStatusChip
                    key={mr.rider_id}
                    status={mr.status}
                    name={mr.riders.first_name}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
