import { AppShell } from "@/components/layout/app-shell";
import { EventReport } from "@/components/events/event-report";

export default async function EventReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell>
      <EventReport eventId={id} />
    </AppShell>
  );
}
