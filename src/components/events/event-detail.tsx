"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Repeat,
  Users,
  Pencil,
  Trash2,
  ExternalLink,
  CloudSun,
  CalendarClock,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useEvent, useDeleteEvent } from "@/hooks/use-events";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EventTypeBadge } from "./event-type-badge";
import { RecurringEditDialog } from "./recurring-edit-dialog";
import { RsvpControls } from "@/components/rsvp/rsvp-controls";
import { EventDashboard } from "./event-dashboard";
import { humanizeRRule } from "@/lib/recurrence";
import { EventNotificationSchedule } from "./event-notification-schedule";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventDetail({ eventId }: { eventId: string }) {
  const { data: event, isLoading } = useEvent(eventId);
  const { isAdmin } = useAuth();
  const deleteEvent = useDeleteEvent();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  async function handleDelete(mode: "single" | "series") {
    try {
      await deleteEvent.mutateAsync({ id: eventId, deleteMode: mode });
      toast.success(
        mode === "series" ? "Series deleted" : "Event deleted",
      );
      router.push("/events");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!event) {
    return <p className="text-muted-foreground">Event not found.</p>;
  }

  const groups = event.event_groups?.map((eg) => eg.groups).filter(Boolean) ?? [];
  const admin = isAdmin();
  const isRecurring = !!event.recurrence_rule;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All Events
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-3xl font-bold tracking-tight">
                {event.title}
              </h1>
              <EventTypeBadge type={event.type} />
            </div>
          </div>

          {admin && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/events/${eventId}/report`}>
                  <Printer className="mr-1 h-4 w-4" />
                  Print report
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/events/${eventId}/edit`}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (isRecurring) {
                    setShowDeleteDialog(true);
                  } else {
                    handleDelete("single");
                  }
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Event info */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p>{formatDateTime(event.starts_at)}</p>
                {event.ends_at && (
                  <p className="text-muted-foreground">
                    to {formatDateTime(event.ends_at)}
                  </p>
                )}
              </div>
            </div>

            {event.location && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{event.location}</span>
                {event.map_url && (
                  <a
                    href={event.map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}

            {event.rsvp_deadline && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span>
                  RSVP by {formatDateTime(event.rsvp_deadline)}
                </span>
              </div>
            )}

            {event.capacity && (
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>Capacity: {event.capacity}</span>
              </div>
            )}

            {isRecurring && event.recurrence_rule && (
              <div className="flex items-center gap-2 text-sm">
                <Repeat className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize">
                  {humanizeRRule(event.recurrence_rule)}
                </span>
              </div>
            )}

            {event.weather_notes && (
              <div className="flex items-center gap-2 text-sm">
                <CloudSun className="h-4 w-4 text-muted-foreground" />
                <span>{event.weather_notes}</span>
              </div>
            )}
          </div>

          {groups.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                {groups.map(
                  (g) =>
                    g && (
                      <Badge
                        key={g.id}
                        variant="outline"
                        className="gap-1.5"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        {g.name}
                      </Badge>
                    ),
                )}
              </div>
            </>
          )}

          {event.description && (
            <>
              <Separator />
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{event.description}</p>
              </div>
            </>
          )}

          {event.profiles && (
            <p className="text-xs text-muted-foreground">
              Created by {event.profiles.full_name}
            </p>
          )}
        </CardContent>
      </Card>

      {/* RSVP Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">RSVP</CardTitle>
        </CardHeader>
        <CardContent>
          <RsvpControls eventId={eventId} event={event} />
        </CardContent>
      </Card>

      {admin && <EventNotificationSchedule event={event} />}

      {/* Event Dashboard */}
      <EventDashboard eventId={eventId} />

      {/* Recurring edit/delete dialog */}
      {isRecurring && (
        <RecurringEditDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          action="delete"
          onSingle={() => handleDelete("single")}
          onSeries={() => handleDelete("series")}
        />
      )}
    </div>
  );
}
