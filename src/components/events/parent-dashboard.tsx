"use client";

import { useAuth } from "@/hooks/use-auth";
import { useMyRsvps } from "@/hooks/use-rsvp";
import { Badge } from "@/components/ui/badge";
import type { RsvpStatus } from "@/types";

const statusColors: Record<string, string> = {
  yes: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  maybe: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  no: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function ParentDashboard({
  eventId,
  confirmedCount,
  totalCount,
}: {
  eventId: string;
  confirmedCount: number;
  totalCount: number;
}) {
  const { user } = useAuth();
  const { data: myRsvps } = useMyRsvps(eventId, user?.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          {confirmedCount} of {totalCount} riders confirmed
        </span>
      </div>

      {myRsvps?.minorRsvps && myRsvps.minorRsvps.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Your Children</p>
          {myRsvps.minorRsvps.map((rsvp) => {
            const rider = rsvp.riders as unknown as {
              first_name: string;
              last_name: string;
            };
            return (
              <div
                key={rsvp.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {rider?.first_name} {rider?.last_name}
                </span>
                <Badge
                  variant="outline"
                  className={statusColors[rsvp.status as RsvpStatus] ?? ""}
                >
                  {rsvp.status}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
