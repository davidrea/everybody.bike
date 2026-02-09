"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { EventForm } from "@/components/events/event-form";
import { useCreateEvent } from "@/hooks/use-events";
import type { EventFormValues } from "@/lib/validators";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewEventPage() {
  const router = useRouter();
  const createEvent = useCreateEvent();

  async function handleSubmit(values: EventFormValues) {
    try {
      await createEvent.mutateAsync(values);
      toast.success("Event created");
      router.push("/events");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create event");
      throw err;
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <Link
            href="/events"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All Events
          </Link>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Create Event
          </h1>
        </div>
        <EventForm onSubmit={handleSubmit} isPending={createEvent.isPending} />
      </div>
    </AppShell>
  );
}
