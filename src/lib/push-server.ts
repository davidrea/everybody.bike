import webpush from "web-push";

type PushSubscriptionRecord = {
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
};

let configured = false;

export function getVapidPublicKey() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    throw new Error("VAPID_PUBLIC_KEY is not set");
  }
  return key;
}

function ensureWebPushConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error("Missing VAPID env vars (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function sendWebPushNotification(
  subscription: PushSubscriptionRecord,
  payload: Record<string, unknown>,
) {
  ensureWebPushConfigured();

  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys_p256dh,
        auth: subscription.keys_auth,
      },
    },
    JSON.stringify(payload),
  );
}
