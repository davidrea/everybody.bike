"use client";

import { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { useGroups } from "@/hooks/use-groups";
import {
  useScheduledNotifications,
  useCreateScheduledNotification,
  useDeleteScheduledNotification,
  useUpcomingEventsForNotifications,
} from "@/hooks/use-notifications";
import type { NotificationTargetType, ScheduledNotification } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const targetTypeOptions: { value: NotificationTargetType; label: string }[] = [
  { value: "all", label: "All users" },
  { value: "group", label: "Specific group" },
  { value: "event_all", label: "Event audience (all)" },
  { value: "event_rsvpd", label: "RSVP'd to event" },
  { value: "event_not_rsvpd", label: "Not RSVP'd to event" },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationScheduler() {
  const { data: groups } = useGroups();
  const { data: events } = useUpcomingEventsForNotifications();
  const { data: scheduled, isLoading } = useScheduledNotifications();
  const createNotification = useCreateScheduledNotification();
  const deleteNotification = useDeleteScheduledNotification();
  const [showAllSent, setShowAllSent] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [targetType, setTargetType] = useState<NotificationTargetType>("all");
  const [targetId, setTargetId] = useState<string | null>(null);

  const targetOptions = useMemo((): { value: string; label: string }[] => {
    if (targetType === "group") {
      return (groups ?? []).map((group) => ({
        value: group.id,
        label: group.name,
      }));
    }
    if (
      targetType === "event_all" ||
      targetType === "event_rsvpd" ||
      targetType === "event_not_rsvpd"
    ) {
      return (events ?? []).map((event: { id: string; title: string; starts_at: string }) => ({
        value: event.id,
        label: `${event.title} (${formatDateTime(event.starts_at)})`,
      }));
    }
    return [];
  }, [events, groups, targetType]);

  const pendingNotifications = useMemo(
    () =>
      (scheduled ?? [])
        .filter((n) => !n.sent)
        .sort(
          (a, b) =>
            new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
        ),
    [scheduled]
  );

  const sentNotifications = useMemo(
    () =>
      (scheduled ?? [])
        .filter((n) => n.sent)
        .sort(
          (a, b) =>
            new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime()
        ),
    [scheduled]
  );

  const visibleSentNotifications = showAllSent
    ? sentNotifications
    : sentNotifications.slice(0, 10);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteNotification.mutateAsync(id);
        toast.success("Notification deleted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete notification");
      }
    },
    [deleteNotification]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !body.trim() || !scheduledFor) {
      toast.error("Title, message, and schedule time are required");
      return;
    }
    if (targetType !== "all" && !targetId) {
      toast.error("Select a target for this notification");
      return;
    }

    const isoTime = new Date(scheduledFor).toISOString();

    try {
      await createNotification.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || undefined,
        scheduled_for: isoTime,
        target_type: targetType,
        target_id: targetType === "all" ? null : targetId,
      });
      toast.success("Notification scheduled");
      setTitle("");
      setBody("");
      setUrl("");
      setScheduledFor("");
      setTargetType("all");
      setTargetId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule notification");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule a Notification</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Trail update"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Reminder: bring lights for the evening ride."
                rows={3}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="scheduled_for">Send at</Label>
                <Input
                  id="scheduled_for"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">Link (optional)</Label>
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://everybody.bike/events/123"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select
                  value={targetType}
                  onValueChange={(value) => {
                    setTargetType(value as NotificationTargetType);
                    setTargetId(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {targetType !== "all" && (
                <div className="space-y-2">
                  <Label>Target</Label>
                  <Select value={targetId ?? ""} onValueChange={(value) => setTargetId(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Button type="submit" disabled={createNotification.isPending}>
              {createNotification.isPending ? "Scheduling..." : "Schedule Notification"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : pendingNotifications.length > 0 ? (
            pendingNotifications.map((item) => (
              <ScheduledNotificationRow
                key={item.id}
                notification={item}
                groups={groups ?? []}
                events={events ?? []}
                onDelete={handleDelete}
                isDeleting={deleteNotification.isPending}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No pending notifications.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sent Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : sentNotifications.length > 0 ? (
            <>
              {visibleSentNotifications.map((item) => (
                <ScheduledNotificationRow
                  key={item.id}
                  notification={item}
                  groups={groups ?? []}
                  events={events ?? []}
                  onDelete={handleDelete}
                  isDeleting={deleteNotification.isPending}
                />
              ))}
              {sentNotifications.length > 10 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAllSent((prev) => !prev)}
                >
                  {showAllSent
                    ? "Show less"
                    : `Show all ${sentNotifications.length} sent notifications`}
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No sent notifications yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduledNotificationRow({
  notification,
  groups,
  events,
  onDelete,
  isDeleting,
}: {
  notification: ScheduledNotification;
  groups: { id: string; name: string }[];
  events: { id: string; title: string; starts_at: string }[];
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const targetLabel = useMemo(() => {
    if (notification.target_type === "all") return "All users";
    if (notification.target_type === "group") {
      const group = groups.find((g) => g.id === notification.target_id);
      return group ? `Group: ${group.name}` : "Group";
    }
    const event = events.find((e) => e.id === notification.target_id);
    if (notification.target_type === "event_all") {
      return event ? `Event audience: ${event.title}` : "Event audience";
    }
    if (notification.target_type === "event_rsvpd") {
      return event ? `RSVP'd: ${event.title}` : "RSVP'd to event";
    }
    return event ? `Not RSVP'd: ${event.title}` : "Not RSVP'd to event";
  }, [events, groups, notification.target_id, notification.target_type]);

  const categoryLabel = useMemo(() => {
    switch (notification.category) {
      case "announcement":
        return "Announcement";
      case "reminder":
        return "Reminder";
      case "event_update":
        return "Event update";
      case "custom_message":
      default:
        return "Custom";
    }
  }, [notification.category]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div>
        <p className="text-sm font-medium">{notification.title}</p>
        <p className="text-xs text-muted-foreground">
          {categoryLabel} · {targetLabel} · {formatDateTime(notification.scheduled_for)}
        </p>
        <p className="text-xs text-muted-foreground">
          Status: {notification.sent ? "Sent" : "Pending"}
        </p>
      </div>
      {!notification.sent && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(notification.id)}
          disabled={isDeleting}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}
