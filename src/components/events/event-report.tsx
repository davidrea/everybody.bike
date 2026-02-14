"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CircleOff,
  Cross,
  MapPin,
  Printer,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEventDashboard } from "@/hooks/use-event-dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SafetyIndicators } from "@/components/safety/safety-indicators";
import type { DashboardRiderEntry, DashboardRollModel, EventDashboardData } from "@/types";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTimeRange(event: EventDashboardData["event"]) {
  const start = formatDateTime(event.starts_at);
  if (!event.ends_at) return start;
  return `${start} – ${formatDateTime(event.ends_at)}`;
}

function StatusColumn({
  label,
  items,
  badgeClass,
  borderClass,
}: {
  label: string;
  items: DashboardRiderEntry[];
  badgeClass: string;
  borderClass: string;
}) {
  return (
    <div
      className={`rounded-lg border border-l-4 bg-white p-3 shadow-sm print:shadow-none ${borderClass}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wide ${badgeClass}`}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {items.length > 0 ? (
          items.map((rider) => (
            <li key={rider.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">{rider.name}</span>
              <SafetyIndicators
                medicalAlerts={rider.medical_alerts}
                mediaOptOut={rider.media_opt_out}
                iconClassName="h-3.5 w-3.5 print:h-3 print:w-3"
              />
            </li>
          ))
        ) : (
          <li className="text-xs text-muted-foreground">—</li>
        )}
      </ul>
    </div>
  );
}

function CoachColumn({
  label,
  items,
  badgeClass,
  borderClass,
}: {
  label: string;
  items: DashboardRollModel[];
  badgeClass: string;
  borderClass: string;
}) {
  return (
    <div
      className={`rounded-lg border border-l-4 bg-white p-3 shadow-sm print:shadow-none ${borderClass}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-wide ${badgeClass}`}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {items.length > 0 ? (
          items.map((coach) => (
            <li key={coach.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">{coach.full_name}</span>
              <SafetyIndicators
                medicalAlerts={coach.medical_alerts}
                mediaOptOut={coach.media_opt_out}
                iconClassName="h-3.5 w-3.5 print:h-3 print:w-3"
              />
            </li>
          ))
        ) : (
          <li className="text-xs text-muted-foreground">—</li>
        )}
      </ul>
    </div>
  );
}

export function EventReport({ eventId }: { eventId: string }) {
  const { isAdmin } = useAuth();
  const { data: dashboard, isLoading } = useEventDashboard(eventId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!dashboard) {
    return <p className="text-muted-foreground">Report not available.</p>;
  }

  if (!isAdmin()) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Admins only.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/events/${eventId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to event
          </Link>
        </Button>
      </div>
    );
  }

  const { event, riders_by_group: groups } = dashboard;
  const unassigned = dashboard.roll_models.confirmed_unassigned;
  const notResponded = dashboard.roll_models.not_responded;
  const declinedUnassigned = dashboard.roll_models.no.filter(
    (rm) => !rm.assigned_group_id,
  );
  const eventGroups = event.event_groups?.map((eg) => eg.groups).filter(Boolean) ?? [];

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/events/${eventId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to event
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" />
          Print report
        </Button>
      </div>

      <ReportHeader
        event={event}
        counts={dashboard.counts}
        eventGroups={eventGroups}
        className="print:hidden"
      />

      {(unassigned.length > 0 || declinedUnassigned.length > 0 || notResponded.length > 0) && (
        <section className="rounded-xl border bg-white p-4 shadow-sm print:hidden">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Roll Model Coverage
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3 print:grid-cols-3">
            <CoachColumn
              label="Confirmed Unassigned"
              items={unassigned}
              badgeClass="text-amber-700"
              borderClass="border-l-amber-600"
            />
            <CoachColumn
              label="Declined"
              items={declinedUnassigned}
              badgeClass="text-red-700"
              borderClass="border-l-red-600"
            />
            <CoachColumn
              label="No Response"
              items={notResponded}
              badgeClass="text-muted-foreground"
              borderClass="border-l-muted-foreground"
            />
          </div>
        </section>
      )}

      <div className="space-y-5 print:space-y-4">
        {groups.map((group, index) => {
          const total =
            group.confirmed.length +
            group.maybe.length +
            group.no.length +
            group.not_responded.length;
          return (
            <section
              key={group.group.id}
              className="report-page break-inside-avoid rounded-xl border bg-white p-5 shadow-sm print:shadow-none"
              style={{
                breakBefore: index === 0 ? "auto" : "page",
                breakAfter: "page",
              }}
            >
              <ReportHeader
                event={event}
                counts={dashboard.counts}
                eventGroups={eventGroups}
                className="mb-4 hidden print:block"
              />
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-4 w-4 rounded-full border-2"
                    style={{ borderColor: group.group.color }}
                  />
                  <div>
                    <h2 className="font-heading text-xl font-semibold">
                      {group.group.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {group.confirmed.length}/{total} riders confirmed
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Coaches confirmed: {group.coach_counts.confirmed} ·
                  Maybe: {group.coach_counts.maybe} · No: {group.coach_counts.no}
                </div>
              </header>

              <div className="mt-4 grid gap-3 md:grid-cols-3 print:grid-cols-3">
                <CoachColumn
                  label="Coaches Yes"
                  items={group.coaches.confirmed}
                  badgeClass="text-green-700"
                  borderClass="border-l-green-600"
                />
                <CoachColumn
                  label="Coaches Maybe"
                  items={group.coaches.maybe}
                  badgeClass="text-amber-700"
                  borderClass="border-l-amber-600"
                />
                <CoachColumn
                  label="Coaches No"
                  items={group.coaches.no}
                  badgeClass="text-red-700"
                  borderClass="border-l-red-600"
                />
              </div>

              <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-4 print:grid-cols-4">
                <StatusColumn
                  label="Yes"
                  items={group.confirmed}
                  badgeClass="text-green-700"
                  borderClass="border-l-green-600"
                />
                <StatusColumn
                  label="Maybe"
                  items={group.maybe}
                  badgeClass="text-amber-700"
                  borderClass="border-l-amber-600"
                />
                <StatusColumn
                  label="No"
                  items={group.no}
                  badgeClass="text-red-700"
                  borderClass="border-l-red-600"
                />
                <StatusColumn
                  label="No Response"
                  items={group.not_responded}
                  badgeClass="text-muted-foreground"
                  borderClass="border-l-muted-foreground"
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReportHeader({
  event,
  counts,
  eventGroups,
  className,
}: {
  event: EventDashboardData["event"];
  counts: EventDashboardData["counts"];
  eventGroups: EventDashboardData["event"]["event_groups"][number]["groups"][];
  className?: string;
}) {
  return (
    <header className={`rounded-xl border bg-white p-5 shadow-sm print:shadow-none ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {event.title}
            </h1>
            <Badge variant="outline" className="uppercase text-[10px] tracking-widest">
              Ride Report
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-4 w-4" />
              {formatDateTimeRange(event)}
            </span>
            {event.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {event.location}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" />
              {counts.confirmed_riders}/{counts.total_riders} riders
            </span>
          </div>
          {eventGroups.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {eventGroups.map((group) => (
                <Badge key={group.id} variant="outline" className="gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full border-2"
                    style={{ borderColor: group.color }}
                  />
                  {group.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold uppercase tracking-wide text-foreground">
            Legend
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-green-700" />
              Yes
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-600" />
              Maybe
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-red-600" />
              No
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-muted-foreground" />
              No response
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2">
              <Cross className="h-4 w-4 text-destructive" />
              Medical alert
            </span>
            <span className="inline-flex items-center gap-2">
              <CircleOff className="h-4 w-4 text-amber-600" />
              Media opt-out
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
