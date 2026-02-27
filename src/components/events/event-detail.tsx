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
  CircleX,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useEvent, useDeleteEvent, useCancelEvent } from "@/hooks/use-events";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const cancelEvent = useCancelEvent();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

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

  const groups = event?.event_groups?.map((eg) => eg.groups).filter(Boolean) ?? [];
  const admin = isAdmin();
  const isRecurring = !!event?.recurrence_rule;
  const isCanceled = !!event?.canceled_at;

  async function handleCancelEvent() {
    const reason = cancelReason.trim();
    if (!reason) {
      toast.error("Please enter a cancellation reason");
      return;
    }

    try {
      await cancelEvent.mutateAsync({ id: eventId, reason });
      setShowCancelDialog(false);
      setCancelReason("");
      toast.success("Event canceled and notifications sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel event");
    }
  }

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64" />
        </div>
      ) : !event ? (
        <p className="text-muted-foreground">Event not found.</p>
      ) : (
        <>
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
                  <div className="flex items-center gap-2">
                    {!isCanceled && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowCancelDialog(true)}
                      >
                        <CircleX className="mr-1 h-4 w-4" />
                        Cancel Event
                      </Button>
                    )}
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
                </div>
              )}
            </div>
          </div>

          {/* Event info */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              {isCanceled && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                  <p className="text-sm font-semibold text-destructive">
                    Event Canceled
                  </p>
                  {event.canceled_reason && (
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {event.canceled_reason}
                    </p>
                  )}
                </div>
              )}

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

              <>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {groups.length > 0 ? (
                    groups.map(
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
                    )
                  ) : (
                    <Badge variant="secondary">Roll Model/Admin Only</Badge>
                  )}
                </div>
              </>

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
          {isCanceled ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">RSVP</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This event is canceled. RSVP changes are disabled.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">RSVP</CardTitle>
              </CardHeader>
              <CardContent>
                <RsvpControls eventId={eventId} event={event} />
              </CardContent>
            </Card>
          )}

          {admin && <EventNotificationSchedule event={event} />}

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

          <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel Event</DialogTitle>
                <DialogDescription>
                  This will mark the event canceled and send push and email notifications to the event audience.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="cancel_reason">Cancellation reason</Label>
                <Textarea
                  id="cancel_reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Example: Trails are closed due to heavy rain."
                  rows={4}
                  maxLength={1000}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCancelDialog(false)}
                >
                  Keep Event
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    void handleCancelEvent();
                  }}
                  disabled={cancelEvent.isPending}
                >
                  Confirm Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Event Dashboard — always rendered so it can start fetching immediately */}
      <EventDashboard eventId={eventId} />
    </div>
  );
}
