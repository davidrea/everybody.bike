const MIN_SCHEDULE_MS = 5 * 60 * 1000;
const ANNOUNCEMENT_CUTOFF_HOUR = 21;
const ANNOUNCEMENT_NEXT_MORNING_HOUR = 9;

export const DEFAULT_REMINDER_OFFSETS = [
  { label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
];

export type EventNotificationDefaults = {
  sendAnnouncement: boolean;
  sendReminders: boolean;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function clampSchedule(candidate: Date, now: Date, startsAt: Date): Date | null {
  const minTime = new Date(now.getTime() + MIN_SCHEDULE_MS);
  let scheduled = candidate;

  if (scheduled.getTime() < minTime.getTime()) {
    scheduled = minTime;
  }

  if (scheduled.getTime() >= startsAt.getTime()) {
    if (minTime.getTime() < startsAt.getTime()) {
      return minTime;
    }
    return null;
  }

  return scheduled;
}

export function getAnnouncementScheduleTime(now: Date, startsAt: Date): Date | null {
  const candidate = new Date(now);

  if (candidate.getHours() >= ANNOUNCEMENT_CUTOFF_HOUR) {
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(ANNOUNCEMENT_NEXT_MORNING_HOUR, 0, 0, 0);
  } else {
    candidate.setSeconds(0, 0);
  }

  return clampSchedule(candidate, now, startsAt);
}

export function getDefaultReminderTimes(startsAt: Date, now: Date): Date[] {
  const reminders: Date[] = [];
  const minTime = new Date(now.getTime() + MIN_SCHEDULE_MS);
  for (const offset of DEFAULT_REMINDER_OFFSETS) {
    const candidate = new Date(startsAt.getTime() - offset.ms);
    if (candidate <= minTime || candidate >= startsAt) {
      continue;
    }
    reminders.push(candidate);
  }
  return reminders;
}

export function getDefaultEventNotificationTimes(
  startsAt: Date,
  now: Date,
  defaults: EventNotificationDefaults,
): { announcementTime: Date | null; reminderTimes: Date[] } {
  return {
    announcementTime: defaults.sendAnnouncement
      ? getAnnouncementScheduleTime(now, startsAt)
      : null,
    reminderTimes: defaults.sendReminders
      ? getDefaultReminderTimes(startsAt, now)
      : [],
  };
}

export function buildEventNotificationContent(event: {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
}, category: "announcement" | "reminder" | "event_update") {
  const when = formatDateTime(event.starts_at);
  const location = event.location ? ` at ${event.location}` : "";
  const url = `/events/${event.id}`;

  switch (category) {
    case "announcement":
      return {
        title: `New event: ${event.title}`,
        body: `${when}${location}. RSVP in the app.`,
        url,
      };
    case "event_update":
      return {
        title: `Update: ${event.title}`,
        body: `Event details updated. ${when}${location}.`,
        url,
      };
    case "reminder":
    default:
      return {
        title: `Reminder: ${event.title}`,
        body: `${when}${location}. RSVP if you haven't yet.`,
        url,
      };
  }
}
