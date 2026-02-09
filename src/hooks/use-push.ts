"use client";

import { useCallback, useEffect, useState } from "react";
import { isPushSupported, urlBase64ToUint8Array } from "@/lib/push";

type PushState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscription: PushSubscription | null;
  isLoading: boolean;
  error: string | null;
};

async function registerServiceWorker() {
  return navigator.serviceWorker.register("/sw.js");
}

async function getExistingSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export function usePushSubscription() {
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: "unsupported",
    subscription: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!isPushSupported()) {
      setState((prev) => ({ ...prev, supported: false, permission: "unsupported" }));
      return;
    }

    setState((prev) => ({
      ...prev,
      supported: true,
      permission: Notification.permission,
    }));

    void (async () => {
      try {
        await registerServiceWorker();
        const existing = await getExistingSubscription();
        if (existing) {
          await fetch("/api/notifications/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: existing.toJSON(),
              user_agent: navigator.userAgent,
            }),
          });
        }
        setState((prev) => ({ ...prev, subscription: existing }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Failed to initialize push",
        }));
      }
    })();
  }, []);

  const enable = useCallback(async () => {
    if (!isPushSupported()) {
      setState((prev) => ({ ...prev, error: "Push not supported" }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          permission,
          error: "Notifications permission not granted",
        }));
        return;
      }

      const registration = await registerServiceWorker();
      const keyRes = await fetch("/api/notifications/vapid");
      if (!keyRes.ok) {
        const err = await keyRes.json();
        throw new Error(err.error ?? "VAPID key unavailable");
      }
      const publicKey = await keyRes.json();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey.key),
      });

      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          user_agent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save subscription");
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        permission,
        subscription,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to enable notifications",
      }));
    }
  }, []);

  const disable = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await fetch("/api/notifications/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        subscription: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to disable notifications",
      }));
    }
  }, []);

  return {
    ...state,
    enable,
    disable,
  };
}
