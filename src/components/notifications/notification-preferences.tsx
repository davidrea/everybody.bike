"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { usePushSubscription } from "@/hooks/use-push";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export function NotificationPreferences() {
  const push = usePushSubscription();
  const prefs = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const permissionLabel = useMemo(() => {
    if (!push.supported) return "Unsupported";
    if (push.permission === "unsupported") return "Unsupported";
    if (push.permission === "granted") return "Enabled";
    if (push.permission === "denied") return "Blocked";
    return "Not enabled";
  }, [push.permission, push.supported]);

  const subscriptionLabel = useMemo(() => {
    if (!push.supported) return "This device does not support push notifications.";
    if (push.permission === "denied") return "Notifications are blocked in your browser settings.";
    if (push.subscription) return "Push notifications are active on this device.";
    if (push.permission === "granted") return "Enable push notifications to receive updates.";
    return "Enable notifications to stay up to date.";
  }, [push.permission, push.subscription, push.supported]);

  async function handleToggle(key: keyof NonNullable<typeof prefs.data>, value: boolean) {
    try {
      await updatePrefs.mutateAsync({ [key]: value });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update preferences");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Push Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Device status</p>
              <p className="text-xs text-muted-foreground">{subscriptionLabel}</p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {permissionLabel}
            </span>
          </div>

          {push.error && (
            <p className="text-sm text-destructive">{push.error}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => push.enable().catch(() => undefined)}
              disabled={!push.supported || push.permission === "denied" || push.isLoading}
            >
              {push.isLoading ? "Working..." : "Enable Notifications"}
            </Button>
            {push.subscription && (
              <Button
                variant="outline"
                onClick={() => push.disable().catch(() => undefined)}
                disabled={push.isLoading}
              >
                Disable on This Device
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {prefs.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : prefs.data ? (
            <div className="space-y-4">
              {(
                [
                  { key: "new_event", label: "New events" },
                  { key: "rsvp_reminder", label: "RSVP reminders" },
                  { key: "event_update", label: "Event updates" },
                  { key: "custom_message", label: "Custom admin messages" },
                ] as const
              ).map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <Label className="text-sm font-medium">{item.label}</Label>
                  <Switch
                    checked={prefs.data[item.key]}
                    onCheckedChange={(value) => handleToggle(item.key, value)}
                    disabled={updatePrefs.isPending}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Preferences unavailable.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
