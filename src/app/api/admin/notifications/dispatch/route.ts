import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPushNotification } from "@/lib/push-server";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { getBaseUrl } from "@/lib/url";
import { timingSafeEqual } from "crypto";

const MAX_BATCH = 25;

export const runtime = "nodejs";

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function filterAcceptedUsers(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  if (ids.length === 0) return [];
  const accepted: string[] = [];
  for (const batch of chunk(ids, 500)) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .in("id", batch)
      .eq("invite_status", "accepted");
    if (data) accepted.push(...data.map((row) => row.id));
  }
  return accepted;
}

async function getGroupAdultAudience(admin: ReturnType<typeof createAdminClient>, groupIds: string[]) {
  const ids = new Set<string>();
  if (groupIds.length === 0) return ids;

  const { data: riders } = await admin
    .from("profiles")
    .select("id")
    .in("rider_group_id", groupIds);

  riders?.forEach((row) => ids.add(row.id));

  const { data: rollModels } = await admin
    .from("roll_model_groups")
    .select("roll_model_id")
    .in("group_id", groupIds);

  rollModels?.forEach((row) => ids.add(row.roll_model_id));

  return ids;
}

async function getGroupParents(admin: ReturnType<typeof createAdminClient>, groupIds: string[]) {
  const ids = new Set<string>();
  if (groupIds.length === 0) return ids;

  const { data: parents } = await admin
    .from("rider_parents")
    .select("parent_id, riders!inner(group_id)")
    .in("riders.group_id", groupIds);

  parents?.forEach((row) => ids.add(row.parent_id));

  return ids;
}

async function getGroupAudience(admin: ReturnType<typeof createAdminClient>, groupId: string) {
  const adult = await getGroupAdultAudience(admin, [groupId]);
  const parents = await getGroupParents(admin, [groupId]);
  const ids = new Set([...adult, ...parents]);
  return Array.from(ids);
}

async function getEventGroupIds(admin: ReturnType<typeof createAdminClient>, eventId: string) {
  const { data } = await admin
    .from("event_groups")
    .select("group_id")
    .eq("event_id", eventId);
  return data?.map((row) => row.group_id) ?? [];
}

async function getEventRsvps(admin: ReturnType<typeof createAdminClient>, eventId: string) {
  const { data } = await admin
    .from("rsvps")
    .select("user_id, rider_id")
    .eq("event_id", eventId);
  return data ?? [];
}

async function getEventNotRsvpdAudience(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
) {
  const groupIds = await getEventGroupIds(admin, eventId);
  if (groupIds.length === 0) return [];

  const rsvps = await getEventRsvps(admin, eventId);
  const rsvpUserIds = new Set(
    rsvps.filter((row) => !row.rider_id).map((row) => row.user_id),
  );
  const rsvpRiderIds = new Set(
    rsvps.filter((row) => row.rider_id).map((row) => row.rider_id as string),
  );

  const adultAudience = await getGroupAdultAudience(admin, groupIds);
  const adultNotResponded = Array.from(adultAudience).filter(
    (id) => !rsvpUserIds.has(id),
  );

  const { data: riders } = await admin
    .from("riders")
    .select("id")
    .in("group_id", groupIds);
  const riderIds = riders?.map((row) => row.id) ?? [];
  const unrsvpedRiderIds = riderIds.filter((id) => !rsvpRiderIds.has(id));

  const parentIds = new Set<string>();
  if (unrsvpedRiderIds.length > 0) {
    const { data: parents } = await admin
      .from("rider_parents")
      .select("parent_id")
      .in("rider_id", unrsvpedRiderIds);
    parents?.forEach((row) => parentIds.add(row.parent_id));
  }

  return Array.from(new Set([...adultNotResponded, ...parentIds]));
}

async function getEventAudience(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
) {
  const groupIds = await getEventGroupIds(admin, eventId);
  if (groupIds.length === 0) return [];

  const adultAudience = await getGroupAdultAudience(admin, groupIds);
  const parentAudience = await getGroupParents(admin, groupIds);

  return Array.from(new Set([...adultAudience, ...parentAudience]));
}

async function getTargetUsers(
  admin: ReturnType<typeof createAdminClient>,
  notification: {
    target_type: string;
    target_id: string | null;
    id: string;
  },
) {
  switch (notification.target_type) {
    case "all": {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("invite_status", "accepted");
      return data?.map((row) => row.id) ?? [];
    }
    case "group": {
      if (!notification.target_id) return [];
      const ids = await getGroupAudience(admin, notification.target_id);
      return filterAcceptedUsers(admin, ids);
    }
    case "event_rsvpd": {
      if (!notification.target_id) return [];
      const rsvps = await getEventRsvps(admin, notification.target_id);
      const ids = Array.from(new Set(rsvps.map((row) => row.user_id)));
      return filterAcceptedUsers(admin, ids);
    }
    case "event_all": {
      if (!notification.target_id) return [];
      const ids = await getEventAudience(admin, notification.target_id);
      return filterAcceptedUsers(admin, ids);
    }
    case "event_not_rsvpd": {
      if (!notification.target_id) return [];
      const ids = await getEventNotRsvpdAudience(admin, notification.target_id);
      return filterAcceptedUsers(admin, ids);
    }
    default:
      return [];
  }
}

