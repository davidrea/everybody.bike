"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMyRiders } from "@/hooks/use-my-riders";
import { useMyRsvps, useSubmitRsvp } from "@/hooks/use-rsvp";
import { RsvpButtonGroup } from "./rsvp-button-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventWithGroups, RsvpStatus } from "@/types";

interface RsvpControlsProps {
  eventId: string;
  event: EventWithGroups;
}

export function RsvpControls({ eventId, event }: RsvpControlsProps) {
  const { user, profile, hasRole } = useAuth();
  const { data: myRsvps, isLoading: rsvpLoading } = useMyRsvps(
    eventId,
    user?.id,
  );
  const { data: myRiders, isLoading: ridersLoading } = useMyRiders(user?.id);
  const submitRsvp = useSubmitRsvp();

  const canSelfRsvp =
    hasRole("roll_model") ||
    hasRole("rider") ||
    hasRole("admin") ||
    hasRole("super_admin");
  const isRollModel = hasRole("roll_model");
  const isParent = hasRole("parent");
  const availableEventGroups = event.event_groups
    .map((entry) => entry.groups)
    .filter((group): group is NonNullable<typeof group> => Boolean(group));

  const unassignedGroupOption = "__unassigned__";
  const [assignedGroupByEvent, setAssignedGroupByEvent] = useState<
    Record<string, string>
  >({});
  const assignedGroupId =
    assignedGroupByEvent[eventId] ??
    myRsvps?.selfRsvp?.assigned_group_id ??
    unassignedGroupOption;

  const isPastDeadline = event.rsvp_deadline
    ? new Date() > new Date(event.rsvp_deadline)
    : new Date() > new Date(event.starts_at);

  async function handleRsvp(status: RsvpStatus, riderId?: string | null) {
    const isSelfRsvp = !riderId;
    try {
      await submitRsvp.mutateAsync({
        event_id: eventId,
        status,
        rider_id: riderId,
        assigned_group_id:
          isSelfRsvp && isRollModel
            ? (assignedGroupId === unassignedGroupOption
                ? null
                : assignedGroupId)
            : undefined,
      });
      toast.success("RSVP updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update RSVP");
    }
  }

  if (rsvpLoading || ridersLoading) {
    return <Skeleton className="h-20" />;
  }

  if (!profile) return null;

  if (isPastDeadline) {
    return (
      <p className="text-sm text-muted-foreground">
        RSVP deadline has passed.
        {myRsvps?.selfRsvp && (
          <span className="ml-1">
            Your RSVP: <strong className="capitalize">{myRsvps.selfRsvp.status}</strong>
          </span>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Self-RSVP */}
      {canSelfRsvp && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Your RSVP</p>
          <RsvpButtonGroup
            currentStatus={(myRsvps?.selfRsvp?.status as RsvpStatus) ?? null}
            onSelect={(status) => handleRsvp(status)}
            disabled={submitRsvp.isPending}
          />
          {isRollModel && availableEventGroups.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs text-muted-foreground">
                Assigned coaching group (optional)
              </p>
              <Select
                value={assignedGroupId}
                onValueChange={(value) =>
                  setAssignedGroupByEvent((previous) => ({
                    ...previous,
                    [eventId]: value,
                  }))
                }
                disabled={submitRsvp.isPending}
              >
                <SelectTrigger className="w-full sm:w-[280px]">
                  <SelectValue placeholder="Select an assigned group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={unassignedGroupOption}>
                    Unassigned (Trailhead / Support)
                  </SelectItem>
                  {availableEventGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Parent RSVP for children */}
      {isParent && myRiders && myRiders.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Your Riders&apos; RSVPs</p>
          {myRiders.map((rider) => {
            // Find existing RSVP for this rider (could be from any parent)
            const riderRsvp = myRsvps?.minorRsvps?.find(
              (r) => r.rider_id === rider.id,
            );
            return (
              <div
                key={rider.id}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-sm">
                  {rider.first_name} {rider.last_name}
                </span>
                <RsvpButtonGroup
                  currentStatus={
                    (riderRsvp?.status as RsvpStatus) ?? null
                  }
                  onSelect={(status) => handleRsvp(status, rider.id)}
                  disabled={submitRsvp.isPending}
                />
              </div>
            );
          })}
        </div>
      )}

      {!canSelfRsvp && !isParent && (
        <p className="text-sm text-muted-foreground">
          You don&apos;t have a role that requires RSVP for this event.
        </p>
      )}
    </div>
  );
}
