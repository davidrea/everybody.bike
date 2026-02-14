import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { eventCancellationSchema } from "@/lib/validators";
import { sendWebPushNotification } from "@/lib/push-server";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/url";

type AdminClient = ReturnType<typeof createAdminClient>;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function getGroupAdultAudience(admin: AdminClient, groupIds: string[]) {
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

async function getGroupParents(admin: AdminClient, groupIds: string[]) {
  const ids = new Set<string>();
  if (groupIds.length === 0) return ids;

  const { data: parents } = await admin
    .from("rider_parents")
    .select("parent_id, riders!inner(group_id)")
    .in("riders.group_id", groupIds);

  parents?.forEach((row) => ids.add(row.parent_id));

  return ids;
}

async function getNoGroupAudience(admin: AdminClient) {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .or("roles.cs.{roll_model},roles.cs.{admin},roles.cs.{super_admin}");
  return new Set((data ?? []).map((row) => row.id));
}

async function getAdminAudience(admin: AdminClient) {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .or("roles.cs.{admin},roles.cs.{super_admin}");
  return new Set((data ?? []).map((row) => row.id));
}

async function getEventAudience(admin: AdminClient, eventId: string) {
  const { data: eventGroups } = await admin
    .from("event_groups")
    .select("group_id")
    .eq("event_id", eventId);

  const groupIds = eventGroups?.map((row) => row.group_id) ?? [];

  if (groupIds.length === 0) {
    return Array.from(await getNoGroupAudience(admin));
  }

  const adults = await getGroupAdultAudience(admin, groupIds);
  const parents = await getGroupParents(admin, groupIds);
  const admins = await getAdminAudience(admin);
  return Array.from(new Set([...adults, ...parents, ...admins]));
}

async function filterEligibleUsers(admin: AdminClient, userIds: string[]) {
  if (userIds.length === 0) return [];

  const eligible = new Set<string>();
  for (const batch of chunk(userIds, 500)) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .in("id", batch)
      .eq("invite_status", "accepted");

    const acceptedIds = (data ?? []).map((row) => row.id);
    if (acceptedIds.length === 0) continue;

    const { data: prefs } = await admin
      .from("notification_preferences")
      .select("user_id, event_update")
      .in("user_id", acceptedIds);

    const disabled = new Set(
      (prefs ?? [])
        .filter((row) => row.event_update === false)
        .map((row) => row.user_id),
    );

    for (const id of acceptedIds) {
      if (!disabled.has(id)) eligible.add(id);
    }
  }

  return Array.from(eligible);
}

async function getSubscriptions(admin: AdminClient, userIds: string[]) {
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

async function getEmails(admin: AdminClient, userIds: string[]) {
  const emails = new Map<string, string>();
  if (userIds.length === 0) return emails;

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isAdmin =
    profile?.roles?.includes("admin") ||
    profile?.roles?.includes("super_admin");

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = eventCancellationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, title, starts_at, location, canceled_at")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.canceled_at) {
    return NextResponse.json({ error: "Event is already canceled" }, { status: 409 });
  }

  const canceledAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("events")
    .update({
      canceled_at: canceledAt,
      canceled_reason: parsed.data.reason,
      canceled_by: user.id,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin
    .from("scheduled_notifications")
    .delete()
    .eq("event_id", id)
    .eq("sent", false)
    .in("category", ["announcement", "reminder"]);

  const title = `Canceled: ${event.title}`;
  const when = new Date(event.starts_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const where = event.location ? ` at ${event.location}` : "";
  const bodyText = `This event has been canceled (${when}${where}). Reason: ${parsed.data.reason}`;
  const url = `/events/${id}`;

  await admin.from("scheduled_notifications").insert({
    title,
    body: bodyText,
    url,
    scheduled_for: canceledAt,
    target_type: "event_all",
    target_id: id,
    category: "event_update",
    event_id: id,
    sent: true,
    created_by: user.id,
  });

  const targetUsers = await getEventAudience(admin, id);
  const recipients = await filterEligibleUsers(admin, targetUsers);
  const subscriptions = await getSubscriptions(admin, recipients);

  let pushSent = 0;
  let pushFailed = 0;
  let removedSubscriptions = 0;

  for (const subscription of subscriptions) {
    try {
      await sendWebPushNotification(subscription, {
        title,
        body: bodyText,
        url,
      });
      pushSent += 1;
    } catch (err) {
      pushFailed += 1;
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

  let emailSent = 0;
  let emailFailed = 0;
  let emailSkipped = 0;

  if (!isEmailConfigured()) {
    emailSkipped = recipients.length;
  } else {
    const baseUrl = getBaseUrl(request);
    const eventUrl = `${baseUrl}${url}`;
    const emails = await getEmails(admin, recipients);

    for (const userId of recipients) {
      const email = emails.get(userId);
      if (!email) {
        emailFailed += 1;
        continue;
      }

      try {
        await sendEmail({
          to: email,
          subject: title,
          text: `${bodyText}\n\n${eventUrl}`,
          html: `<p>${escapeHtml(bodyText)}</p><p><a href="${escapeHtml(eventUrl)}">View event details</a></p>`,
        });
        emailSent += 1;
      } catch {
        emailFailed += 1;
      }
    }
  }

  return NextResponse.json({
    success: true,
    canceled_at: canceledAt,
    notifications: {
      recipients: recipients.length,
      push_sent: pushSent,
      push_failed: pushFailed,
      removed_subscriptions: removedSubscriptions,
      email_sent: emailSent,
      email_failed: emailFailed,
      email_skipped: emailSkipped,
    },
  });
}