async function filterByPreferences(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
  category?: string | null,
) {
  if (userIds.length === 0) return [];
  const allowed = new Set<string>(userIds);
  const preferenceField =
    category === "announcement"
      ? "new_event"
      : category === "reminder"
        ? "rsvp_reminder"
        : category === "event_update"
          ? "event_update"
          : "custom_message";
  for (const batch of chunk(userIds, 500)) {
    const { data } = await admin
      .from("notification_preferences")
      .select(`user_id, ${preferenceField}`)
      .in("user_id", batch);
    data?.forEach((row) => {
      const enabled = row[preferenceField as keyof typeof row];
      if (enabled === false) {
        allowed.delete(row.user_id);
      }
    });
  }
  return Array.from(allowed);
}

async function getSubscriptions(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
) {
  if (userIds.length === 0) return [];
  const subscriptions: {
    id: string;
    endpoint: string;
    keys_p256dh: string;
    keys_auth: string;
    user_id: string;
  }[] = [];
  for (const batch of chunk(userIds, 500)) {
    const { data } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, keys_p256dh, keys_auth, user_id")
      .in("user_id", batch);
    if (data) subscriptions.push(...data);
  }
  return subscriptions;
}

async function getProfileEmails(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
) {
  if (userIds.length === 0) return new Map<string, string>();
  const emails = new Map<string, string>();
  for (const batch of chunk(userIds, 500)) {
    const { data } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", batch);
    data?.forEach((row) => {
      if (row.email) emails.set(row.id, row.email);
    });
  }
  return emails;
}

function resolveUrl(baseUrl: string, url: string | null) {
  if (!url) return baseUrl;
  // Only allow relative paths and same-origin absolute URLs
  if (url.startsWith("/")) return `${baseUrl}${url}`;
  if (/^https?:\/\//i.test(url)) {
    // Validate that absolute URLs point to the same origin
    try {
      const parsed = new URL(url);
      const base = new URL(baseUrl);
      if (parsed.host === base.host) return url;
    } catch {
      // Fall through to baseUrl
    }
    // External URLs are not allowed — return app root
    return baseUrl;
  }
  return `${baseUrl}/${url}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "NOTIFICATION_DISPATCH_SECRET is not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (
    !authHeader ||
    authHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: scheduled, error } = await admin
    .from("scheduled_notifications")
    .select("*")
    .eq("sent", false)
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!scheduled || scheduled.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let sentCount = 0;
  let failedCount = 0;
  let removedSubscriptions = 0;
  let emailSent = 0;
  let emailFailed = 0;
  let emailSkipped = 0;

  for (const notification of scheduled) {
    const targetUsers = await getTargetUsers(admin, notification);
    const optedInUsers = await filterByPreferences(
      admin,
      targetUsers,
      notification.category,
    );
    const subscriptions = await getSubscriptions(admin, optedInUsers);

    const payload = {
      title: notification.title,
      body: notification.body,
      url: notification.url ?? "/",
    };

    const usersWithSubscriptions = new Set(subscriptions.map((s) => s.user_id));
    const usersWithSuccess = new Set<string>();

    for (const subscription of subscriptions) {
      try {
        await sendWebPushNotification(subscription, payload);
        sentCount += 1;
        usersWithSuccess.add(subscription.user_id);
      } catch (err) {
        failedCount += 1;
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
          removedSubscriptions += 1;
        }
      }
    }

    const fallbackUsers = optedInUsers.filter(
      (id) => !usersWithSuccess.has(id) && !usersWithSubscriptions.has(id),
    );

    if (fallbackUsers.length > 0) {
      if (!isEmailConfigured()) {
        emailSkipped += fallbackUsers.length;
      } else {
        const baseUrl = getBaseUrl(request);
        const resolvedUrl = notification.url ? resolveUrl(baseUrl, notification.url) : "";
        const emails = await getProfileEmails(admin, fallbackUsers);
        for (const userId of fallbackUsers) {
          const email = emails.get(userId);
          if (!email) {
            emailFailed += 1;
            continue;
          }
          try {
            const text = `${notification.body}${
              resolvedUrl ? `\n\n${resolvedUrl}` : ""
            }`;
            const safeUrl = isSafeHttpUrl(resolvedUrl) ? resolvedUrl : "";
            const html = `<p>${escapeHtml(notification.body)}</p>${
              safeUrl
                ? `<p><a href="${escapeHtml(safeUrl)}">View details</a></p>`
                : ""
            }`;
            await sendEmail({
              to: email,
              subject: notification.title,
              text,
              html,
            });
            emailSent += 1;
          } catch {
            emailFailed += 1;
          }
        }
      }
    }

    await admin
      .from("scheduled_notifications")
      .update({ sent: true })
      .eq("id", notification.id);
  }

  return NextResponse.json({
    processed: scheduled.length,
    sent: sentCount,
    failed: failedCount,
    removed_subscriptions: removedSubscriptions,
    email_sent: emailSent,
    email_failed: emailFailed,
    email_skipped: emailSkipped,
  });
}
