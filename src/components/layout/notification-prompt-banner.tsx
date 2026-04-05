"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/use-push";

const STORAGE_KEY = "notification-prompt-dismissed-at";
const SNOOZE_DAYS = 7;

export function NotificationPromptBanner() {
  const push = usePushSubscription();
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setDismissedAt(stored ? Number(stored) : null);
    setReady(true);
  }, []);

  const shouldShow = useMemo(() => {
    if (!ready) return false;
    if (!push.supported) return false;
    // Already subscribed — no need to prompt
    if (push.subscription) return false;
    // Explicitly denied in browser — can't prompt anyway
    if (push.permission === "denied") return false;
    // Snoozed — re-show after SNOOZE_DAYS
    if (dismissedAt) {
      const elapsed = Date.now() - dismissedAt;
      if (elapsed < SNOOZE_DAYS * 24 * 60 * 60 * 1000) return false;
    }
    return true;
  }, [ready, push.supported, push.subscription, push.permission, dismissedAt]);

  function handleDismiss() {
    const now = Date.now();
    setDismissedAt(now);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      // Ignore storage errors.
    }
  }

  async function handleEnable() {
    await push.enable();
    // If successful, banner hides via shouldShow (subscription becomes non-null).
    // If permission denied, banner also hides (permission becomes "denied").
  }

  if (!shouldShow) return null;

  return (
    <div className="border-b bg-primary/5 px-4 py-3 text-foreground backdrop-blur dark:bg-primary/10">
      <div className="mx-auto flex w-full max-w-4xl items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-semibold">Stay in the loop</p>
          <p className="text-xs text-muted-foreground">
            Get notified about new events, RSVP reminders, and schedule changes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleEnable}
            disabled={push.isLoading}
          >
            {push.isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Enable
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {push.error && (
        <div className="mx-auto mt-2 max-w-4xl">
          <p className="text-xs text-destructive">{push.error}</p>
        </div>
      )}
    </div>
  );
}
