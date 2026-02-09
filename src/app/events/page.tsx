import { AppShell } from "@/components/layout/app-shell";
import { EventList } from "@/components/events/event-list";

export default function EventsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Events</h1>
          <p className="text-muted-foreground">Upcoming rides, clinics, and meetups</p>
        </div>
        <EventList />
      </div>
    </AppShell>
  );
}
