"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAdminRiders, useUpdateRiderGroup } from "@/hooks/use-admin-riders";
import { useGroups } from "@/hooks/use-groups";
import { useUsers } from "@/hooks/use-users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RiderAdultLinksDialog } from "./rider-adult-links-dialog";

export function RiderList() {
  const { data: riders, isLoading: ridersLoading } = useAdminRiders();
  const { data: groups, isLoading: groupsLoading } = useGroups();
  const { data: adults } = useUsers();
  const updateGroup = useUpdateRiderGroup();
  const [managingRiderId, setManagingRiderId] = useState<string | null>(null);

  const isLoading = ridersLoading || groupsLoading;
  const managingRider =
    riders?.find((rider) => rider.id === managingRiderId) ?? null;

  async function handleGroupChange(riderId: string, groupId: string) {
    try {
      await updateGroup.mutateAsync({ riderId, groupId });
      toast.success("Group updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update group",
      );
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Date of Birth</TableHead>
            <TableHead>Group</TableHead>
            <TableHead>Parents</TableHead>
            <TableHead className="w-28">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {riders?.map((rider) => (
            <TableRow key={rider.id}>
              <TableCell className="font-medium">
                {rider.first_name} {rider.last_name}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {rider.date_of_birth
                  ? new Date(rider.date_of_birth + "T00:00:00").toLocaleDateString()
                  : "—"}
              </TableCell>
              <TableCell>
                <Select
                  value={rider.group_id ?? ""}
                  onValueChange={(val) => handleGroupChange(rider.id, val)}
                  disabled={updateGroup.isPending}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Assign group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups?.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: g.color }}
                          />
                          {g.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {rider.parents.map((p) => (
                    <Badge key={p.id} variant="outline" className="text-xs">
                      {p.full_name}
                      {p.is_primary ? (
                        <>
                          <span
                            className="ml-1 inline-block h-2 w-2 rounded-full bg-sky-500"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Primary</span>
                        </>
                      ) : null}
                    </Badge>
                  ))}
                  {rider.parents.length === 0 && (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setManagingRiderId(rider.id)}
                >
                  <Link2 className="mr-1 h-4 w-4" />
                  Manage
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {riders?.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-8 text-center text-muted-foreground"
              >
                No minor riders found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <RiderAdultLinksDialog
        open={!!managingRider}
        onOpenChange={(open) => !open && setManagingRiderId(null)}
        rider={managingRider}
        adults={adults}
      />
    </div>
  );
}
