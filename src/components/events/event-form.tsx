"use client";

import { useForm } from "react-hook-form";
import { formResolver } from "@/lib/utils";
import { eventSchema, type EventFormValues } from "@/lib/validators";
import { EVENT_TYPES, type EventWithGroups, type Group } from "@/types";
import { useGroups } from "@/hooks/use-groups";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const typeLabels: Record<string, string> = {
  ride: "Ride",
  clinic: "Clinic",
  social: "Social",
  meeting: "Meeting",
  other: "Other",
};

interface EventFormProps {
  event?: EventWithGroups | null;
  onSubmit: (values: EventFormValues) => Promise<void>;
  isPending: boolean;
}

export function EventForm({ event, onSubmit, isPending }: EventFormProps) {
  const { data: groups } = useGroups();

  const existingGroupIds =
    event?.event_groups?.map((eg) => eg.group_id) ?? [];

  const form = useForm<EventFormValues>({
    resolver: formResolver(eventSchema),
    defaultValues: {
      title: event?.title ?? "",
      type: (event?.type as EventFormValues["type"]) ?? "ride",
      description: event?.description ?? "",
      location: event?.location ?? "",
      map_url: event?.map_url ?? "",
      starts_at: event?.starts_at
        ? toDatetimeLocal(event.starts_at)
        : "",
      ends_at: event?.ends_at ? toDatetimeLocal(event.ends_at) : "",
      rsvp_deadline: event?.rsvp_deadline
        ? toDatetimeLocal(event.rsvp_deadline)
        : "",
      capacity: event?.capacity ?? "",
      weather_notes: event?.weather_notes ?? "",
      group_ids: existingGroupIds,
      send_announcement_notification: true,
      send_default_reminder_notifications: true,
      is_recurring: !!event?.recurrence_rule,
      recurrence_rule: event?.recurrence_rule ?? "",
    },
  });

  const isRecurring = form.watch("is_recurring");

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Tuesday Night Ride" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {typeLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="capacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Capacity (optional)</FormLabel>
                <FormControl>
                  <Input type="number" min={1} placeholder="Unlimited" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="starts_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date & Time</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ends_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date & Time (optional)</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="rsvp_deadline"
          render={({ field }) => (
            <FormItem>
              <FormLabel>RSVP Deadline (optional)</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="Trailhead parking lot" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="map_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Map URL (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="https://maps.google.com/..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder="Event details..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="weather_notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Weather Notes (optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Rain or shine! Dress in layers."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Groups */}
        <FormField
          control={form.control}
          name="group_ids"
          render={() => (
            <FormItem>
              <FormLabel>Groups</FormLabel>
              <div className="space-y-2">
                {groups?.map((g: Group) => (
                  <FormField
                    key={g.id}
                    control={form.control}
                    name="group_ids"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(g.id)}
                            onCheckedChange={(checked) => {
                              const current = field.value ?? [];
                              field.onChange(
                                checked
                                  ? [...current, g.id]
                                  : current.filter((id) => id !== g.id),
                              );
                            }}
                          />
                        </FormControl>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: g.color }}
                          />
                          <Label className="font-normal">{g.name}</Label>
                        </div>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave all unchecked to make this a Roll Model/Admin-only event.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Recurrence (only for new events) */}
        {!event && (
          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="font-medium">Default notifications</h3>

            <FormField
              control={form.control}
              name="send_announcement_notification"
              render={({ field }) => (
                <FormItem className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="space-y-1">
                    <FormLabel className="text-sm font-medium">
                      Send immediate announcement
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Queue a new event announcement right after this event is created.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="send_default_reminder_notifications"
              render={({ field }) => (
                <FormItem className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div className="space-y-1">
                    <FormLabel className="text-sm font-medium">
                      Send default reminders
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Queue the default reminder cadence for this event.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        {!event && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={isRecurring}
                onCheckedChange={(checked) =>
                  form.setValue("is_recurring", checked)
                }
              />
              <Label>Recurring event</Label>
            </div>

            {isRecurring && (
              <FormField
                control={form.control}
                name="recurrence_rule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recurrence Rule (RRULE)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="FREQ=WEEKLY;BYDAY=TU;COUNT=20"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Use RRULE format. E.g., &quot;FREQ=WEEKLY;BYDAY=TU&quot; for every
                      Tuesday, &quot;FREQ=WEEKLY;INTERVAL=2;COUNT=10&quot; for biweekly.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Saving..."
              : event
                ? "Update Event"
                : "Create Event"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
