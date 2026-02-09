import { AppShell } from "@/components/layout/app-shell";

export default function NotificationsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">Push notification preferences and history</p>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-muted-foreground">
          Notification management will be here — coming in Phase 3.
        </div>
      </div>
    </AppShell>
  );
}
