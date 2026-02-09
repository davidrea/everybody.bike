"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useMyRiders } from "@/hooks/use-my-riders";
import { useMyRollModelGroupIds } from "@/hooks/use-my-roll-model-groups";
import { useClearRsvp, useMyRsvps, useSubmitRsvp } from "@/hooks/use-rsvp";
import { RsvpButtonGroup } from "./rsvp-button-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
  const clearRsvp = useClearRsvp();

  const canSelfRsvp =
    hasRole("roll_model") ||
    hasRole("rider") ||
    hasRole("admin") ||
    hasRole("super_admin");
  const isRollModel = hasRole("roll_model");
  const { data: myRollModelGroupIds, isLoading: rollModelGroupsLoading } =
    useMyRollModelGroupIds(user?.id, isRollModel);
  const isParent = hasRole("parent");
  const eventGroups = event.event_groups
    .map((entry) => entry.groups)
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const coachedGroupIdSet = new Set(myRollModelGroupIds ?? []);
  const availableEventGroups = isRollModel
    ? eventGroups.filter((group) => coachedGroupIdSet.has(group.id))
    : eventGroups;

  const unassignedGroupOption = "__unassigned__";
  const [assignedGroupByEvent, setAssignedGroupByEvent] = useState<
    Record<string, string>
  >({});
  const assignedGroupIdRaw =
    assignedGroupByEvent[eventId] ??
    myRsvps?.selfRsvp?.assigned_group_id ??
    unassignedGroupOption;
  const assignedGroupId =
    assignedGroupIdRaw === unassignedGroupOption ||
    availableEventGroups.some((group) => group.id === assignedGroupIdRaw)
      ? assignedGroupIdRaw
      : unassignedGroupOption;

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

  async function handleClearSelfRsvp() {
    try {
      await clearRsvp.mutateAsync({ event_id: eventId });
      setAssignedGroupByEvent((previous) => ({
        ...previous,
        [eventId]: unassignedGroupOption,
      }));
      toast.success("RSVP cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear RSVP");
    }
  }

  function isRsvpStatus(value: string): value is RsvpStatus {
    return value === "yes" || value === "maybe" || value === "no";
  }

  async function handleAssignedGroupChange(value: string) {
    setAssignedGroupByEvent((previous) => ({
      ...previous,
      [eventId]: value,
    }));

    const selfStatus = myRsvps?.selfRsvp?.status;
    if (!selfStatus || !isRsvpStatus(selfStatus)) {
      return;
    }

    const nextAssignedGroupId =
      value === unassignedGroupOption ? null : value;
    const currentAssignedGroupId = myRsvps.selfRsvp?.assigned_group_id ?? null;

    if (nextAssignedGroupId === currentAssignedGroupId) {
      return;
    }

    try {
      await submitRsvp.mutateAsync({
        event_id: eventId,
        status: selfStatus,
        assigned_group_id: nextAssignedGroupId,
      });
      toast.success("Assigned group updated");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update assigned group",
      );
    }
  }

  if (rsvpLoading || ridersLoading || (isRollModel && rollModelGroupsLoading)) {
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
          <div className="flex items-center gap-2">
            <RsvpButtonGroup
              currentStatus={(myRsvps?.selfRsvp?.status as RsvpStatus) ?? null}
              onSelect={(status) => handleRsvp(status)}
              disabled={submitRsvp.isPending || clearRsvp.isPending}
            />
            {myRsvps?.selfRsvp && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground"
                onClick={() => {
                  void handleClearSelfRsvp();
                }}
                disabled={submitRsvp.isPending || clearRsvp.isPending}
              >
                Clear
              </Button>
            )}
          </div>
          {isRollModel && (
            <div className="space-y-1 pt-1">
              <p className="text-xs text-muted-foreground">
                Assigned coaching group (optional)
              </p>
              <Select
                value={assignedGroupId}
                onValueChange={(value) => {
                  void handleAssignedGroupChange(value);
                }}
                disabled={submitRsvp.isPending || clearRsvp.isPending}
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
              {availableEventGroups.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  You are not assigned to coach any groups for this event.
                </p>
              )}
              {!myRsvps?.selfRsvp?.status && (
                <p className="text-xs text-muted-foreground">
                  Pick Yes/Maybe/No once to save group assignment.
                </p>
              )}
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
              (r) => r.rider_id === rider.rider_id,
            );
            return (
              <div
                key={rider.rider_id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm">
                  {rider.first_name} {rider.last_name}
                </span>
                <div className="flex items-center gap-2">
                  <RsvpButtonGroup
                    currentStatus={
                      (riderRsvp?.status as RsvpStatus) ?? null
                    }
                    onSelect={(status) => handleRsvp(status, rider.rider_id)}
                    disabled={submitRsvp.isPending || clearRsvp.isPending}
                  />
                  {riderRsvp && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-muted-foreground"
                      onClick={() => {
                        clearRsvp.mutate(
                          { event_id: eventId, rider_id: rider.rider_id },
                          {
                            onSuccess: () => toast.success("RSVP cleared"),
                            onError: (err) =>
                              toast.error(
                                err instanceof Error
                                  ? err.message
                                  : "Failed to clear RSVP",
                              ),
                          },
                        );
                      }}
                      disabled={submitRsvp.isPending || clearRsvp.isPending}
                    >
                      Clear
                    </Button>
                  )}
                </div>
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
