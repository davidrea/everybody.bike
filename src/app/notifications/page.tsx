import { AppShell } from "@/components/layout/app-shell";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";

export default function NotificationsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">Manage your push notifications</p>
        </div>
        <NotificationPreferences />
      </div>
    </AppShell>
  );
}
