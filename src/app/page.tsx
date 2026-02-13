"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import {
  Calendar,
  Users,
  Bell,
  ArrowRight,
  Bike,
  GraduationCap,
  PartyPopper,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUpcomingEvents } from "@/hooks/use-events";
import { useAuth } from "@/hooks/use-auth";
import { EventCard } from "@/components/events/event-card";
import type { EventWithGroups } from "@/types";
import Link from "next/link";

const eventTypeLabels: Record<string, string> = {
  ride: "Ride",
  clinic: "Clinic",
  social: "Social",
  meeting: "Meeting",
  other: "Event",
};

const eventTypeIcons: Record<string, React.ElementType> = {
  ride: Bike,
  clinic: GraduationCap,
  social: PartyPopper,
  meeting: Users,
  other: HelpCircle,
};

function findTodayEvent(events: EventWithGroups[] | undefined): EventWithGroups | undefined {
  if (!events?.length) return undefined;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return events.find((e) => {
    const s = new Date(e.starts_at);
    return s.getFullYear() === y && s.getMonth() === m && s.getDate() === d;
  });
}

export default function DashboardPage() {
  const { profile, loading: authLoading, isAdmin, hasRole } = useAuth();
  const { data: upcomingEvents, isLoading: eventsLoading } =
    useUpcomingEvents(5);

  const todayEvent = useMemo(() => findTodayEvent(upcomingEvents), [upcomingEvents]);

  const isLoading = authLoading || eventsLoading;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            {profile
              ? `Welcome back, ${profile.full_name.split(" ")[0]}`
              : "Welcome to everybody.bike"}
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Upcoming Events
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <>
                  <p className="text-2xl font-bold">
                    {upcomingEvents?.length ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Coming up</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Your Roles</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <>
                  <p className="text-2xl font-bold">
                    {profile?.roles?.length ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile?.roles
                      ?.map((r) =>
                        r
                          .replace("_", " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase()),
                      )
                      .join(", ") ?? "None"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
              {todayEvent && (() => {
                const TodayIcon = eventTypeIcons[todayEvent.type] ?? HelpCircle;
                const label = eventTypeLabels[todayEvent.type] ?? "Event";
                return (
                  <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                    <Link href={`/events/${todayEvent.id}`}>
                      <TodayIcon className="mr-2 h-4 w-4" />
                      Today&apos;s {label}
                    </Link>
                  </Button>
                );
              })()}
              {isAdmin() && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link href="/events/new">
                    <Calendar className="mr-2 h-4 w-4" />
                    Create Event
                  </Link>
                </Button>
              )}
              {(hasRole("roll_model") || hasRole("rider")) && upcomingEvents?.[0] && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link href={`/events/${upcomingEvents[0].id}`}>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    RSVP to Next Event
                  </Link>
                </Button>
              )}
              {hasRole("parent") && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <Link href="/events">
                    <ArrowRight className="mr-2 h-4 w-4" />
                    View Events
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Events */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-xl font-semibold">
              Upcoming Events
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/events">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : upcomingEvents && upcomingEvents.length > 0 ? (
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No upcoming events. {isAdmin() && "Create one to get started!"}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
