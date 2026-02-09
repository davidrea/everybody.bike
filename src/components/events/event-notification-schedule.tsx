"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Bell } from "lucide-react";
import {
  useCreateEventNotification,
  useDeleteScheduledNotification,
  useEventNotifications,
  useUpdateScheduledNotification,
} from "@/hooks/use-notifications";
import {
  DEFAULT_REMINDER_OFFSETS,
  getAnnouncementScheduleTime,
  getDefaultReminderTimes,
} from "@/lib/event-notifications";
import type { EventWithGroups, NotificationTargetType, ScheduledNotification } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const reminderAudienceOptions: { value: NotificationTargetType; label: string }[] = [
  { value: "event_all", label: "Everyone in event" },
  { value: "event_not_rsvpd", label: "Only those not RSVPd" },
];

function toInputValue(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromInputValue(value: string) {
  return new Date(value).toISOString();
}

function getDefaultAnnouncementValue(startsAt: string) {
  const now = new Date();
  const scheduled = getAnnouncementScheduleTime(now, new Date(startsAt));
  return scheduled ? toInputValue(scheduled.toISOString()) : "";
}

function getDefaultReminderValue(startsAt: string, existing: ScheduledNotification[]) {
  const now = new Date();
  const defaults = getDefaultReminderTimes(new Date(startsAt), now);
  const existingTimes = new Set(existing.map((n) => toInputValue(n.scheduled_for)));
  const next = defaults.find((d) => !existingTimes.has(toInputValue(d.toISOString())));
  if (next) return toInputValue(next.toISOString());

  const fallback = new Date(new Date(startsAt).getTime() - DEFAULT_REMINDER_OFFSETS[2].ms);
  return fallback > now ? toInputValue(fallback.toISOString()) : "";
}

export function EventNotificationSchedule({ event }: { event: EventWithGroups }) {
  const { data, isLoading } = useEventNotifications(event.id);
  const createNotification = useCreateEventNotification(event.id);
  const updateNotification = useUpdateScheduledNotification();
  const deleteNotification = useDeleteScheduledNotification();

  const announcement = useMemo(
    () => data?.find((n) => n.category === "announcement") ?? null,
    [data],
  );

  const reminders = useMemo(
    () => (data ?? []).filter((n) => n.category === "reminder"),
    [data],
  );

  const [announcementTime, setAnnouncementTime] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderAudience, setReminderAudience] = useState<NotificationTargetType>(
    "event_all",
  );

  useEffect(() => {
    if (!announcement) {
      setAnnouncementTime(getDefaultAnnouncementValue(event.starts_at));
      return;
    }
    setAnnouncementTime(toInputValue(announcement.scheduled_for));
  }, [announcement, event.starts_at]);

  useEffect(() => {
    setReminderTime(getDefaultReminderValue(event.starts_at, reminders));
  }, [event.starts_at, reminders]);

  async function handleAnnouncementSave() {
    if (!announcementTime) {
      toast.error("Pick a time for the announcement");
      return;
    }
    try {
      if (!announcement) {
        await createNotification.mutateAsync({
          category: "announcement",
          scheduled_for: fromInputValue(announcementTime),
          target_type: "event_all",
        });
        toast.success("Announcement scheduled");
        return;
      }
      await updateNotification.mutateAsync({
        id: announcement.id,
        scheduled_for: fromInputValue(announcementTime),
        target_type: "event_all",
      });
      toast.success("Announcement updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update announcement");
    }
  }

  async function handleAnnouncementCancel() {
    if (!announcement) return;
    try {
      await deleteNotification.mutateAsync(announcement.id);
      toast.success("Announcement canceled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel announcement");
    }
  }

  async function handleReminderCreate() {
    if (!reminderTime) {
      toast.error("Pick a time for the reminder");
      return;
    }
    try {
      await createNotification.mutateAsync({
        category: "reminder",
        scheduled_for: fromInputValue(reminderTime),
        target_type: reminderAudience,
      });
      toast.success("Reminder scheduled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule reminder");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-4 w-4" />
          Event Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4" />
                Announcement
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="announcement_time">Send at</Label>
                  <Input
                    id="announcement_time"
                    type="datetime-local"
                    value={announcementTime}
                    onChange={(e) => setAnnouncementTime(e.target.value)}
                    disabled={announcement?.sent}
                  />
                  {announcement?.sent && (
                    <p className="text-xs text-muted-foreground">Sent already.</p>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    onClick={handleAnnouncementSave}
                    disabled={
                      createNotification.isPending ||
                      updateNotification.isPending ||
                      announcement?.sent
                    }
                  >
                    {announcement ? "Update" : "Schedule"}
                  </Button>
                  {announcement && !announcement.sent && (
                    <Button
                      variant="outline"
                      onClick={handleAnnouncementCancel}
                      disabled={deleteNotification.isPending}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Reminders</p>
                <span className="text-xs text-muted-foreground">
                  Defaults: {DEFAULT_REMINDER_OFFSETS.map((r) => r.label).join(", ")}
                </span>
              </div>

              {reminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reminders scheduled.</p>
              ) : (
                <div className="space-y-3">
                  {reminders.map((reminder) => (
                    <ReminderRow
                      key={reminder.id}
                      reminder={reminder}
                      onDelete={deleteNotification.mutateAsync}
                      onUpdate={updateNotification.mutateAsync}
                      isSaving={updateNotification.isPending}
                      isDeleting={deleteNotification.isPending}
                    />
                  ))}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                <div className="space-y-2">
                  <Label htmlFor="reminder_time">Send at</Label>
                  <Input
                    id="reminder_time"
                    type="datetime-local"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Audience</Label>
                  <Select
                    value={reminderAudience}
                    onValueChange={(value) =>
                      setReminderAudience(value as NotificationTargetType)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Audience" />
                    </SelectTrigger>
                    <SelectContent>
                      {reminderAudienceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleReminderCreate}
                    disabled={createNotification.isPending}
                  >
                    Add reminder
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReminderRow({
  reminder,
  onDelete,
  onUpdate,
  isSaving,
  isDeleting,
}: {
  reminder: ScheduledNotification;
  onDelete: (id: string) => Promise<unknown>;
  onUpdate: (values: { id: string; scheduled_for?: string; target_type?: NotificationTargetType }) =>
    | Promise<unknown>
    | void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const [scheduledFor, setScheduledFor] = useState(toInputValue(reminder.scheduled_for));
  const [targetType, setTargetType] = useState<NotificationTargetType>(
    reminder.target_type,
  );

  async function handleSave() {
    try {
      await onUpdate({
        id: reminder.id,
        scheduled_for: fromInputValue(scheduledFor),
        target_type: targetType,
      });
      toast.success("Reminder updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update reminder");
    }
  }

  async function handleDelete() {
    try {
      await onDelete(reminder.id);
      toast.success("Reminder deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete reminder");
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_220px_auto]">
      <Input
        type="datetime-local"
        value={scheduledFor}
        onChange={(e) => setScheduledFor(e.target.value)}
        disabled={reminder.sent}
      />
      <Select
        value={targetType}
        onValueChange={(value) => setTargetType(value as NotificationTargetType)}
        disabled={reminder.sent}
      >
        <SelectTrigger>
          <SelectValue placeholder="Audience" />
        </SelectTrigger>
        <SelectContent>
          {reminderAudienceOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={isSaving || reminder.sent}>
          Save
        </Button>
        {!reminder.sent && (
          <Button variant="outline" onClick={handleDelete} disabled={isDeleting}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
