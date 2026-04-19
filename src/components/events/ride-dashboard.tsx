"use client";

import { X, Users, Bike } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SafetyIndicators } from "@/components/safety/safety-indicators";
import { DashboardRatioIndicator } from "@/components/events/dashboard-ratio-indicator";
import { useEventDashboard } from "@/hooks/use-event-dashboard";
import { useMyRsvps } from "@/hooks/use-rsvp";
import { useMyRollModelGroupIds } from "@/hooks/use-my-roll-model-groups";
import { getAgeFromDob } from "@/lib/age";
import type { EventWithGroups, Profile, DashboardRiderEntry, DashboardRollModel } from "@/types";

interface RideDashboardProps {
  event: EventWithGroups;
  profile: Profile;
  onClose: () => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function RiderRow({ rider }: { rider: DashboardRiderEntry }) {
  const age = rider.is_minor ? getAgeFromDob(rider.date_of_birth) : null;
  return (
    <li className="flex items-center gap-2 py-0.5">
      <span className="flex-1 text-sm">
        {rider.name}
        {age !== null && (
          <span className="ml-1 text-xs text-muted-foreground">· {age}y</span>
        )}
      </span>
      <SafetyIndicators
        medicalAlerts={rider.medical_alerts}
        mediaOptOut={rider.media_opt_out}
      />
    </li>
  );
}

function RollModelRow({ rm, isSelf }: { rm: DashboardRollModel; isSelf: boolean }) {
  return (
    <li className="flex items-center gap-2 py-0.5">
      <span className="flex-1 text-sm">
        {rm.full_name}
        {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
      </span>
      <SafetyIndicators
        medicalAlerts={rm.medical_alerts}
        mediaOptOut={rm.media_opt_out}
      />
    </li>
  );
}

export function RideDashboard({ event, profile, onClose }: RideDashboardProps) {
  const { data: dashboard, isLoading } = useEventDashboard(event.id);
  const { data: myRsvp } = useMyRsvps(event.id, profile.id);
  const { data: defaultGroupIds } = useMyRollModelGroupIds(profile.id);

  // Resolve which group this RM is assigned to for this ride
  const assignedGroupId: string | null =
    myRsvp?.selfRsvp?.assigned_group_id ??
    (defaultGroupIds?.[0] ?? null);

  const assignedGroupEntry = dashboard?.riders_by_group.find(
    (g) => g.group.id === assignedGroupId,
  );

  const allRMs = [
    ...(dashboard?.roll_models.confirmed ?? []),
    ...(dashboard?.roll_models.maybe ?? []),
  ];

  // RMs in the same group (excluding self)
  const fellowRMs = assignedGroupId
    ? allRMs.filter(
        (rm) => rm.assigned_group_id === assignedGroupId && rm.id !== profile.id,
      )
    : [];

  // Self in RM list (to show in header area)
  const selfRM = allRMs.find((rm) => rm.id === profile.id);

  const startsAt = formatTime(event.starts_at);
  const endsAt = event.ends_at ? ` – ${formatTime(event.ends_at)}` : "";
  const isInProgress = new Date() >= new Date(event.starts_at);

  const groupName =
    assignedGroupEntry?.group.name ??
    (assignedGroupId ? "Your Group" : null);

  return (
    <Card className="border-primary/40 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Bike className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">{event.title}</CardTitle>
              <Badge variant={isInProgress ? "default" : "secondary"} className="text-xs">
                {isInProgress ? "In Progress" : "Starting Soon"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {startsAt}{endsAt}
              {groupName && (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">{groupName}</span>
                </>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onClose}
            aria-label="Hide Ride Dashboard"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !assignedGroupId ? (
          <p className="text-sm text-muted-foreground">
            No group assigned yet — ask an admin to assign you for this ride.
          </p>
        ) : (
          <>
            {/* Ratio */}
            {assignedGroupEntry && (
              <DashboardRatioIndicator
                ratio={assignedGroupEntry.coach_rider_ratio}
                confirmedRollModels={assignedGroupEntry.coach_counts.confirmed}
                confirmedRiders={assignedGroupEntry.confirmed.length}
              />
            )}

            <Separator />

            {/* Roll Models in group */}
            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                Roll Models in {groupName}
              </h3>
              <ul className="space-y-0.5">
                {selfRM && <RollModelRow rm={selfRM} isSelf />}
                {fellowRMs.length > 0
                  ? fellowRMs.map((rm) => (
                      <RollModelRow key={rm.id} rm={rm} isSelf={false} />
                    ))
                  : !selfRM && (
                      <li className="text-sm text-muted-foreground">No roll models assigned</li>
                    )}
                {fellowRMs.length === 0 && selfRM && (
                  <li className="text-xs text-muted-foreground">No other roll models in this group</li>
                )}
              </ul>
            </section>

            <Separator />

            {/* Riders by RSVP status (exclude "no") */}
            {assignedGroupEntry ? (
              <section className="space-y-3">
                {(
                  [
                    {
                      label: "Coming",
                      riders: assignedGroupEntry.confirmed,
                      variant: "default" as const,
                    },
                    {
                      label: "Maybe",
                      riders: assignedGroupEntry.maybe,
                      variant: "secondary" as const,
                    },
                    {
                      label: "Not responded",
                      riders: assignedGroupEntry.not_responded,
                      variant: "outline" as const,
                    },
                  ] satisfies { label: string; riders: DashboardRiderEntry[]; variant: "default" | "secondary" | "outline" }[]
                ).map(({ label, riders, variant }) =>
                  riders.length > 0 ? (
                    <div key={label}>
                      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Badge variant={variant} className="text-xs">
                          {label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {riders.length}
                        </span>
                      </h4>
                      <ul className="divide-y divide-border">
                        {riders.map((rider) => (
                          <RiderRow key={rider.id} rider={rider} />
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
                {assignedGroupEntry.confirmed.length === 0 &&
                  assignedGroupEntry.maybe.length === 0 &&
                  assignedGroupEntry.not_responded.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No riders in this group yet.
                    </p>
                  )}
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">
                No riders found for this group.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
