"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useEventDashboard } from "@/hooks/use-event-dashboard";
import { useSubmitRsvp, useClearRsvp } from "@/hooks/use-rsvp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardRatioIndicator } from "./dashboard-ratio-indicator";
import { DashboardGroupSection } from "./dashboard-group-section";
import { ParentDashboard } from "./parent-dashboard";
import { SafetyIndicators } from "@/components/safety/safety-indicators";
import type { Group, RsvpStatus, DashboardRollModel } from "@/types";

export function EventDashboard({ eventId }: { eventId: string }) {
  const { hasRole, isAdmin } = useAuth();
  const { data: dashboard, isLoading } = useEventDashboard(eventId);
  const submitRsvp = useSubmitRsvp();
  const clearRsvp = useClearRsvp();

  const isParentOnly =
    hasRole("parent") &&
    !hasRole("roll_model") &&
    !hasRole("rider") &&
    !isAdmin();

  const isEventPast = dashboard?.event?.starts_at
    ? new Date(dashboard.event.starts_at) < new Date()
    : false;
  const adminMode = isAdmin() && !isEventPast;
  const eventGroups = dashboard?.event?.event_groups
    ?.map((entry) => entry.groups)
    .filter((group): group is Group => Boolean(group)) ?? [];

  function handleAdminRiderRsvp(
    riderId: string,
    isMinor: boolean,
    status: RsvpStatus,
  ) {
    if (isMinor) {
      submitRsvp.mutate(
        { event_id: eventId, status, rider_id: riderId, on_behalf_of: riderId },
        {
          onSuccess: () => toast.success("RSVP updated"),
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : "Failed to update RSVP"),
        },
      );
    } else {
      submitRsvp.mutate(
        { event_id: eventId, status, on_behalf_of: riderId },
        {
          onSuccess: () => toast.success("RSVP updated"),
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : "Failed to update RSVP"),
        },
      );
    }
  }

  function handleAdminRollModelRsvp(
    rollModelId: string,
    status: RsvpStatus,
    assignedGroupId: string | null,
  ) {
    submitRsvp.mutate(
      {
        event_id: eventId,
        status,
        on_behalf_of: rollModelId,
        assigned_group_id: assignedGroupId,
      },
      {
        onSuccess: () => toast.success("RSVP updated"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to update RSVP"),
      },
    );
  }

  function handleAdminClearRiderRsvp(riderId: string, isMinor: boolean) {
    clearRsvp.mutate(
      isMinor
        ? { event_id: eventId, rider_id: riderId, on_behalf_of: riderId }
        : { event_id: eventId, on_behalf_of: riderId },
      {
        onSuccess: () => toast.success("RSVP cleared"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to clear RSVP"),
      },
    );
  }

  function handleAdminClearRollModelRsvp(rollModelId: string) {
    clearRsvp.mutate(
      { event_id: eventId, on_behalf_of: rollModelId },
      {
        onSuccess: () => toast.success("RSVP cleared"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to clear RSVP"),
      },
    );
  }

  if (isLoading) {
    return <Skeleton className="h-48" />;
  }

  if (!dashboard) return null;

  // Parents see a simplified dashboard
  if (isParentOnly) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Event Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ParentDashboard
            eventId={eventId}
            confirmedCount={dashboard.counts.confirmed_riders}
            totalCount={dashboard.counts.total_riders}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-lg">Event Dashboard</CardTitle>
        {isEventPast && isAdmin() && (
          <p className="text-xs text-muted-foreground">
            Admin RSVP overrides are disabled for past events.
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Roll Models: </span>
            <span className="font-medium">
              {dashboard.counts.confirmed_roll_models}/
              {dashboard.counts.total_roll_models}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Riders: </span>
            <span className="font-medium">
              {dashboard.counts.confirmed_riders}/
              {dashboard.counts.total_riders}
            </span>
          </div>
          <DashboardRatioIndicator
            ratio={dashboard.ratio}
            confirmedRollModels={dashboard.counts.confirmed_roll_models}
            confirmedRiders={dashboard.counts.confirmed_riders}
          />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <div className="-mx-1 overflow-x-auto px-1 no-scrollbar">
            <TabsList className="min-w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="roll_models">
                Roll Models
                <Badge variant="secondary" className="ml-1.5">
                  {dashboard.counts.confirmed_roll_models}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="riders">
                Riders
                <Badge variant="secondary" className="ml-1.5">
                  {dashboard.counts.confirmed_riders}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4 pt-4">
            {/* Roll Models Summary */}
            <div className="rounded-lg border p-4">
              <p className="mb-2 text-sm font-medium">Roll Models</p>
              <div className="flex flex-wrap gap-1">
                {dashboard.roll_models.confirmed.map((rm) =>
                  adminMode ? (
                    <RollModelRsvpBadge
                      key={rm.id}
                      rollModel={rm}
                      eventGroups={eventGroups}
                      currentStatus="yes"
                      variant="confirmed"
                      onSelect={(status, assignedGroupId) =>
                        handleAdminRollModelRsvp(rm.id, status, assignedGroupId)}
                      onClear={() => handleAdminClearRollModelRsvp(rm.id)}
                    />
                  ) : (
                    <Badge key={rm.id} className="bg-green-600 text-white">
                      {formatRollModelLabel(rm)}
                      <SafetyIndicators
                        medicalAlerts={rm.medical_alerts}
                        mediaOptOut={rm.media_opt_out}
                        iconClassName="h-3 w-3"
                      />
                    </Badge>
                  ),
                )}
                {dashboard.roll_models.maybe.map((rm) =>
                  adminMode ? (
                    <RollModelRsvpBadge
                      key={rm.id}
                      rollModel={rm}
                      eventGroups={eventGroups}
                      currentStatus="maybe"
                      variant="maybe"
                      onSelect={(status, assignedGroupId) =>
                        handleAdminRollModelRsvp(rm.id, status, assignedGroupId)}
                      onClear={() => handleAdminClearRollModelRsvp(rm.id)}
                    />
                  ) : (
                    <Badge
                      key={rm.id}
                      variant="outline"
                      className="border-amber-500 text-amber-700 dark:text-amber-400"
                    >
                      {formatRollModelLabel(rm)} (maybe)
                      <SafetyIndicators
                        medicalAlerts={rm.medical_alerts}
                        mediaOptOut={rm.media_opt_out}
                        iconClassName="h-3 w-3"
                      />
                    </Badge>
                  ),
                )}
                {dashboard.roll_models.no.map((rm) =>
                  adminMode ? (
                    <RollModelRsvpBadge
                      key={rm.id}
                      rollModel={rm}
                      eventGroups={eventGroups}
                      currentStatus="no"
                      variant="no"
                      onSelect={(status, assignedGroupId) =>
                        handleAdminRollModelRsvp(rm.id, status, assignedGroupId)}
                      onClear={() => handleAdminClearRollModelRsvp(rm.id)}
                    />
                  ) : (
                    <Badge key={rm.id} className="bg-red-600 text-white">
                      {formatRollModelLabel(rm)} (no)
                      <SafetyIndicators
                        medicalAlerts={rm.medical_alerts}
                        mediaOptOut={rm.media_opt_out}
                        iconClassName="h-3 w-3"
                      />
                    </Badge>
                  ),
                )}
              </div>
              {dashboard.roll_models.confirmed_unassigned.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {dashboard.roll_models.confirmed_unassigned.length} confirmed unassigned
                  (trailhead/support coverage)
                </p>
              )}
              {dashboard.roll_models.not_responded.length > 0 && (
                <div className="mt-2">
                  {adminMode ? (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground mr-1 self-center">
                        Not responded:
                      </span>
                      {dashboard.roll_models.not_responded.map((rm) => (
                        <RollModelRsvpBadge
                          key={rm.id}
                          rollModel={rm}
                          eventGroups={eventGroups}
                          variant="not_responded"
                          onSelect={(status, assignedGroupId) =>
                            handleAdminRollModelRsvp(rm.id, status, assignedGroupId)}
                          onClear={() => handleAdminClearRollModelRsvp(rm.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {dashboard.roll_models.not_responded.length} not yet responded
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Riders by Group Summary */}
            {dashboard.riders_by_group.map((g) => (
              <DashboardGroupSection
                key={g.group.id}
                groupName={g.group.name}
                groupColor={g.group.color}
                confirmed={g.confirmed}
                maybe={g.maybe}
                no={g.no}
                notResponded={g.not_responded}
                confirmedCoachCount={g.coach_counts.confirmed}
                maybeCoachCount={g.coach_counts.maybe}
                coachRiderRatio={g.coach_rider_ratio}
                assignedConfirmedCoaches={g.coaches.confirmed}
                assignedMaybeCoaches={g.coaches.maybe}
                assignedNoCoaches={g.coaches.no}
                onAdminRsvp={adminMode ? handleAdminRiderRsvp : undefined}
                onAdminClearRsvp={adminMode ? handleAdminClearRiderRsvp : undefined}
              />
            ))}
          </TabsContent>

          <TabsContent value="roll_models" className="space-y-4 pt-4">
            <StatusSection
              label="Confirmed"
              items={dashboard.roll_models.confirmed}
              color="text-green-600 dark:text-green-400"
              currentStatus="yes"
              adminMode={adminMode}
              eventGroups={eventGroups}
              onAdminRsvp={handleAdminRollModelRsvp}
              onAdminClear={handleAdminClearRollModelRsvp}
            />
            <StatusSection
              label="Maybe"
              items={dashboard.roll_models.maybe}
              color="text-amber-600 dark:text-amber-400"
              currentStatus="maybe"
              adminMode={adminMode}
              eventGroups={eventGroups}
              onAdminRsvp={handleAdminRollModelRsvp}
              onAdminClear={handleAdminClearRollModelRsvp}
            />
            <StatusSection
              label="No"
              items={dashboard.roll_models.no}
              color="text-red-600 dark:text-red-400"
              currentStatus="no"
              adminMode={adminMode}
              eventGroups={eventGroups}
              onAdminRsvp={handleAdminRollModelRsvp}
              onAdminClear={handleAdminClearRollModelRsvp}
            />
            <StatusSection
              label="No Response"
              items={dashboard.roll_models.not_responded}
              color="text-muted-foreground"
              adminMode={adminMode}
              eventGroups={eventGroups}
              onAdminRsvp={handleAdminRollModelRsvp}
              onAdminClear={handleAdminClearRollModelRsvp}
            />
          </TabsContent>

          <TabsContent value="riders" className="space-y-4 pt-4">
            {dashboard.riders_by_group.map((g) => (
              <DashboardGroupSection
                key={g.group.id}
                groupName={g.group.name}
                groupColor={g.group.color}
                confirmed={g.confirmed}
                maybe={g.maybe}
                no={g.no}
                notResponded={g.not_responded}
                confirmedCoachCount={g.coach_counts.confirmed}
                maybeCoachCount={g.coach_counts.maybe}
                coachRiderRatio={g.coach_rider_ratio}
                assignedConfirmedCoaches={g.coaches.confirmed}
                assignedMaybeCoaches={g.coaches.maybe}
                assignedNoCoaches={g.coaches.no}
                onAdminRsvp={adminMode ? handleAdminRiderRsvp : undefined}
              />
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

const rsvpStatusConfig: { value: RsvpStatus; label: string; className: string }[] = [
  { value: "yes", label: "Yes", className: "bg-green-600 hover:bg-green-700 text-white" },
  { value: "maybe", label: "Maybe", className: "bg-amber-500 hover:bg-amber-600 text-white" },
  { value: "no", label: "No", className: "bg-red-600 hover:bg-red-700 text-white" },
];

function RollModelRsvpBadge({
  rollModel,
  eventGroups,
  currentStatus,
  variant,
  onSelect,
  onClear,
}: {
  rollModel: DashboardRollModel;
  eventGroups: Group[];
  currentStatus?: RsvpStatus;
  variant: "confirmed" | "maybe" | "no" | "not_responded";
  onSelect: (status: RsvpStatus, assignedGroupId: string | null) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unassignedOption = "__unassigned__";
  const [selectedGroupId, setSelectedGroupId] = useState(
    rollModel.assigned_group_id ?? unassignedOption,
  );

  const badgeClass =
    variant === "confirmed"
      ? "bg-green-600 text-white hover:bg-green-700 cursor-pointer"
      : variant === "maybe"
        ? "border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 cursor-pointer"
        : variant === "no"
          ? "bg-red-600 text-white hover:bg-red-700 cursor-pointer"
          : "cursor-pointer hover:bg-muted";

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setSelectedGroupId(rollModel.assigned_group_id ?? unassignedOption);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button type="button">
          <Badge
            variant={variant === "confirmed" ? "default" : "outline"}
            className={badgeClass}
          >
            {formatRollModelLabel(rollModel)}
            {variant === "maybe" ? " (maybe)" : ""}
            <SafetyIndicators
              medicalAlerts={rollModel.medical_alerts}
              mediaOptOut={rollModel.media_opt_out}
              iconClassName="h-3 w-3"
            />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <p className="mb-1 text-xs font-medium">{rollModel.full_name}</p>
        {rollModel.assigned_group_name && (
          <p className="mb-2 text-xs text-muted-foreground">
            Assigned: {rollModel.assigned_group_name}
          </p>
        )}
        <div className="mb-2 space-y-1">
          <p className="text-xs text-muted-foreground">Assigned Group</p>
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={unassignedOption}>
                Unassigned (Trailhead / Support)
              </SelectItem>
              {eventGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1">
          {rsvpStatusConfig.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={currentStatus === s.value ? "default" : "outline"}
              className={currentStatus === s.value ? s.className : "text-xs"}
              onClick={() => {
                onSelect(
                  s.value,
                  selectedGroupId === unassignedOption ? null : selectedGroupId,
                );
                setOpen(false);
              }}
            >
              {s.label}
            </Button>
          ))}
          {onClear && currentStatus && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusSection({
  label,
  items,
  color,
  currentStatus,
  adminMode,
  eventGroups,
  onAdminRsvp,
  onAdminClear,
}: {
  label: string;
  items: DashboardRollModel[];
  color: string;
  currentStatus?: RsvpStatus;
  adminMode: boolean;
  eventGroups: Group[];
  onAdminRsvp: (
    rollModelId: string,
    status: RsvpStatus,
    assignedGroupId: string | null,
  ) => void;
  onAdminClear: (rollModelId: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className={`text-sm font-medium ${color}`}>
        {label} ({items.length})
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((rm) =>
          adminMode ? (
            <RollModelRsvpBadge
              key={rm.id}
              rollModel={rm}
              eventGroups={eventGroups}
              currentStatus={currentStatus}
              variant={
                currentStatus === "yes"
                  ? "confirmed"
                  : currentStatus === "maybe"
                    ? "maybe"
                    : currentStatus === "no"
                      ? "no"
                      : "not_responded"
              }
              onSelect={(status, assignedGroupId) =>
                onAdminRsvp(rm.id, status, assignedGroupId)}
              onClear={() => onAdminClear(rm.id)}
            />
          ) : (
            <span
              key={rm.id}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm"
            >
              {formatRollModelLabel(rm)}
              <SafetyIndicators
                medicalAlerts={rm.medical_alerts}
                mediaOptOut={rm.media_opt_out}
                iconClassName="h-3.5 w-3.5"
              />
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function formatRollModelLabel(rollModel: DashboardRollModel) {
  if (!rollModel.assigned_group_name) {
    return rollModel.full_name;
  }

  return `${rollModel.full_name} • ${rollModel.assigned_group_name}`;
}
