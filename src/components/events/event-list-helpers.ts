import type { ScheduledNotification } from "@/types";

export function hasEventAnnouncementRecord(
  notifications: ScheduledNotification[],
  eventId: string,
): boolean {
  return notifications.some(
    (notification) =>
      notification.event_id === eventId && notification.category === "announcement",
  );
}

export function shouldShowOnDemandAnnouncement(params: {
  isAdmin: boolean;
  eventId: string;
  notifications?: ScheduledNotification[];
}): boolean {
  const { isAdmin, eventId, notifications } = params;
  if (!isAdmin || !notifications) return false;
  return !hasEventAnnouncementRecord(notifications, eventId);
}

