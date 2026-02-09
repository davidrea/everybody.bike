"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { RsvpStatus } from "@/types";

interface RiderEntry {
  id: string;
  name: string;
  is_minor: boolean;
}

interface DashboardGroupSectionProps {
  groupName: string;
  groupColor: string;
  confirmed: RiderEntry[];
  maybe: RiderEntry[];
  no: RiderEntry[];
  notResponded: RiderEntry[];
  confirmedCoachCount: number;
  maybeCoachCount: number;
  coachRiderRatio: number | null;
  onAdminRsvp?: (riderId: string, isMinor: boolean, status: RsvpStatus) => void;
  onAdminClearRsvp?: (riderId: string, isMinor: boolean) => void;
}

export function DashboardGroupSection({
  groupName,
  groupColor,
  confirmed,
  maybe,
  no,
  notResponded,
  confirmedCoachCount,
  maybeCoachCount,
  coachRiderRatio,
  onAdminRsvp,
  onAdminClearRsvp,
}: DashboardGroupSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const total = confirmed.length + maybe.length + no.length + notResponded.length;
  const ratioText = confirmed.length > 0 ? `${confirmedCoachCount}:${confirmed.length}` : "N/A";
  const ratioTone =
    coachRiderRatio === null
      ? "text-muted-foreground"
      : coachRiderRatio >= 1 / 6
        ? "text-green-600 dark:text-green-400"
        : coachRiderRatio >= 1 / 10
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: groupColor }}
        />
        <span className="font-medium">{groupName}</span>
        <Badge variant="secondary" className="ml-auto text-xs">
          {confirmed.length}/{total} confirmed
        </Badge>
        <Badge variant="outline" className={`text-xs ${ratioTone}`}>
          Coach:Rider {ratioText}
        </Badge>
      </button>

      {expanded && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            Coaches assigned: {confirmedCoachCount} confirmed, {maybeCoachCount} maybe
          </p>
          {confirmed.length > 0 && (
            <RiderList
              label="Confirmed"
              items={confirmed}
              color="text-green-600 dark:text-green-400"
              currentStatus="yes"
              onAdminRsvp={onAdminRsvp}
              onAdminClearRsvp={onAdminClearRsvp}
            />
          )}
          {maybe.length > 0 && (
            <RiderList
              label="Maybe"
              items={maybe}
              color="text-amber-600 dark:text-amber-400"
              currentStatus="maybe"
              onAdminRsvp={onAdminRsvp}
              onAdminClearRsvp={onAdminClearRsvp}
            />
          )}
          {no.length > 0 && (
            <RiderList
              label="No"
              items={no}
              color="text-red-600 dark:text-red-400"
              currentStatus="no"
              onAdminRsvp={onAdminRsvp}
              onAdminClearRsvp={onAdminClearRsvp}
            />
          )}
          {notResponded.length > 0 && (
            <RiderList
              label="No Response"
              items={notResponded}
              color="text-muted-foreground"
              onAdminRsvp={onAdminRsvp}
              onAdminClearRsvp={onAdminClearRsvp}
            />
          )}
          {total === 0 && (
            <p className="text-sm text-muted-foreground">No riders in this group</p>
          )}
        </div>
      )}
    </div>
  );
}

function RiderList({
  label,
  items,
  color,
  currentStatus,
  onAdminRsvp,
  onAdminClearRsvp,
}: {
  label: string;
  items: RiderEntry[];
  color: string;
  currentStatus?: RsvpStatus;
  onAdminRsvp?: (riderId: string, isMinor: boolean, status: RsvpStatus) => void;
  onAdminClearRsvp?: (riderId: string, isMinor: boolean) => void;
}) {
  return (
    <div>
      <p className={`text-xs font-medium ${color}`}>
        {label} ({items.length})
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((r) =>
          onAdminRsvp ? (
            <RsvpPopover
              key={r.id}
              rider={r}
              currentStatus={currentStatus}
              onSelect={(status) => onAdminRsvp(r.id, r.is_minor, status)}
              onClear={onAdminClearRsvp ? () => onAdminClearRsvp(r.id, r.is_minor) : undefined}
            />
          ) : (
            <span
              key={r.id}
              className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs"
            >
              {r.name}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

const statusConfig: { value: RsvpStatus; label: string; className: string }[] = [
  { value: "yes", label: "Yes", className: "bg-green-600 hover:bg-green-700 text-white" },
  { value: "maybe", label: "Maybe", className: "bg-amber-500 hover:bg-amber-600 text-white" },
  { value: "no", label: "No", className: "bg-red-600 hover:bg-red-700 text-white" },
];

function RsvpPopover({
  rider,
  currentStatus,
  onSelect,
  onClear,
}: {
  rider: RiderEntry;
  currentStatus?: RsvpStatus;
  onSelect: (status: RsvpStatus) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs hover:bg-muted/80 hover:ring-1 hover:ring-primary/30 cursor-pointer transition-colors"
        >
          {rider.name}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <p className="mb-2 text-xs font-medium">{rider.name}</p>
        <div className="flex gap-1">
          {statusConfig.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={currentStatus === s.value ? "default" : "outline"}
              className={currentStatus === s.value ? s.className : "text-xs"}
              onClick={() => {
                onSelect(s.value);
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
