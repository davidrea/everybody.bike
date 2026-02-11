self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || "everybody.bike";
  const options = {
    body: data.body || "New update from everybody.bike",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Validate that a URL is safe to navigate to (same-origin or relative path).
 * Blocks javascript:, data:, and cross-origin URLs.
 */
function isSafeUrl(url) {
  if (!url || typeof url !== "string") return false;
  // Relative paths starting with / are always safe
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url, self.location.origin);
    return parsed.origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url || "/";
  const url = isSafeUrl(rawUrl) ? rawUrl : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
