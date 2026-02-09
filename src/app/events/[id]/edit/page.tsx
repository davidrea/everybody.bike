"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { EventForm } from "@/components/events/event-form";
import { useEvent, useUpdateEvent } from "@/hooks/use-events";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { EventFormValues } from "@/lib/validators";
import { useState } from "react";
import { RecurringEditDialog } from "@/components/events/recurring-edit-dialog";

export default function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: event, isLoading } = useEvent(id);
  const updateEvent = useUpdateEvent();
  const router = useRouter();
  const [pendingValues, setPendingValues] = useState<EventFormValues | null>(null);

  async function handleSubmit(values: EventFormValues) {
    if (event?.recurrence_rule) {
      // Show dialog to choose single vs series
      setPendingValues(values);
      return;
    }
    await doUpdate(values, "single");
  }

  async function doUpdate(values: EventFormValues, editMode: "single" | "series") {
    try {
      await updateEvent.mutateAsync({ id, values, editMode });
      toast.success(
        editMode === "series" ? "Series updated" : "Event updated",
      );
      router.push(`/events/${id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update event",
      );
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-96" />
      </AppShell>
    );
  }

  if (!event) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Event not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <Link
            href={`/events/${id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to event
          </Link>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Edit Event
          </h1>
        </div>
        <EventForm
          event={event}
          onSubmit={handleSubmit}
          isPending={updateEvent.isPending}
        />
      </div>

      {pendingValues && (
        <RecurringEditDialog
          open={!!pendingValues}
          onOpenChange={(open) => !open && setPendingValues(null)}
          action="edit"
          onSingle={() => {
            doUpdate(pendingValues, "single");
            setPendingValues(null);
          }}
          onSeries={() => {
            doUpdate(pendingValues, "series");
            setPendingValues(null);
          }}
        />
      )}
    </AppShell>
  );
}
