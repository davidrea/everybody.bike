import { AppShell } from "@/components/layout/app-shell";
import { NotificationScheduler } from "@/components/admin/notifications/notification-scheduler";

export default function AdminNotificationsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Notifications
          </h1>
          <p className="text-muted-foreground">
            Schedule and manage push notifications
          </p>
        </div>
        <NotificationScheduler />
      </div>
    </AppShell>
  );
}
