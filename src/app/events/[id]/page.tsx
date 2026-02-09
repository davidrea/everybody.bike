import { AppShell } from "@/components/layout/app-shell";
import { EventDetail } from "@/components/events/event-detail";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell>
      <EventDetail eventId={id} />
    </AppShell>
  );
}
